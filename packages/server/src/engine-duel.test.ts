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
  // Il duello è un'istanza della libreria come le altre: si aggiunge come round di una partita.
  const duel = must(
    w.admin.library.createInstance({
      typeId: "knight-duel",
      title: "Duello di prova",
      config: { pool: [inst.id], hp: 10, minigamesPerBattle: 1, maxBattles: 3, draftSeconds: 5, battleSeconds: 5 },
    }),
  );
  const match = must(w.admin.createMatch(w.event.id, { name: "Duello" }));
  must(w.admin.library.addRound(match.id, duel.id));
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

describe("Engine: round duello", () => {
  it("il duello è un round come gli altri; gli sfidanti sono le prime due squadre della serata per nome", () => {
    expect(start()).toEqual({ ok: true });
    expect(w.engine.screenState()).toMatchObject({ phase: "ready", roundCount: 1 });
    expect(next()).toEqual({ ok: true });
    const screen = w.engine.screenState();
    expect(screen.frame).toMatchObject({ typeId: "knight-duel", theme: "pixel" });
    expect((screen.frame!.view as any).sides.map((s: any) => [s.name.startsWith("Blu"), s.hp])).toEqual([[true, 10], [false, 10]]);
  });

  it("un duello può stare in una partita insieme ad altri round", () => {
    const quiz = w.admin.library.listInstances().find((i) => i.typeId === "vero-falso")!;
    const m = w.admin.createMatch(w.event.id, { name: "Mista" });
    if (!m.ok) throw new Error();
    w.admin.library.addRound(m.value.id, quiz.id);
    const duel = w.admin.library.listInstances().find((i) => i.typeId === "knight-duel")!;
    w.admin.library.addRound(m.value.id, duel.id);
    expect(w.engine.startMatch(m.value.id)).toEqual({ ok: true });
    expect(w.engine.screenState()).toMatchObject({ roundCount: 2 });
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

  it("la configurazione sbagliata viene spiegata (istanze nel form, minigioco mancante, serata senza due squadre)", () => {
    const create = (config: unknown) => w.admin.library.createInstance({ typeId: "knight-duel", title: "D", config });
    expect(create({ pool: [] })).toMatchObject({ ok: false, error: "invalid" }); // pool vuoto: rifiutata subito

    const missing = create({ pool: ["istanza-inesistente"] });
    if (!missing.ok) throw new Error();
    const m = w.admin.createMatch(w.event.id, { name: "Rotta" });
    if (!m.ok) throw new Error();
    w.admin.library.addRound(m.value.id, missing.value.id);
    expect(w.engine.startMatch(m.value.id)).toMatchObject({ ok: false, error: expect.stringContaining("non utilizzabile") });

    // una sola squadra in serata: il duello tra squadre non può partire
    w.admin.setEventTeams(w.event.id, [w.red.id]);
    expect(start()).toMatchObject({ ok: false, error: expect.stringContaining("almeno due squadre") });
  });

  it("il duello tra giocatori estrae due giocatori della serata", () => {
    const quiz = w.admin.library.listInstances().find((i) => i.typeId === "vero-falso")!;
    const duel = w.admin.library.createInstance({ typeId: "knight-duel", title: "Singolo", config: { kind: "players", pool: [quiz.id] } });
    if (!duel.ok) throw new Error();
    const m = w.admin.createMatch(w.event.id, { name: "Singoli" });
    if (!m.ok) throw new Error();
    w.admin.library.addRound(m.value.id, duel.value.id);
    expect(w.engine.startMatch(m.value.id)).toEqual({ ok: true });
    w.engine.hostCommand({ type: "engine", action: "next" });
    const sides = (w.engine.screenState().frame!.view as any).sides as { name: string }[];
    expect(new Set(sides.map((s) => s.name)).size).toBe(2);
    expect(sides.every((s) => ["ada", "bob", "cleo", "dan"].includes(s.name))).toBe(true);
  });
});
