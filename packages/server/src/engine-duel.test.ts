import { beforeEach, describe, expect, it } from "vitest";
import { type World, buildWorld } from "./test-world.js";

let w: World;
let matchId: string;
const RED = ["ada", "bob"];
const BLUE = ["cleo", "dan"];

beforeEach(() => {
  w = buildWorld();
  const must = <T>(r: { ok: true; value: T } | { ok: false; error: string; detail?: string }): T => {
    if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ""}`);
    return r.value;
  };
  const inst = must(
    w.admin.library.createInstance({
      typeId: "vero-falso",
      title: "Raffica duello",
      config: { statements: [{ text: "Il mare è salato.", answer: true }], timeSec: 5, revealSec: 1 },
    }),
  );
  const match = must(w.admin.createMatch(w.event.id, { name: "Duello", mode: "knight-duel" }));
  must(
    w.admin.patchMatch(match.id, {
      modeConfig: { sideA: w.red.id, sideB: w.blue.id, pool: [inst.id], hp: 10, minigamesPerBattle: 1, maxBattles: 3, draftSeconds: 5, battleSeconds: 5 },
    }),
  );
  matchId = match.id;
});

const start = () => w.engine.hostCommand({ type: "start", matchId });
const next = () => w.engine.hostCommand({ type: "engine", action: "next" });
const view = (nick: string) => (w.engine.playerState(w.ids[nick]!).frame?.view ?? null) as Record<string, any> | null;
const send = (nick: string, input: unknown) => w.engine.input(w.ids[nick]!, input, w.clock.t - 10);
const all = [...RED, ...BLUE];

/** Un passo di gioco per ogni telefono, in base alla fase del duello (i Rossi rispondono giusto, i Blu sbagliato). */
function act() {
  const phase = view("ada")?.phase as string | undefined;
  for (const nick of all) {
    const v = view(nick);
    if (!v) continue;
    if (v.phase === "minigame") send(nick, { type: "child", input: { type: "answer", value: RED.includes(nick) } });
    if (v.phase === "draft" && v.draft?.role === "picker") {
      send(nick, { type: "draft-cast", uid: v.draft.cards[0].uid });
      send(nick, { type: "draft-confirm" });
    }
    if (v.phase === "battle" && v.battle?.vote) {
      const first = v.battle.vote.options[0];
      if (first) send(nick, { type: "vote-cast", uid: first });
      send(nick, { type: "vote-confirm" });
    }
  }
  if (phase === "ended") w.engine.hostCommand({ type: "plugin", command: { type: "end" } });
}

function playUntilResults(maxSteps = 400) {
  const seen = new Set<string>();
  for (let i = 0; i < maxSteps && w.engine.screenState().phase === "round"; i++) {
    w.clock.t += 1_500;
    w.engine.tick();
    const phaseOf = () => (w.engine.screenState().frame?.view as { phase?: string } | undefined)?.phase;
    if (phaseOf()) seen.add(phaseOf()!); // anche la fase in cui il passo comincia (l'ultima si chiude nello stesso passo)
    act();
    w.engine.tick();
    if (phaseOf()) seen.add(phaseOf()!);
  }
  return seen;
}

describe("Engine: partita in modalità duello", () => {
  it("la partita non ha round, ma parte: il duello è un unico round che contiene tutto", () => {
    expect(start()).toEqual({ ok: true });
    expect(w.engine.screenState()).toMatchObject({ phase: "ready", roundCount: 1 });
    expect(next()).toEqual({ ok: true });
    const screen = w.engine.screenState();
    expect(screen.frame).toMatchObject({ typeId: "knight-duel", theme: "pixel" });
    expect((screen.frame!.view as any).sides.map((s: any) => [s.name.startsWith("Rossi"), s.hp])).toEqual([[true, 10], [false, 10]]);
  });

  it("si gioca un duello intero e solo l'esito dà punti serata: 500 ai vincitori, 100 ai perdenti", () => {
    start();
    next();
    const seen = playUntilResults();
    expect(w.engine.screenState().phase).toBe("results");
    expect([...seen]).toEqual(expect.arrayContaining(["minigame", "draft", "battle", "battle-result", "ended"]));

    const lb = w.scores.leaderboards(w.event.id);
    const pts = Object.fromEntries(lb.players.map((p) => [p.name, p.points]));
    const winners = RED.every((n) => pts[n] === 500) ? RED : BLUE;
    const losers = winners === RED ? BLUE : RED;
    for (const n of winners) expect(pts[n]).toBe(500);
    for (const n of losers) expect(pts[n]).toBe(100);
    // il minigioco interno non ha lasciato punti in classifica: solo due voci per giocatore al massimo
    const rows = w.db.$client.prepare("select reason from score_entries where match_id = ?").all(matchId) as { reason: string }[];
    expect(rows.map((r) => r.reason).sort()).toEqual(["Duello: partecipazione", "Duello: partecipazione", "Duello: vittoria", "Duello: vittoria"]);
    // dopo i risultati si può concludere la partita
    expect(w.engine.hostCommand({ type: "engine", action: "next" })).toEqual({ ok: true });
    expect(w.engine.screenState().phase).toBe("ended");
  });

  it("nessuna informazione privata passa dallo schermo o da un team all'altro, in nessuna fase", () => {
    start();
    next();
    const secrets = new Set<string>();
    for (let i = 0; i < 400 && w.engine.screenState().phase === "round"; i++) {
      w.clock.t += 1_500;
      w.engine.tick();
      act();
      w.engine.tick();

      // raccoglie le carte in mano a ciascun team (uid) e verifica che l'altro team e lo schermo non le vedano
      const handOf = (nick: string) => ((view(nick)?.hand ?? []) as { uid: string }[]).map((c) => c.uid);
      const redUids = handOf("ada");
      const blueUids = handOf("cleo");
      const screen = JSON.stringify(w.engine.screenState());
      for (const uid of [...redUids, ...blueUids]) {
        secrets.add(uid);
        expect(screen, `schermo non deve contenere ${uid}`).not.toContain(uid);
      }
      for (const uid of redUids) expect(JSON.stringify(view("cleo")), `blu non deve vedere ${uid}`).not.toContain(uid);
      for (const uid of blueUids) expect(JSON.stringify(view("ada")), `rossi non devono vedere ${uid}`).not.toContain(uid);
      // anche la vista della regia (info + azioni) non contiene mani né voti
      const host = JSON.stringify(w.engine.adminState().host);
      for (const uid of [...redUids, ...blueUids]) expect(host).not.toContain(uid);
    }
    expect(secrets.size).toBeGreaterThan(0); // il test ha visto davvero delle mani
  });

  it("la configurazione sbagliata viene spiegata all'avvio (sfidanti fuori serata, nessun minigioco)", () => {
    const patch = (cfg: unknown) => w.admin.patchMatch(matchId, { modeConfig: cfg });
    expect(patch({ sideA: "x", sideB: "y", pool: [] })).toMatchObject({ ok: false, error: "invalid" }); // pool vuoto: rifiutata subito

    patch({ sideA: w.red.id, sideB: "squadra-inesistente", pool: ["istanza-inesistente"] });
    expect(start()).toMatchObject({ ok: false, error: expect.stringContaining("non fa parte della serata") });

    patch({ sideA: w.red.id, sideB: w.blue.id, pool: ["istanza-inesistente"] });
    expect(start()).toMatchObject({ ok: false, error: expect.stringContaining("non utilizzabile") });
  });

  it("una modalità sconosciuta o una partita senza configurazione non si avvia", () => {
    const empty = w.admin.createMatch(w.event.id, { name: "Vuoto", mode: "knight-duel" });
    if (!empty.ok) throw new Error();
    expect(w.engine.startMatch(empty.value.id)).toMatchObject({ ok: false });
  });
});
