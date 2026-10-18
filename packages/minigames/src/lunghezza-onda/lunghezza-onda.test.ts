import { describe, expect, it } from "vitest";
import type { MinigameContext, ParticipantInfo, TeamInfo } from "@gioco/shared";
import { type LunghezzaOndaState as State, counterVoters, formTeams, guessers, lunghezzaOnda as lo, teamsProblem } from "./index.js";

const make = (n: number, teamOf: (i: number) => string | null = () => null): ParticipantInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `Nick-p${i + 1}`, teamId: teamOf(i) }));
const TEAMS: TeamInfo[] = [
  { id: "t1", name: "Lupi", color: "#111111" },
  { id: "t2", name: "Volpi", color: "#222222" },
];
const ctxOf = (players: ParticipantInfo[], teams: TeamInfo[] = [], seen?: string[]): MinigameContext => ({ players, teams, seed: 11, seen });

const tutti = lo.configSchema.parse({ ...lo.sampleConfig, mode: "tutti" });
const squadre = lo.configSchema.parse({ ...lo.sampleConfig, mode: "squadre" });
const meta = (at: number, claimed = at - 10) => ({ receivedAt: at, claimedTime: claimed, rtt: 20 });

type In = Parameters<typeof lo.onInput>[2];
const input = (s: State, id: string, i: In, at: number) => lo.onInput(s, id, i, meta(at));
const cmd = (s: State, type: Parameters<typeof lo.onHostCommand>[1]["type"], at: number) => lo.onHostCommand(s, { type } as never, at);

/** Il Sensitivo sceglie lo spettro e scrive l'indizio; il bersaglio viene fissato per rendere i conti leggibili. */
function toGuess(s: State, at: number, target = 50): State {
  s = input(s, s.turn.psychicId, { type: "pick", index: 0 }, at);
  s = input(s, s.turn.psychicId, { type: "clue", text: "Il caffè del bar" }, at + 10);
  expect(s.phase).toBe("guess");
  return { ...s, turn: { ...s.turn, target } };
}

const others = (s: State) => guessers(s);
const keys = (v: unknown) => JSON.stringify(v);

describe("lunghezza-onda: avvio e turni", () => {
  it("la configurazione di esempio è valida; l'avvio è deterministico", () => {
    expect(lo.configSchema.safeParse(lo.sampleConfig).success).toBe(true);
    expect(JSON.stringify(lo.init(tutti, ctxOf(make(5)), 0))).toBe(JSON.stringify(lo.init(tutti, ctxOf(make(5)), 0)));
  });

  it("turni automatici: un turno per giocatore fino a 8; a squadre fino a 20; un numero fisso vale così com'è", () => {
    expect(lo.init(tutti, ctxOf(make(5)), 0).maxTurns).toBe(5);
    expect(lo.init(tutti, ctxOf(make(30)), 0).maxTurns).toBe(8);
    expect(lo.init(squadre, ctxOf(make(6)), 0).maxTurns).toBe(20);
    expect(lo.init({ ...tutti, turns: 3 }, ctxOf(make(30)), 0).maxTurns).toBe(3);
  });

  it("il bersaglio non cade mai entro il margine dai bordi", () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = lo.init({ ...tutti, edgeMargin: 10 }, { ...ctxOf(make(4)), seed }, 0);
      expect(s.turn.target).toBeGreaterThanOrEqual(10);
      expect(s.turn.target).toBeLessThanOrEqual(90);
    }
  });

  it("il Sensitivo ruota: in tutti contro tutti, nei primi turni sono tutti diversi", () => {
    let s = lo.init({ ...tutti, turns: 4 }, ctxOf(make(4)), 0);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(s.turn.psychicId);
      s = cmd(s, "skip-turn", i * 100);
    }
    expect(new Set(seen).size).toBe(4);
    expect(s.phase).toBe("final");
  });

  it("due spettri diversi da scegliere; quelli dei round precedenti non si ripropongono", () => {
    const s = lo.init(tutti, ctxOf(make(4)), 0);
    expect(s.turn.options).toHaveLength(2);
    expect(s.turn.options[0]).not.toEqual(s.turn.options[1]);
    const played = toGuess(s, 10);
    const done = cmd(played, "close", 100);
    expect(done.phase).toBe("reveal");
    const shown = lo.shownItems!(done);
    expect(shown).toEqual([`${played.turn.spectrum!.left}|${played.turn.spectrum!.right}`]);
    for (let seed = 0; seed < 50; seed++) {
      const next = lo.init(tutti, { ...ctxOf(make(4), [], shown), seed }, 0);
      expect(next.turn.options.map((o) => `${o.left}|${o.right}`)).not.toContain(shown[0]);
    }
  });
});

describe("lunghezza-onda: spettro e indizio", () => {
  it("solo il Sensitivo sceglie e scrive; allo scadere della scelta sceglie il server", () => {
    let s = lo.init(tutti, ctxOf(make(4)), 0);
    const other = others(s)[0]!;
    expect(input(s, other, { type: "pick", index: 1 }, 10)).toBe(s);
    s = lo.onTick(s, tutti.pickSeconds * 1000);
    expect(s.phase).toBe("clue");
    expect(s.turn.spectrum).toEqual(s.turn.options[0]);
    expect(input(s, other, { type: "clue", text: "boh" }, 10)).toBe(s);
  });

  it("senza indizio entro il tempo il turno salta e passa al Sensitivo successivo; con 0 secondi non c'è limite", () => {
    let s = lo.init(tutti, ctxOf(make(4)), 0);
    const first = s.turn.psychicId;
    s = input(s, first, { type: "pick", index: 0 }, 10);
    s = lo.onTick(s, 10 + tutti.clueSeconds * 1000);
    expect(s.phase).toBe("pick");
    expect(s.played).toBe(1);
    expect(s.turn.psychicId).not.toBe(first);
    expect(s.history).toHaveLength(0);

    let free = lo.init({ ...tutti, clueSeconds: 0 }, ctxOf(make(4)), 0);
    free = input(free, free.turn.psychicId, { type: "pick", index: 0 }, 10);
    expect(free.phaseEndsAt).toBeNull();
    expect(lo.onTick(free, 10_000_000)).toBe(free);
  });

  it("indizio non valido: si torna all'indizio, le posizioni si azzerano e il tempo riparte", () => {
    let s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0);
    s = input(s, others(s)[0]!, { type: "dial", pos: 30 }, 100);
    s = cmd(s, "reject-clue", 200);
    expect(s.phase).toBe("clue");
    expect(s.turn.clue).toBeNull();
    expect(s.turn.dials).toEqual({});
    expect(s.phaseEndsAt).toBe(200 + tutti.clueSeconds * 1000);
  });
});

describe("lunghezza-onda: quadrante", () => {
  it("il Sensitivo non muove il quadrante; la posizione si arrotonda; muovere toglie la conferma", () => {
    let s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0);
    expect(input(s, s.turn.psychicId, { type: "dial", pos: 10 }, 100)).toBe(s);
    const [a] = others(s);
    s = input(s, a!, { type: "confirm", pos: 33.26 }, 100);
    expect(s.turn.dials[a!]).toMatchObject({ pos: 33.5, confirmed: true });
    s = input(s, a!, { type: "dial", pos: 40 }, 200);
    expect(s.turn.dials[a!]).toMatchObject({ pos: 40, confirmed: false });
    expect(input(s, a!, { type: "dial", pos: 40 }, 300)).toBe(s);
  });

  it("quando tutti confermano si rivela subito", () => {
    let s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0);
    for (const id of others(s)) s = input(s, id, { type: "confirm", pos: 50 }, 100);
    expect(s.phase).toBe("reveal");
  });

  it("tempo: un invio in tempo arrivato entro la tolleranza conta, uno tardivo no; in pausa niente input", () => {
    const s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0);
    const a = others(s)[0]!;
    const end = s.phaseEndsAt!;
    expect(lo.onInput(s, a, { type: "dial", pos: 20 }, { receivedAt: end + 200, claimedTime: end - 50, rtt: 300 }).turn.dials[a]?.pos).toBe(20);
    expect(lo.onInput(s, a, { type: "dial", pos: 20 }, { receivedAt: end + 200, claimedTime: end + 150, rtt: 300 })).toBe(s);
    expect(lo.onInput(s, a, { type: "dial", pos: 20 }, { receivedAt: end + 2_000, claimedTime: end - 50, rtt: 300 })).toBe(s);
    const paused = cmd(s, "pause", 100);
    expect(input(paused, a, { type: "dial", pos: 20 }, 150)).toBe(paused);
    expect(lo.onTick(paused, end + 60_000)).toBe(paused);
  });

  it("un messaggio vecchio arrivato in ritardo non sovrascrive uno più recente", () => {
    let s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0);
    const a = others(s)[0]!;
    s = lo.onInput(s, a, { type: "dial", pos: 70 }, { receivedAt: 1_000, claimedTime: 990, rtt: 20 });
    expect(lo.onInput(s, a, { type: "dial", pos: 10 }, { receivedAt: 1_010, claimedTime: 900, rtt: 200 })).toBe(s);
  });
});

describe("lunghezza-onda: tutti contro tutti", () => {
  it("punti per fascia e media al Sensitivo; tabellone, classifica e punteggi", () => {
    let s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0, 50);
    const psychic = s.turn.psychicId;
    const [a, b, c] = others(s) as [string, string, string];
    s = input(s, a, { type: "confirm", pos: 50 }, 100);
    s = input(s, b, { type: "confirm", pos: 54 }, 100);
    s = input(s, c, { type: "confirm", pos: 90 }, 100);
    expect(s.phase).toBe("reveal");
    expect(s.turn.result!.guesses.map((g) => g.points)).toEqual([100, 75, 0]);
    expect(s.board).toEqual({ [a]: 100, [b]: 75, [c]: 0, [psychic]: 58 });
    s = cmd(s, "end", 200);
    expect(s.phase).toBe("final");
    s = cmd(s, "next", 300);
    expect(lo.isFinished(s)).toBe(true);
    expect(lo.result(s).ranking[0]).toMatchObject({ playerId: a, rank: 1, points: 100 });
    expect(lo.scores(s)).toContainEqual({ playerId: psychic, teamId: null, points: 58, reason: "Lunghezza d'Onda" });
  });

  it("chi non ha mosso il quadrante non prende punti e non abbassa la media del Sensitivo", () => {
    let s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0, 50);
    s = input(s, others(s)[0]!, { type: "confirm", pos: 51 }, 100);
    s = lo.onTick(s, s.phaseEndsAt! + 1_000);
    expect(s.phase).toBe("reveal");
    expect(s.turn.result!.guesses).toHaveLength(1);
    expect(s.turn.result!.psychicPoints).toBe(100);
  });

  it("«Termina dopo questo turno» durante il voto: si finisce dopo la rivelazione", () => {
    let s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0);
    s = cmd(s, "end", 100);
    expect(s.endAfterTurn).toBe(true);
    s = cmd(s, "close", 200);
    expect(s.phase).toBe("reveal");
    expect(cmd(s, "next", 300).phase).toBe("final");
  });
});

describe("lunghezza-onda: squadre", () => {
  it("si usano i team della serata; chi non ha un team va nella squadra più piccola", () => {
    const players = make(7, (i) => (i < 3 ? "t1" : i < 5 ? "t2" : null));
    const teams = formTeams(players, TEAMS, () => 0.5);
    expect(teams.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(teams.map((t) => t.members.length).sort()).toEqual([3, 4]);
    expect(teams.flatMap((t) => t.members).sort()).toEqual(players.map((p) => p.id).sort());
  });

  it("senza almeno due team con giocatori le squadre si estraggono a caso, equilibrate", () => {
    const teams = formTeams(make(5, (i) => (i === 0 ? "t1" : null)), TEAMS, () => 0.3);
    expect(teams.map((t) => t.name)).toEqual(["Rossi", "Blu"]);
    expect(teams.map((t) => t.members.length)).toEqual([3, 2]);
  });

  it("l'avvio a squadre è rifiutato con una squadra da un solo giocatore; tutti contro tutti no", () => {
    expect(teamsProblem(make(3), [])).toMatch(/almeno 2 giocatori per squadra/);
    expect(teamsProblem(make(4), [])).toBeNull();
    const uneven = make(4, (i) => (i < 3 ? "t1" : "t2"));
    expect(teamsProblem(uneven, TEAMS)).toMatch(/«Volpi» ne ha 1/);
    const build = (cfg: unknown, players: ParticipantInfo[]) => lo.buildConfig!(cfg, () => undefined, { players, teams: TEAMS });
    expect(build(squadre, uneven)).toMatchObject({ ok: false });
    expect(build(tutti, uneven)).toMatchObject({ ok: true });
    expect(build(squadre, make(4, (i) => (i < 2 ? "t1" : "t2")))).toEqual({ ok: true, config: squadre });
  });

  const teamCtx = () => ctxOf(make(6, (i) => (i < 3 ? "t1" : "t2")), TEAMS);

  it("indovina la squadra del Sensitivo (mediana), le altre scommettono a maggioranza", () => {
    let s = toGuess(lo.init(squadre, teamCtx(), 0), 0, 50);
    const active = s.turn.teamId!;
    const rival = s.teams.find((t) => t.id !== active)!;
    // Le altre squadre non muovono il quadrante.
    expect(input(s, rival.members[0]!, { type: "dial", pos: 10 }, 100)).toBe(s);
    const [a, b] = guessers(s) as [string, string];
    s = input(s, a, { type: "dial", pos: 60 }, 100);
    expect((lo.screenView(s) as { teamPos: number }).teamPos).toBe(60);
    s = input(s, a, { type: "confirm", pos: 56 }, 110);
    s = input(s, b, { type: "confirm", pos: 54 }, 120);
    expect(s.phase).toBe("counter");
    // La squadra di turno non scommette.
    expect(input(s, a, { type: "counter", dir: "left" }, 130)).toBe(s);
    const [x, y, z] = counterVoters(s) as [string, string, string];
    s = input(s, x, { type: "counter", dir: "left" }, 140);
    s = input(s, y, { type: "counter", dir: "left" }, 150);
    s = input(s, z, { type: "counter", dir: "right" }, 160);
    expect(s.phase).toBe("reveal");
    expect(s.turn.result).toMatchObject({ teamPos: 55, zone: 3 });
    expect(s.turn.result!.counters).toEqual([{ teamId: rival.id, dir: "left", correct: true, points: 1 }]);
    expect(s.board).toEqual({ [active]: 3, [rival.id]: 1 });
  });

  it("scommessa pari = nessuna scommessa; chi non vota non conta", () => {
    let s = toGuess(lo.init(squadre, teamCtx(), 0), 0, 50);
    for (const id of guessers(s)) s = input(s, id, { type: "confirm", pos: 70 }, 100);
    const [x, y] = counterVoters(s) as [string, string];
    s = input(s, x, { type: "counter", dir: "left" }, 140);
    s = input(s, y, { type: "counter", dir: "right" }, 150);
    s = lo.onTick(s, s.phaseEndsAt! + 1_000);
    expect(s.turn.result!.counters[0]).toMatchObject({ dir: null, correct: false, points: 0 });
  });

  it("recupero: con 4 punti e ancora dietro si rigioca subito, una sola volta di fila", () => {
    let s = toGuess(lo.init(squadre, teamCtx(), 0), 0, 50);
    const active = s.turn.teamId!;
    const rival = s.teams.find((t) => t.id !== active)!.id;
    s = { ...s, board: { [rival]: 8 } };
    for (const id of guessers(s)) s = input(s, id, { type: "confirm", pos: 50 }, 100);
    s = lo.onTick(s, s.phaseEndsAt! + 1_000); // nessuna scommessa
    expect(s.turn.result!.zone).toBe(4);
    s = cmd(s, "next", 200);
    expect(s.turn).toMatchObject({ teamId: active, catchUp: true });
    // Di nuovo 4 punti, sempre dietro: questa volta passa all'altra squadra.
    s = toGuess(s, 300, 50);
    for (const id of guessers(s)) s = input(s, id, { type: "confirm", pos: 50 }, 400);
    s = lo.onTick(s, s.phaseEndsAt! + 1_000);
    expect(s.board[active]).toBe(8);
    s = cmd(s, "next", 500);
    expect(s.turn).toMatchObject({ teamId: rival, catchUp: false });
  });

  it("il Sensitivo ruota tra i membri della squadra e le squadre si alternano", () => {
    let s = lo.init({ ...squadre, catchUp: false }, teamCtx(), 0);
    const turns: { team: string; psychic: string }[] = [];
    for (let i = 0; i < 6; i++) {
      turns.push({ team: s.turn.teamId!, psychic: s.turn.psychicId });
      s = cmd(s, "skip-turn", i * 100);
    }
    expect(turns.map((t) => t.team)).toEqual([turns[0]!.team, turns[1]!.team, turns[0]!.team, turns[1]!.team, turns[0]!.team, turns[1]!.team]);
    expect(turns[0]!.team).not.toBe(turns[1]!.team);
    expect(new Set(turns.filter((t) => t.team === turns[0]!.team).map((t) => t.psychic)).size).toBe(3);
  });

  it("il round finisce quando una squadra raggiunge il punteggio; i punti vanno a ogni membro", () => {
    let s = toGuess(lo.init({ ...squadre, targetScore: 4 }, teamCtx(), 0), 0, 50);
    const active = s.teams.find((t) => t.id === s.turn.teamId)!;
    for (const id of guessers(s)) s = input(s, id, { type: "confirm", pos: 50 }, 100);
    s = lo.onTick(s, s.phaseEndsAt! + 1_000);
    s = cmd(s, "next", 200);
    expect(s.phase).toBe("final");
    s = cmd(s, "next", 300);
    const scores = lo.scores(s);
    expect(scores).toHaveLength(3);
    for (const id of active.members) expect(scores).toContainEqual({ playerId: id, teamId: null, points: 4 * 25, reason: "Lunghezza d'Onda" });
  });
});

describe("lunghezza-onda: anti-leak", () => {
  /** Percorre un turno intero e controlla le viste a ogni passo. */
  function walk(cfgMode: "tutti" | "squadre", check: (s: State) => void) {
    const ctx = cfgMode === "squadre" ? ctxOf(make(6, (i) => (i < 3 ? "t1" : "t2")), TEAMS) : ctxOf(make(5));
    let s = lo.init(cfgMode === "squadre" ? squadre : tutti, ctx, 0);
    check(s);
    s = input(s, s.turn.psychicId, { type: "pick", index: 1 }, 10);
    check(s);
    s = input(s, s.turn.psychicId, { type: "clue", text: "Indizio" }, 20);
    check(s);
    const gs = guessers(s);
    s = input(s, gs[0]!, { type: "dial", pos: 12 }, 30);
    check(s);
    for (const id of gs) s = input(s, id, { type: "confirm", pos: 12 }, 40);
    check(s);
    for (const id of counterVoters(s)) {
      s = input(s, id, { type: "counter", dir: "right" }, 50);
      check(s);
    }
    expect(s.phase).toBe("reveal");
    check(s);
  }

  const hidden = (s: State) => !["reveal", "final", "done"].includes(s.phase);

  for (const mode of ["tutti", "squadre"] as const) {
    it(`${mode}: il bersaglio non esiste nelle viste prima della rivelazione (salvo il Sensitivo dopo la scelta)`, () => {
      walk(mode, (s) => {
        const views = [lo.screenView(s), ...s.players.filter((id) => id !== s.turn.psychicId).map((id) => lo.viewFor(s, id, null))];
        for (const v of views) expect(keys(v).includes('"target"')).toBe(!hidden(s));
        const psychic = lo.viewFor(s, s.turn.psychicId, null) as { me: Record<string, unknown> };
        expect("target" in psychic.me).toBe(["clue", "guess", "counter"].includes(s.phase));
      });
    });

    it(`${mode}: le proposte di spettro arrivano solo al Sensitivo`, () => {
      walk(mode, (s) => {
        const views = [lo.screenView(s), ...s.players.filter((id) => id !== s.turn.psychicId).map((id) => lo.viewFor(s, id, null))];
        for (const v of views) expect(keys(v)).not.toContain('"options"');
      });
    });
  }

  it("tutti contro tutti: nessuno vede le posizioni altrui prima della rivelazione, nemmeno il Sensitivo", () => {
    walk("tutti", (s) => {
      if (!hidden(s)) return;
      for (const v of [lo.screenView(s), ...s.players.map((id) => lo.viewFor(s, id, null))]) {
        const view = v as { teamDials: unknown; teamPos: unknown; me?: { myDial: number | null } };
        expect(view.teamDials).toBeNull();
        expect(view.teamPos).toBeNull();
      }
      for (const id of s.players) {
        const json = keys(lo.viewFor(s, id, null));
        for (const other of s.players.filter((o) => o !== id && s.turn.dials[o])) expect(json).not.toContain(`"playerId":"${other}"`);
      }
    });
  });

  it("squadre: le scommesse di una squadra non arrivano alle altre né allo schermo prima della rivelazione", () => {
    walk("squadre", (s) => {
      if (s.phase !== "counter") return;
      expect(keys(lo.screenView(s))).not.toMatch(/"dir"/);
      for (const id of s.players) {
        const me = (lo.viewFor(s, id, null) as { me: { teamCounter: { playerId: string }[] | null } }).me;
        const mates = s.teams.find((t) => t.members.includes(id))!.members;
        for (const c of me.teamCounter ?? []) expect(mates).toContain(c.playerId);
        if (!counterVoters(s).includes(id)) expect(me.teamCounter).toBeNull();
      }
    });
  });

  it("chi non è in serata riceve solo la parte pubblica", () => {
    const s = toGuess(lo.init(tutti, ctxOf(make(4)), 0), 0);
    const v = lo.viewFor(s, "estraneo", null) as { me: unknown };
    expect(v.me).toBeNull();
    expect(keys(v)).not.toContain('"target"');
  });
});
