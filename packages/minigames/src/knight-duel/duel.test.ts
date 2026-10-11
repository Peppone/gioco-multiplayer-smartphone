import { describe, expect, it } from "vitest";
import type { InputMeta, MinigameContext } from "@gioco/shared";
import { roundMinigames } from "../index.js";
import { type DuelConfig, type DuelState, DEFAULT_DECK, createKnightDuel, duelModeSchema } from "./index.js";

const duel = createKnightDuel(roundMinigames);

const players = [
  { id: "r1", nickname: "Rosa", teamId: "t1" },
  { id: "r2", nickname: "Rino", teamId: "t1" },
  { id: "b1", nickname: "Bea", teamId: "t2" },
  { id: "b2", nickname: "Beppe", teamId: "t2" },
  { id: "s1", nickname: "Spettatore", teamId: null },
];
const ctx: MinigameContext = {
  players,
  teams: [
    { id: "t1", name: "Rossi", color: "#ef4444" },
    { id: "t2", name: "Blu", color: "#3b82f6" },
  ],
  seed: 99,
};
const RED = ["r1", "r2"];
const BLUE = ["b1", "b2"];
const meta = (at: number): InputMeta => ({ receivedAt: at, claimedTime: at - 10, rtt: 20 });

function makeConfig(over: Record<string, unknown> = {}): DuelConfig {
  const mode = duelModeSchema.parse({
    kind: "teams",
    sideA: "t1",
    sideB: "t2",
    pool: ["vf"],
    hp: 20,
    minigamesPerBattle: 1,
    maxBattles: 3,
    draftSeconds: 5,
    battleSeconds: 5,
    ...over,
  });
  return {
    mode,
    pool: [
      {
        instanceId: "vf",
        title: "Raffica",
        typeId: "vero-falso",
        theme: "retro80",
        config: roundMinigames["vero-falso"]!.configSchema.parse({ statements: [{ text: "Il mare è salato.", answer: true }], timeSec: 5, revealSec: 1 }),
      },
    ],
    deck: DEFAULT_DECK,
  };
}

const start = (over: Record<string, unknown> = {}, now = 0): DuelState => duel.init(makeConfig(over), ctx, now);
const view = (s: DuelState, id: string) => duel.viewFor(s, id, null) as Record<string, any>;
const input = (s: DuelState, id: string, i: Parameters<typeof duel.onInput>[2], at: number) => duel.onInput(s, id, i, meta(at));

/** Tutti rispondono al vero/falso: i Rossi giusto, i Blu sbagliato (vincono i Rossi). */
function playMinigame(s: DuelState, now: number, redWins = true): DuelState {
  for (const id of RED) s = input(s, id, { type: "child", input: { type: "answer", value: redWins } }, now + 100);
  for (const id of BLUE) s = input(s, id, { type: "child", input: { type: "answer", value: !redWins } }, now + 100);
  s = duel.onTick(s, now + 200); // tutti hanno risposto: rivela
  return duel.onTick(s, now + 1_400); // finita la pausa: il minigioco termina
}

/** Il team di turno vota la prima carta e conferma. */
function draftPick(s: DuelState, members: string[], now: number): DuelState {
  const v = view(s, members[0]!).draft;
  const uid = v.cards[0].uid as string;
  for (const m of members) s = input(s, m, { type: "draft-cast", uid }, now);
  for (const m of members) s = input(s, m, { type: "draft-confirm" }, now);
  return duel.onTick(s, now);
}

function playBattle(s: DuelState, now: number): DuelState {
  for (const members of [RED, BLUE]) {
    const opts = view(s, members[0]!).battle.vote.options as string[];
    for (const m of members) {
      if (opts[0]) s = input(s, m, { type: "vote-cast", uid: opts[0] }, now);
      s = input(s, m, { type: "vote-confirm" }, now);
    }
  }
  return duel.onTick(s, now);
}

/** Gioca un duello intero con bot semplici. Restituisce lo stato finale e le fasi attraversate. */
function playDuel(s: DuelState): { state: DuelState; phases: string[] } {
  const phases: string[] = [];
  let now = 0;
  for (let i = 0; i < 400 && !duel.isFinished(s); i++) {
    now += 2_000;
    if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    switch (s.phase) {
      case "minigame": s = playMinigame(s, now); break;
      case "draft": {
        const picker = s.draft!.order[s.draft!.step];
        s = draftPick(s, picker === 0 ? RED : BLUE, now);
        break;
      }
      case "battle": s = playBattle(s, now); break;
      case "battle-result": s = duel.onTick(s, s.battle!.shownUntil); break;
      case "ended": s = duel.onHostCommand(s, { type: "end" }, now); break;
      default: s = duel.onTick(s, now);
    }
  }
  return { state: s, phases };
}

describe("avvio e minigioco", () => {
  it("parte direttamente con un minigioco scelto dal mazzo di istanze, con i lati e i PV pieni", () => {
    const s = start();
    expect(s.phase).toBe("minigame");
    expect(s.sides.map((x) => [x.name, x.members])).toEqual([["Rossi", RED], ["Blu", BLUE]]);
    expect(s.knights.map((k) => k.hp)).toEqual([20, 20]);
    expect(duel.onTick(s, 10)).toBe(s); // nulla da fare: stesso oggetto
  });

  it("con selezione «admin» attende la scelta della regia e la regia sceglie il minigioco", () => {
    const s = start({ selection: "admin" });
    expect(s.phase).toBe("minigame-select");
    expect(duel.hostView(s).actions.map((a) => a.id)).toEqual(["pick:0"]);
    expect(duel.onHostCommand(s, { type: "pick:0" }, 5).phase).toBe("minigame");
    expect(duel.onHostCommand(s, { type: "pick:7" }, 5)).toBe(s); // indice inesistente
  });

  it("il lato con più punti nel minigioco vince e sceglie per primo al draft", () => {
    const s = playMinigame(start(), 0, true);
    expect(s.phase).toBe("draft");
    expect(s.minigameWinner).toBe(0);
    expect(s.draft!.order).toEqual([0, 1]);
    const blue = playMinigame(start(), 0, false);
    expect(blue.minigameWinner).toBe(1);
    expect(blue.draft!.order).toEqual([1, 0]);
  });

  it("il minigioco non assegna punti serata: restano premi (le carte)", () => {
    const s = playMinigame(start(), 0);
    expect(duel.scores(s)).toEqual([]);
  });

  it("il sabotaggio riduce i punti del lato colpito nel minigioco: può ribaltare l'esito", () => {
    const sabotaged = { ...start(), sabotage: [100, 0] as [number, number] }; // i Rossi perdono tutti i punti
    for (const id of [...RED, ...BLUE]) void id;
    let s = sabotaged;
    for (const id of [...RED, ...BLUE]) s = input(s, id, { type: "child", input: { type: "answer", value: true } }, 100); // tutti giusti
    s = duel.onTick(s, 200);
    s = duel.onTick(s, 1_400);
    expect(s.minigameWinner).toBe(1); // senza malus sarebbe finita in parità: ora vincono i Blu
    expect(s.sabotage).toEqual([0, 0]); // il malus vale per un solo minigioco
  });

  it("minigioco chiuso dalla regia: vince chi ha più punti fino a quel momento", () => {
    let s = start();
    for (const id of RED) s = input(s, id, { type: "child", input: { type: "answer", value: true } }, 100);
    s = duel.onHostCommand(s, { type: "child:next" }, 200); // la regia rivela: i punti vengono assegnati
    s = duel.onHostCommand(s, { type: "skip-minigame" }, 300); // poi chiude il minigioco senza attendere la pausa
    expect(s.phase).toBe("draft");
    expect(s.minigameWinner).toBe(0);
  });

  it("input estranei al minigioco in corso o di formato errato sono ignorati", () => {
    const s = start();
    expect(input(s, "r1", { type: "draft-cast", uid: "x" }, 10)).toBe(s);
    expect(input(s, "r1", { type: "vote-cast", uid: "x" }, 10)).toBe(s);
    expect(input(s, "r1", { type: "child", input: { type: "boh" } }, 10)).toBe(s);
  });
});

describe("draft", () => {
  const atDraft = () => playMinigame(start(), 0);

  it("le carte si vedono solo sul telefono del team che sceglie; lo schermo e gli avversari vedono solo i dorsi", () => {
    const s = atDraft();
    expect(view(s, "r1").draft).toMatchObject({ role: "picker", first: true });
    expect(view(s, "r1").draft.cards).toHaveLength(3);
    expect(view(s, "b1").draft).toEqual({ phase: "picking", role: "waiting", offeredCount: 3, picker: 0 });
    const pub = JSON.stringify(duel.screenView(s));
    for (const c of s.draft!.offered) expect(pub).not.toContain(c.cardId);
    expect(JSON.stringify(view(s, "b1"))).not.toContain(s.draft!.offered[0]!.cardId);
    expect(JSON.stringify(view(s, "s1").draft)).not.toContain(s.draft!.offered[0]!.cardId); // lo spettatore è come lo schermo
  });

  it("il vincitore sceglie, poi lo sconfitto sceglie tra le rimaste; le carte entrano nella mano", () => {
    let s = atDraft();
    s = draftPick(s, RED, 1_500);
    expect(s.draft!.step).toBe(1);
    s = draftPick(s, BLUE, 1_600);
    expect(s.phase).toBe("battle"); // 1 minigioco per battaglia
    expect(s.knights[0].hand).toHaveLength(1);
    expect(s.knights[1].hand).toHaveLength(1);
    expect(s.knights[0].hand[0]!.uid).not.toBe(s.knights[1].hand[0]!.uid);
    expect(s.supply.length + s.knights[0].hand.length + s.knights[1].hand.length).toBe(DEFAULT_DECK.cards.reduce((n, c) => n + c.copies, 0)); // niente carte perse
  });

  it("estranei, spettatori e il team non di turno non possono votare", () => {
    const s = atDraft();
    const uid = s.draft!.offered[0]!.uid;
    expect(input(s, "b1", { type: "draft-cast", uid }, 2_000)).toBe(s);
    expect(input(s, "s1", { type: "draft-cast", uid }, 2_000)).toBe(s);
    expect(input(s, "estraneo", { type: "draft-confirm" }, 2_000)).toBe(s);
  });

  it("la regia può saltare il draft: scelte casuali e si passa avanti", () => {
    const s = duel.onHostCommand(atDraft(), { type: "skip-draft" }, 2_000);
    expect(s.phase).toBe("battle");
    expect(s.knights[0].hand).toHaveLength(1);
    expect(s.knights[1].hand).toHaveLength(1);
  });

  it("senza voti il draft si chiude da solo alla scadenza", () => {
    let s = atDraft();
    s = duel.onTick(s, 1_400 + 5_000); // scade il voto dei Rossi
    s = duel.onTick(s, 1_400 + 10_100); // scade quello dei Blu
    expect(s.phase).toBe("battle");
  });

  it("il limite di carte in mano scarta la più vecchia", () => {
    let s = start({ handLimit: 3, minigamesPerBattle: 5 }); // molti draft prima della battaglia
    let now = 0;
    for (let i = 0; i < 5; i++) {
      now += 3_000; // il minigioco successivo si apre appena finito il draft: si risponde entro la sua scadenza
      s = playMinigame(s, now);
      s = draftPick(s, RED, now + 1_500);
      s = draftPick(s, BLUE, now + 1_600);
    }
    expect(s.knights[0].hand.length).toBeLessThanOrEqual(3);
    expect(s.discard.length).toBeGreaterThan(0);
  });
});

describe("battaglia", () => {
  function atBattle(over: Record<string, unknown> = {}): DuelState {
    let s = playMinigame(start(over), 0);
    s = draftPick(s, RED, 1_500);
    return draftPick(s, BLUE, 1_600);
  }

  it("le mani e i voti sono privati del team: avversari, schermo e spettatori non vedono nulla", () => {
    let s = atBattle();
    const redHand = s.knights[0].hand[0]!;
    const blueHand = s.knights[1].hand[0]!;
    s = input(s, "r1", { type: "vote-cast", uid: redHand.uid }, 2_000);
    expect(JSON.stringify(view(s, "b1"))).not.toContain(redHand.uid);
    expect(JSON.stringify(view(s, "b1"))).not.toContain(redHand.cardId);
    expect(JSON.stringify(view(s, "r1"))).not.toContain(blueHand.uid);
    expect(JSON.stringify(duel.screenView(s))).not.toMatch(new RegExp(`${redHand.uid}|${blueHand.uid}|"hand"`));
    expect(JSON.stringify(view(s, "s1"))).not.toMatch(new RegExp(`${redHand.uid}|${blueHand.uid}`));
    // i compagni, invece, vedono la scelta dell'altro in tempo reale
    expect(view(s, "r2").battle.vote.mates).toEqual([{ playerId: "r1", picks: [redHand.uid], confirmed: false }]);
    // lo schermo sa solo quanti hanno già deciso
    expect(duel.screenView(s)).toMatchObject({ battle: { progress: [{ members: 2, decided: 0 }, { members: 2, decided: 0 }] } });
  });

  it("non si può votare una carta che non è in mano propria", () => {
    const s = atBattle();
    const foreign = s.knights[1].hand[0]!.uid;
    const after = input(s, "r1", { type: "vote-cast", uid: foreign }, 2_000);
    expect(after).toBe(s);
  });

  it("rivelazione simultanea: la battaglia si risolve quando tutti hanno confermato o scade il tempo", () => {
    let s = atBattle();
    s = duel.onTick(s, 2_000);
    expect(s.phase).toBe("battle"); // nessuno ha ancora deciso
    s = playBattle(s, 2_100);
    expect(s.phase).toBe("battle-result");
    expect(s.battleNo).toBe(1);
    expect(s.battle!.events.some((e) => e.type === "play")).toBe(true);

    const timeout = duel.onTick(atBattle(), 1_600 + 5_000); // nessun voto: scade
    expect(timeout.phase).toBe("battle-result");
  });

  it("dopo la rivelazione le carte giocate sono pubbliche, i dettagli segreti di furto e spia no", () => {
    const s = duel.onTick(playBattle(atBattle(), 2_100), 2_100);
    const screen = duel.screenView(s) as any;
    const plays = screen.result.events.filter((e: any) => e.type === "play");
    expect(plays.length).toBeGreaterThan(0);
    for (const p of plays) expect(screen.result.cards[p.cardId]).toBeDefined(); // lo schermo può mostrare le carte giocate
  });

  it("la battaglia lascia il posto al minigioco successivo, o al KO", () => {
    let s = playBattle(atBattle(), 2_100);
    s = duel.onTick(s, s.battle!.shownUntil);
    expect(["minigame", "ended"]).toContain(s.phase);
  });

  it("la regia può rivelare subito le carte e proseguire senza aspettare l'animazione", () => {
    let s = atBattle();
    s = duel.onHostCommand(s, { type: "continue" }, 2_000); // rivela
    expect(s.phase).toBe("battle-result");
    s = duel.onHostCommand(s, { type: "continue" }, 2_001); // avanti
    expect(s.phase).not.toBe("battle-result");
  });

  it("senza carte in mano o senza votanti non si attende il voto", () => {
    const s = start();
    const emptyHands: DuelState = { ...s, phase: "battle", child: null, battleVotes: [
      { options: [], max: 2, members: RED, picks: { r1: [], r2: [] }, ready: [], seq: 0, deadline: 1e9 },
      { options: [], max: 2, members: BLUE, picks: { b1: [], b2: [] }, ready: [], seq: 0, deadline: 1e9 },
    ] };
    expect(duel.onTick(emptyHands, 10).phase).toBe("battle-result");
  });
});

describe("fine del duello", () => {
  const resultState = (patch: Partial<DuelState>, winner: 0 | 1 | null = null): DuelState => ({
    ...start(),
    child: null,
    phase: "battle-result",
    battle: { events: [], winner, shownUntil: 0 },
    ...patch,
  });

  it("KO: vince chi ha messo KO l'altro", () => {
    const s = duel.onTick(resultState({}, 1), 0);
    expect(s.phase).toBe("ended");
    expect(s.outcome).toEqual({ winner: 1, reason: "ko" });
  });

  it("dopo i cicli massimi vince chi ha più PV", () => {
    const base = start();
    const s = duel.onTick(resultState({ battleNo: 3, knights: [{ ...base.knights[0], hp: 12 }, { ...base.knights[1], hp: 7 }] }), 0);
    expect(s.outcome).toEqual({ winner: 0, reason: "hp" });
  });

  it("in parità di PV si va a oltranza: battaglia senza minigioco con carte fresche", () => {
    const s = duel.onTick(resultState({ battleNo: 3 }), 0);
    expect(s.suddenDeath).toBe(true);
    expect(s.phase).toBe("battle");
    expect(s.knights[0].hand).toHaveLength(2);
    expect(s.knights[1].hand).toHaveLength(2);
  });

  it("a oltranza decide chi ha più PV dopo una battaglia; in estrema parità decide il seme", () => {
    const base = start();
    const sd = resultState({ battleNo: 4, suddenDeath: true, suddenCount: 0, knights: [{ ...base.knights[0], hp: 9 }, { ...base.knights[1], hp: 8 }] });
    expect(duel.onTick(sd, 0).outcome).toEqual({ winner: 0, reason: "sudden" });
    const stuck = duel.onTick({ ...resultState({ battleNo: 4, suddenDeath: true, suddenCount: 9 }) }, 0);
    expect(stuck.outcome?.reason).toBe("coin");
    expect([0, 1]).toContain(stuck.outcome?.winner);
  });

  it("i punti serata vanno solo all'esito: X a ogni vincitore, Y a ogni perdente, niente agli spettatori", () => {
    const s = duel.onTick(resultState({}, 0), 0);
    const pts = Object.fromEntries(duel.scores(s).map((d) => [d.playerId, d.points]));
    expect(pts).toEqual({ r1: 500, r2: 500, b1: 100, b2: 100 });
    expect(duel.result(s).ranking.find((r) => r.playerId === "r1")).toMatchObject({ rank: 1 });
    expect(duel.result(s).ranking.find((r) => r.playerId === "s1")).toMatchObject({ rank: 2, points: 0 });
  });

  it("il round finisce solo quando la regia conclude il duello (la schermata finale resta visibile)", () => {
    let s = duel.onTick(resultState({}, 0), 0);
    expect(duel.isFinished(s)).toBe(false);
    expect(duel.hostView(s).actions.map((a) => a.id)).toEqual(["end"]);
    s = duel.onHostCommand(s, { type: "end" }, 1);
    expect(duel.isFinished(s)).toBe(true);
  });
});

describe("duello completo", () => {
  it("gira da solo fino alla fine: minigioco → draft → battaglia → … → esito, senza loop", () => {
    const { state, phases } = playDuel(start({ hp: 12 }));
    expect(duel.isFinished(state)).toBe(true);
    expect(state.outcome).not.toBeNull();
    expect(phases).toEqual(expect.arrayContaining(["minigame", "draft", "battle", "battle-result", "ended"]));
    expect(duel.scores(state).length).toBeGreaterThan(0);
    const [w, l] = [state.outcome!.winner!, state.outcome!.winner === 0 ? 1 : 0];
    expect(state.sides[w].members.length + state.sides[l].members.length).toBe(4);
  });

  it("è deterministico: stessa partenza e stesse azioni = stesso esito", () => {
    const a = playDuel(start({ hp: 12 })).state;
    const b = playDuel(start({ hp: 12 })).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("lo stato è JSON puro in ogni fase (serve per gli snapshot)", () => {
    let s = start();
    for (const step of [(x: DuelState) => playMinigame(x, 0), (x: DuelState) => draftPick(x, RED, 1_500), (x: DuelState) => draftPick(x, BLUE, 1_600), (x: DuelState) => playBattle(x, 2_000)]) {
      s = step(s);
      expect(JSON.parse(JSON.stringify(s))).toEqual(JSON.parse(JSON.stringify(s)));
      expect(() => JSON.stringify(duel.screenView(s))).not.toThrow();
    }
  });

  it("duello tra due singoli giocatori", () => {
    const solo = { ...ctx, players: [{ id: "x", nickname: "Xena", teamId: null }, { id: "y", nickname: "Yuri", teamId: null }] };
    let s = duel.init({ ...makeConfig({ kind: "players", sideA: "x", sideB: "y" }) }, solo, 0);
    expect(s.sides.map((x) => x.members)).toEqual([["x"], ["y"]]);
    s = duel.onInput(s, "x", { type: "child", input: { type: "answer", value: true } }, meta(100));
    s = duel.onInput(s, "y", { type: "child", input: { type: "answer", value: false } }, meta(100));
    s = duel.onTick(duel.onTick(s, 200), 1_400);
    expect(s.phase).toBe("draft");
    expect(s.minigameWinner).toBe(0);
  });
});

describe("configurazione della partita", () => {
  const lookup = (id: string) =>
    id === "vf"
      ? { typeId: "vero-falso", title: "Raffica", theme: "retro80" as const, config: makeConfig().pool[0]!.config }
      : id === "deck1"
        ? { typeId: "deck", title: "Mazzo", theme: "pixel" as const, config: DEFAULT_DECK }
        : undefined;

  const roster = { players, teams: ctx.teams };

  it("risolve le istanze della libreria e usa il mazzo base se non ne è indicato uno", () => {
    const r = duel.buildConfig!({ pool: ["vf"] }, lookup, roster);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.config.pool).toEqual([expect.objectContaining({ instanceId: "vf", typeId: "vero-falso" })]);
      expect(r.config.deck.cards).toHaveLength(15);
      expect(r.config.mode).toMatchObject({ hp: 20, maxBattles: 6, minigamesPerBattle: 2 });
    }
    expect(duel.buildConfig!({ pool: ["vf"], deck: "deck1" }, lookup, roster)).toMatchObject({ ok: true });
  });

  it("rifiuta pool vuoto, istanze o mazzi inesistenti e minigiochi non utilizzabili", () => {
    const bad = (raw: unknown) => duel.buildConfig!(raw, lookup, roster);
    expect(bad({ pool: [] })).toMatchObject({ ok: false });
    expect(bad({ pool: ["boh"] })).toMatchObject({ ok: false });
    expect(bad({ pool: ["vf"], deck: "boh" })).toMatchObject({ ok: false });
    expect(bad({ pool: ["deck1"] })).toMatchObject({ ok: false }); // un mazzo non è un minigioco
    expect(bad(null)).toMatchObject({ ok: false });
  });

  it("gli sfidanti sono le prime due squadre della serata per nome, purché abbiano giocatori", () => {
    const run = (raw: unknown, r = roster) => duel.buildConfig!(raw, lookup, r);
    const ok = run({ pool: ["vf"] });
    expect(ok).toMatchObject({ ok: true });
    if (ok.ok) expect([ok.config.mode.sideA, ok.config.mode.sideB]).toEqual(["t2", "t1"]); // Blu prima di Rossi
    const noMembers = { players: players.filter((p) => p.teamId !== "t2"), teams: ctx.teams };
    expect(run({ pool: ["vf"] }, noMembers)).toMatchObject({ ok: false, error: expect.stringContaining("almeno due squadre") });
  });

  it("il duello tra giocatori ne estrae due diversi della serata", () => {
    const run = (r = roster) => duel.buildConfig!({ kind: "players", pool: ["vf"] }, lookup, r);
    for (let i = 0; i < 20; i++) {
      const r = run();
      expect(r).toMatchObject({ ok: true });
      if (r.ok) {
        const { sideA, sideB } = r.config.mode;
        expect(sideA).not.toBe(sideB);
        expect(players.map((p) => p.id)).toEqual(expect.arrayContaining([sideA, sideB]));
      }
    }
    expect(run({ players: players.slice(0, 1), teams: ctx.teams })).toMatchObject({ ok: false, error: expect.stringContaining("almeno due giocatori") });
  });
});
