import { describe, expect, it } from "vitest";
import type { MinigameContext, ParticipantInfo, TeamInfo } from "@gioco/shared";
import { clueProblem, normalizeWord } from "./clue.js";
import { type AgentiSegretiState as State, type CardKind, type Side, TURN_CAP, agentiSegreti as as, agentsLeft, agentsOf, formTeams } from "./index.js";
import { DEFAULT_WORDS } from "./words.js";

const make = (n: number, teamOf: (i: number) => string | null = () => null): ParticipantInfo[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `Nick-p${i + 1}`, teamId: teamOf(i) }));
const TEAMS: TeamInfo[] = [
  { id: "t1", name: "Lupi", color: "#111111" },
  { id: "t2", name: "Volpi", color: "#222222" },
];
const ctxOf = (players: ParticipantInfo[], teams: TeamInfo[] = [], seen?: string[], seed = 7): MinigameContext => ({ players, teams, seed, seen });

const cfg = as.configSchema.parse(as.sampleConfig);
const meta = (at: number) => ({ receivedAt: at, claimedTime: at - 10, rtt: 20 });

type In = Parameters<typeof as.onInput>[2];
type Cmd = Parameters<typeof as.onHostCommand>[1];
const input = (s: State, id: string, i: In, at = 1_000) => as.onInput(s, id, i, meta(at));
const cmd = (s: State, c: Cmd["type"] | Cmd, at = 1_000) => as.onHostCommand(s, (typeof c === "string" ? { type: c } : c) as Cmd, at);
const other = (side: Side): Side => (side === "red" ? "blue" : "red");
const spy = (s: State, side: Side = s.turn) => s.teams[side].spymaster;

/** Partita da 6 giocatori già distribuita (fase `clue`). */
function dealt(over: Partial<typeof cfg> = {}, n = 6): State {
  const s = cmd(as.init({ ...cfg, ...over }, ctxOf(make(n)), 0), "deal", 0);
  expect(s.phase).toBe("clue");
  return s;
}

/** Indice di una carta coperta del tipo voluto (diversa da quelle da evitare). */
const cardOf = (s: State, kind: CardKind, skip: number[] = []) => s.cards.findIndex((c, i) => c.kind === kind && !c.revealed && !skip.includes(i));

/** Un indizio valido per la griglia (una parola che non c'è). */
const CLUE = "Zzyzx";

function clue(s: State, count: number | "inf" = 2, word = CLUE, at = 1_000): State {
  return input(s, spy(s), { type: "clue", word, count }, at);
}

/** Tutti gli agenti di turno votano la stessa opzione e confermano. */
function voteAll(s: State, option: number | "pass", at = 1_000): State {
  for (const id of agentsOf(s, s.turn)) {
    s = input(s, id, { type: "pick", option }, at);
    if (s.phase !== "guess") return s;
  }
  for (const id of agentsOf(s, s.turn)) {
    s = input(s, id, { type: "confirm" }, at);
    if (s.phase !== "guess") return s;
  }
  return s;
}

const json = (v: unknown) => JSON.stringify(v);

describe("agenti-segreti: lista di parole", () => {
  it("300 parole diverse, corte, e nessuna (da 4 lettere in su) contenuta in un'altra", () => {
    const words = DEFAULT_WORDS.map(normalizeWord);
    expect(words).toHaveLength(300);
    expect(new Set(words).size).toBe(300);
    expect(Math.max(...words.map((w) => w.length))).toBeLessThanOrEqual(10);
    for (const a of words) for (const b of words) if (a !== b && a.length >= 4) expect(b.includes(a), `${a} dentro ${b}`).toBe(false);
  });

  it("la configurazione rifiuta liste con troppe poche parole diverse (contando i doppioni una volta sola)", () => {
    const few = Array.from({ length: 24 }, (_, i) => `Parola${String.fromCharCode(97 + i)}`);
    expect(as.configSchema.safeParse({ ...cfg, words: few }).success).toBe(false);
    expect(as.configSchema.safeParse({ ...cfg, words: few, gridSize: "4x4" }).success).toBe(true);
    expect(as.configSchema.safeParse({ ...cfg, words: [...few, "parolaa", "PAROLAA "] }).success).toBe(false);
  });
});

describe("agenti-segreti: preparazione", () => {
  it("mappa 5×5 con 9/8 agenti, 7 civili e 1 assassino; la squadra che inizia ha 9 agenti", () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = as.init(cfg, ctxOf(make(6), [], undefined, seed), 0);
      const count = (k: CardKind) => s.cards.filter((c) => c.kind === k).length;
      expect(s.cards).toHaveLength(25);
      expect(count(s.starting)).toBe(9);
      expect(count(other(s.starting))).toBe(8);
      expect(count("civilian")).toBe(7);
      expect(count("assassin")).toBe(1);
      expect(s.turn).toBe(s.starting);
      expect(new Set(s.cards.map((c) => c.word)).size).toBe(25);
    }
  });

  it("4×4: 6/5 agenti e 4 civili; più assassini tolgono civili, 0 assassini li aggiunge", () => {
    const small = as.init({ ...cfg, gridSize: "4x4" }, ctxOf(make(4)), 0);
    const kinds = (s: State) => s.cards.map((c) => c.kind);
    expect(small.cards).toHaveLength(16);
    expect(kinds(small).filter((k) => k === small.starting)).toHaveLength(6);
    expect(kinds(small).filter((k) => k === "civilian")).toHaveLength(4);
    const three = as.init({ ...cfg, assassins: 3 }, ctxOf(make(4)), 0);
    expect(kinds(three).filter((k) => k === "assassin")).toHaveLength(3);
    expect(kinds(three).filter((k) => k === "civilian")).toHaveLength(5);
    const none = as.init({ ...cfg, assassins: 0 }, ctxOf(make(4)), 0);
    expect(kinds(none).filter((k) => k === "civilian")).toHaveLength(8);
  });

  it("stesso seme → stessa griglia; seme diverso → griglia diversa", () => {
    const a = as.init(cfg, ctxOf(make(6)), 0);
    expect(json(as.init(cfg, ctxOf(make(6)), 0).cards)).toBe(json(a.cards));
    expect(json(as.init(cfg, ctxOf(make(6), [], undefined, 99), 0).cards)).not.toBe(json(a.cards));
  });

  it("le parole dei round precedenti non si ripropongono finché la lista basta, e i doppioni si scartano", () => {
    const first = as.init(cfg, ctxOf(make(6)), 0);
    const seen = as.shownItems!(cmd(first, "deal"));
    const second = as.init(cfg, ctxOf(make(6), [], seen, 8), 0);
    expect(second.cards.some((c) => seen.includes(c.word))).toBe(false);
    const dup = as.init({ ...cfg, words: [...DEFAULT_WORDS.slice(0, 25), "albero", "ÀLBERO"] }, ctxOf(make(4)), 0);
    expect(dup.cards.filter((c) => normalizeWord(c.word) === "albero")).toHaveLength(1);
  });

  it("squadre: due team della serata da almeno 2 si usano (chi non ha team va nella più piccola), altrimenti a caso equilibrate", () => {
    const players = make(7, (i) => (i < 3 ? "t1" : i < 5 ? "t2" : null));
    const teams = formTeams(players, TEAMS, [], () => 0.3);
    expect(teams.red.name).toBe("Lupi");
    expect(teams.blue.name).toBe("Volpi");
    expect(teams.red.members.length + teams.blue.members.length).toBe(7);
    // 3 + 2 dalla serata, poi i due senza team uno per parte (prima alla più piccola)
    expect(teams.blue.members).toEqual(["p4", "p5", "p6"]);
    expect(teams.red.members).toEqual(["p1", "p2", "p3", "p7"]);
    // un team con un solo giocatore: squadre a caso
    const lopsided = formTeams(make(5, (i) => (i < 4 ? "t1" : "t2")), TEAMS, [], () => 0.3);
    expect(lopsided.red.name).toBe("Rossi");
    expect(Math.abs(lopsided.red.members.length - lopsided.blue.members.length)).toBeLessThanOrEqual(1);
    // tre team: a caso
    expect(formTeams(make(6, (i) => `t${i % 3}`), [...TEAMS, { id: "t0", name: "Orsi" }], [], () => 0.3).red.teamId).toBeNull();
  });

  it("il Capo-spia è uno dei membri ed evita chi lo è già stato nei round precedenti della partita", () => {
    // squadre fisse (team della serata), così il confronto tra i due round è sugli stessi membri
    const players = make(6, (i) => (i < 3 ? "t1" : "t2"));
    let past: string[] = [];
    let seen: string[] = [];
    for (let round = 0; round < 3; round++) {
      const s = as.init(cfg, ctxOf(players, TEAMS, seen, round), 0);
      for (const side of ["red", "blue"] as const) {
        expect(s.teams[side].members).toContain(s.teams[side].spymaster);
        expect(past).not.toContain(s.teams[side].spymaster);
      }
      past = [...past, s.teams.red.spymaster, s.teams.blue.spymaster];
      seen = [...seen, ...as.shownItems!(cmd(s, "deal"))];
    }
    // finiti i candidati (3 per squadra, 3 round), al quarto si ricomincia da tutti
    const fourth = as.init(cfg, ctxOf(players, TEAMS, seen, 3), 0);
    expect(fourth.teams.red.members).toContain(fourth.teams.red.spymaster);
  });

  it("in setup la regia sposta giocatori e cambia Capo-spia; dopo «Distribuisci» non più", () => {
    let s = as.init(cfg, ctxOf(make(6)), 0);
    const mover = s.teams.red.spymaster;
    s = cmd(s, { type: "move-player", playerId: mover, side: "blue" });
    expect(s.teams.blue.members).toContain(mover);
    expect(s.teams.red.members).toHaveLength(2);
    expect(s.teams.red.members).toContain(s.teams.red.spymaster); // il Capo-spia spostato è sostituito
    // una squadra non scende sotto i 2 giocatori
    expect(cmd(s, { type: "move-player", playerId: s.teams.red.members[0]!, side: "blue" })).toBe(s);
    const newSpy = s.teams.blue.members.find((id) => id !== s.teams.blue.spymaster)!;
    s = cmd(s, { type: "set-spymaster", side: "blue", playerId: newSpy });
    expect(s.teams.blue.spymaster).toBe(newSpy);
    expect(cmd(s, { type: "set-spymaster", side: "red", playerId: newSpy })).toBe(s); // non è dei rossi
    const d = cmd(s, "deal");
    expect(cmd(d, { type: "move-player", playerId: newSpy, side: "red" })).toBe(d);
    expect(cmd(d, { type: "set-spymaster", side: "blue", playerId: mover })).toBe(d);
    expect(cmd(d, "shuffle-teams")).toBe(d);
  });

  it("«Mescola squadre» rifà squadre equilibrate in modo deterministico", () => {
    const s = as.init(cfg, ctxOf(make(7)), 0);
    const a = cmd(s, "shuffle-teams");
    expect(json(cmd(s, "shuffle-teams").teams)).toBe(json(a.teams));
    expect(a.teams.red.members.length + a.teams.blue.members.length).toBe(7);
    expect(Math.abs(a.teams.red.members.length - a.teams.blue.members.length)).toBe(1);
  });
});

describe("agenti-segreti: indizio", () => {
  it("controllo automatico: carta coperta, parte in comune di almeno 4 lettere, più parole, simboli", () => {
    expect(clueProblem("Mare", ["mare"])).toContain("parola della griglia");
    expect(clueProblem("MÀRE", ["Mare"])).toContain("parola della griglia");
    expect(clueProblem("marino", ["mare"])).toBeNull();
    expect(clueProblem("pescecane", ["cane"])).toContain("troppo simile");
    expect(clueProblem("can", ["cane"])).toBeNull(); // parte in comune di 3 lettere
    expect(clueProblem("re", ["regina"])).toBeNull();
    expect(clueProblem("dopo-sci", ["neve"])).toBeNull();
    expect(clueProblem("quell'anno", ["neve"])).toBeNull();
    expect(clueProblem("mare blu", ["neve"])).toContain("una parola sola");
    expect(clueProblem("mare2", ["neve"])).toContain("solo lettere");
  });

  it("un indizio sbagliato resta in `clue` e mostra il motivo; la parola di una carta già scoperta è ammessa", () => {
    let s = dealt();
    const word = s.cards[0]!.word;
    const bad = clue(s, 1, word);
    expect(bad.phase).toBe("clue");
    expect(bad.clueError).toEqual({ playerId: spy(s), text: `«${word}» è una parola della griglia` });
    s = { ...s, cards: s.cards.map((c, i) => (i === 0 ? { ...c, revealed: true } : c)) };
    expect(clue(s, 1, word).phase).toBe("guess");
  });

  it("solo il Capo-spia di turno, e solo in `clue`, può dare l'indizio", () => {
    const s = dealt();
    expect(input(s, spy(s, other(s.turn)), { type: "clue", word: CLUE, count: 1 })).toBe(s);
    expect(input(s, agentsOf(s, s.turn)[0]!, { type: "clue", word: CLUE, count: 1 })).toBe(s);
    const g = clue(s);
    expect(input(g, spy(g), { type: "clue", word: "Altro", count: 1 })).toBe(g);
    expect(input(cmd(as.init(cfg, ctxOf(make(6)), 0), "pause"), "p1", { type: "clue", word: CLUE, count: 1 }).phase).toBe("setup");
  });

  it("con 0 e ∞ disattivati quegli indizi sono rifiutati con il motivo", () => {
    const s = dealt({ allowZeroInfinity: false });
    expect(clue(s, 0).clueError?.text).toContain("0 e ∞");
    expect(clue(s, "inf").phase).toBe("clue");
    expect(clue(s, 3).phase).toBe("guess");
  });

  it("allo scadere del tempo per l'indizio il turno passa", () => {
    const s = dealt();
    const t = as.onTick(s, s.phaseEndsAt!);
    expect(t.phase).toBe("clue");
    expect(t.turn).toBe(other(s.turn));
    expect(t.lastEnd).toEqual({ side: s.turn, reason: "clue-timeout" });
  });
});

describe("agenti-segreti: voto e scoperte", () => {
  it("il Capo-spia non vota, gli avversari nemmeno; «Passa» non c'è prima della prima scoperta", () => {
    const s = clue(dealt());
    expect(s.vote!.members).not.toContain(spy(s));
    expect(input(s, spy(s), { type: "pick", option: 0 })).toBe(s);
    expect(input(s, agentsOf(s, other(s.turn))[0]!, { type: "pick", option: 0 })).toBe(s);
    expect(input(s, agentsOf(s, s.turn)[0]!, { type: "pick", option: "pass" })).toBe(s);
  });

  it("agente proprio: si continua a votare fino a numero + 1 carte, poi il turno passa", () => {
    let s = clue(dealt(), 1);
    const side = s.turn;
    s = voteAll(s, cardOf(s, side));
    expect(s.phase).toBe("guess");
    expect(s.turn).toBe(side);
    expect(s.vote!.options).toContain("pass");
    s = voteAll(s, cardOf(s, side));
    expect(s.turn).toBe(other(side));
    expect(s.phase).toBe("clue");
    expect(s.lastEnd).toEqual({ side, reason: "limit" });
    expect(s.clues[0]!.guesses).toBe(2);
  });

  it("«Passa» dopo la prima scoperta chiude il turno", () => {
    let s = clue(dealt(), 3);
    const side = s.turn;
    s = voteAll(voteAll(s, cardOf(s, side)), "pass");
    expect(s.turn).toBe(other(side));
    expect(s.lastEnd?.reason).toBe("pass");
  });

  it("civile: il turno passa; carta avversaria: il turno passa e l'agente resta all'avversario", () => {
    let s = clue(dealt());
    const side = s.turn;
    s = voteAll(s, cardOf(s, "civilian"));
    expect(s.turn).toBe(other(side));
    expect(s.lastEnd?.reason).toBe("wrong");
    s = clue(s);
    const before = agentsLeft(s, side);
    const idx = cardOf(s, side);
    s = voteAll(s, idx);
    expect(s.cards[idx]).toMatchObject({ revealed: true, revealedBy: other(side), kind: side });
    expect(agentsLeft(s, side)).toBe(before - 1);
    expect(s.turn).toBe(side);
  });

  it("voto pari: nessuna scoperta e il turno passa", () => {
    let s = clue(dealt());
    const [a, b] = agentsOf(s, s.turn);
    const side = s.turn;
    s = input(s, a!, { type: "pick", option: cardOf(s, side) });
    s = input(s, b!, { type: "pick", option: cardOf(s, "assassin") });
    s = input(input(s, a!, { type: "confirm" }), b!, { type: "confirm" });
    expect(s.cards.some((c) => c.revealed)).toBe(false);
    expect(s.turn).toBe(other(side));
    expect(s.lastEnd?.reason).toBe("tie");
  });

  it("nessun voto allo scadere (con la tolleranza): il turno passa senza scoprire nulla", () => {
    const s = clue(dealt());
    expect(as.onTick(s, s.phaseEndsAt!)).toBe(s);
    const t = as.onTick(s, s.phaseEndsAt! + 500);
    expect(t.lastEnd?.reason).toBe("no-votes");
    expect(t.cards.some((c) => c.revealed)).toBe(false);
  });

  it("allo scadere vale la maggioranza anche senza conferme", () => {
    let s = clue(dealt());
    const idx = cardOf(s, s.turn);
    s = input(s, agentsOf(s, s.turn)[0]!, { type: "pick", option: idx });
    s = as.onTick(s, s.phaseEndsAt! + 500);
    expect(s.cards[idx]!.revealed).toBe(true);
  });

  it("un secondo tocco toglie il voto e la conferma; i tocchi arrivati dopo la scadenza non contano", () => {
    let s = clue(dealt());
    const a = agentsOf(s, s.turn)[0]!;
    s = input(s, a, { type: "pick", option: 3 });
    expect(s.vote!.picks[a]).toHaveLength(1);
    s = input(s, a, { type: "pick", option: 3 });
    expect(s.vote!.picks[a]).toHaveLength(0);
    const late = input(s, a, { type: "pick", option: 3 }, s.phaseEndsAt! + 501);
    expect(late).toBe(s);
  });

  it("con 0 o ∞ si scoprono quante carte si vuole", () => {
    for (const count of [0, "inf"] as const) {
      let s = clue(dealt(), count);
      const side = s.turn;
      for (let i = 0; i < 4; i++) s = voteAll(s, cardOf(s, side));
      expect(s.turn).toBe(side);
      expect(s.phase).toBe("guess");
    }
  });

  it("assassino: la squadra di turno perde subito", () => {
    let s = clue(dealt());
    const side = s.turn;
    s = voteAll(s, cardOf(s, "assassin"));
    expect(s.phase).toBe("reveal");
    expect(s.outcome).toEqual({ winner: other(side), reason: "assassin" });
  });

  it("vince chi ha tutti gli agenti scoperti, anche se l'ultimo l'ha scoperto l'avversario", () => {
    let s = clue(dealt());
    const side = s.turn;
    const victim = other(side);
    // tutti gli agenti dell'altra squadra già scoperti tranne uno
    const theirs = s.cards.flatMap((c, i) => (c.kind === victim ? [i] : []));
    s = { ...s, cards: s.cards.map((c, i) => (theirs.slice(1).includes(i) ? { ...c, revealed: true, revealedBy: victim } : c)) };
    s = voteAll(s, theirs[0]!);
    expect(s.outcome).toEqual({ winner: victim, reason: "agents" });
  });

  it("fine per turni: vince chi ha meno agenti da trovare, a parità pareggio", () => {
    let s = dealt({ maxTurns: 2 });
    const side = s.turn;
    s = voteAll(clue(s, 1), cardOf(s, side));
    s = voteAll(s, "pass");
    expect(s.phase).toBe("clue");
    s = cmd(s, "end-turn");
    expect(s.phase).toBe("reveal");
    // la squadra che inizia ha 9 agenti, ne ha scoperto 1: 8 contro 8 → pareggio
    expect(s.outcome).toEqual({ winner: "draw", reason: "turns" });
  });

  it("senza limite di turni c'è comunque un tetto", () => {
    let s = dealt();
    for (let i = 0; i < TURN_CAP; i++) s = cmd(s, "end-turn");
    expect(s.phase).toBe("reveal");
    expect(s.outcome?.reason).toBe("turns");
  });
});

describe("agenti-segreti: regia", () => {
  it("«Annulla scoperta» rimette coperta la carta e ripristina turno, indizio ed esito (un solo livello)", () => {
    let s = clue(dealt(), 2);
    const side = s.turn;
    s = voteAll(s, cardOf(s, "assassin"));
    expect(s.phase).toBe("reveal");
    const u = cmd(s, "undo-reveal");
    expect(u.phase).toBe("guess");
    expect(u.turn).toBe(side);
    expect(u.outcome).toBeNull();
    expect(u.cards.every((c) => !c.revealed)).toBe(true);
    expect(u.clues[0]!.guesses).toBe(0);
    expect(cmd(u, "undo-reveal")).toBe(u);
    // dopo un civile il turno è passato: annullare lo riporta alla squadra che ha sbagliato
    const civ = voteAll(u, cardOf(u, "civilian"));
    expect(civ.turn).toBe(other(side));
    expect(cmd(civ, "undo-reveal").turn).toBe(side);
    // con un nuovo indizio l'ultima scoperta non si annulla più
    expect(cmd(clue(civ), "undo-reveal").undo).toBeNull();
    expect(clue(civ).undo).toBeNull();
  });

  it("«Indizio non valido» segna l'indizio e passa il turno; «Fine turno» passa il turno", () => {
    const s = clue(dealt());
    const r = cmd(s, "reject-clue");
    expect(r.clues[0]!.rejected).toBe(true);
    expect(r.turn).toBe(other(s.turn));
    expect(r.lastEnd?.reason).toBe("rejected");
    expect(cmd(s, "end-turn").lastEnd?.reason).toBe("host");
  });

  it("pausa: il tempo si ferma, input e scadenza ignorati; alla ripresa riparte da dove era", () => {
    const s = clue(dealt());
    const p = cmd(s, "pause", s.phaseStartedAt + 10_000);
    expect(p.pausedRemainingMs).toBe(50_000);
    expect(as.onTick(p, 10_000_000)).toBe(p);
    expect(input(p, agentsOf(p, p.turn)[0]!, { type: "pick", option: 0 })).toBe(p);
    const r = cmd(p, "resume", 100_000);
    expect(r.phaseEndsAt).toBe(150_000);
  });

  it("«Termina la partita» chiude con l'esito per agenti rimasti; «Avanti» conclude il round", () => {
    const s = cmd(clue(dealt()), "end");
    expect(s.outcome?.reason).toBe("host");
    expect(as.isFinished(s)).toBe(false);
    expect(as.isFinished(cmd(s, "next"))).toBe(true);
  });
});

describe("agenti-segreti: punti", () => {
  it("vittoria a ogni membro della squadra (Capo-spia compreso), più i punti per agente scoperto", () => {
    let s = clue(dealt({ points: { win: 100, perAgent: 10 } }));
    const side = s.turn;
    s = voteAll(s, cardOf(s, side)); // un agente proprio
    s = voteAll(s, cardOf(s, "assassin")); // e poi l'assassino
    const scores = Object.fromEntries(as.scores(s).map((d) => [d.playerId, d.points]));
    for (const id of s.teams[other(side)].members) expect(scores[id]).toBe(100);
    for (const id of s.teams[side].members) expect(scores[id]).toBe(10);
    expect(as.scores(s).every((d) => d.teamId === null)).toBe(true);
    expect(as.result(s).ranking[0]!.playerId).toSatisfy((id: string) => s.teams[other(side)].members.includes(id));
  });

  it("chiusa dalla regia all'inizio vince chi ha meno agenti (la seconda squadra); a pari agenti pareggio, senza punti", () => {
    const start = dealt();
    expect(cmd(start, "end").outcome).toEqual({ winner: other(start.turn), reason: "host" });
    const s = voteAll(clue(start, 1), cardOf(start, start.turn)); // 8 contro 8
    const end = cmd(s, "end");
    expect(end.outcome?.winner).toBe("draw");
    expect(as.scores(end)).toEqual([]);
  });
});

describe("agenti-segreti: chi vede cosa (anti-leak)", () => {
  /** Ogni chiave `kind` delle carte coperte nelle viste, finché la partita non è finita. */
  const coveredKinds = (cards: { revealed: boolean; kind?: string }[]) => cards.filter((c) => !c.revealed && "kind" in c);

  it("a ogni passo di una partita, TV e agenti non ricevono il colore delle carte coperte; i Capi-spia sì, da «Distribuisci»", () => {
    let s = as.init(cfg, ctxOf(make(8)), 0);
    const check = (st: State) => {
      const spies = [st.teams.red.spymaster, st.teams.blue.spymaster];
      const screen = as.screenView(st) as { cards: { revealed: boolean; kind?: string }[] };
      const final = st.phase === "reveal" || st.phase === "done";
      if (!final) expect(coveredKinds(screen.cards)).toEqual([]);
      for (const id of st.players) {
        const v = as.viewFor(st, id, null) as { cards: { revealed: boolean; kind?: string }[]; me: Record<string, unknown> };
        if (!final) expect(coveredKinds(v.cards), `${st.phase} ${id}`).toEqual([]);
        if (spies.includes(id) && st.phase !== "setup") expect(v.me.map).toHaveLength(st.cards.length);
        else expect("map" in v.me, `mappa a ${id} in ${st.phase}`).toBe(false);
      }
    };
    check(s);
    s = cmd(s, "deal");
    check(s);
    s = clue(s, 1);
    check(s);
    s = voteAll(s, cardOf(s, s.turn));
    check(s);
    s = voteAll(s, cardOf(s, "civilian"));
    check(s);
    s = clue(s, "inf");
    check(s);
    s = voteAll(s, cardOf(s, "assassin"));
    expect(s.phase).toBe("reveal");
    // a fine partita la mappa intera è pubblica
    expect((as.screenView(s) as { cards: { kind?: string }[] }).cards.every((c) => c.kind)).toBe(true);
  });

  it("in `setup` la griglia non c'è proprio, nemmeno per i Capi-spia", () => {
    const s = as.init(cfg, ctxOf(make(6)), 0);
    expect((as.screenView(s) as { cards: unknown[] }).cards).toEqual([]);
    const v = as.viewFor(s, s.teams.red.spymaster, null) as { me: Record<string, unknown> };
    expect("map" in v.me).toBe(false);
  });

  it("chi smette di essere Capo-spia in setup non ha la mappa; il nuovo la riceve dopo «Distribuisci»", () => {
    let s = as.init(cfg, ctxOf(make(6)), 0);
    const old = s.teams.red.spymaster;
    const neu = s.teams.red.members.find((id) => id !== old)!;
    s = cmd(cmd(s, { type: "set-spymaster", side: "red", playerId: neu }), "deal");
    expect("map" in (as.viewFor(s, old, null) as { me: object }).me).toBe(false);
    expect((as.viewFor(s, neu, null) as { me: { map: string[] } }).me.map).toHaveLength(25);
  });

  it("l'errore dell'indizio lo vede solo il Capo-spia che ha sbagliato", () => {
    const d = dealt();
    const bad = clue(d, 1, d.cards[0]!.word);
    const spyId = spy(bad);
    for (const id of bad.players) {
      const me = (as.viewFor(bad, id, null) as { me: Record<string, unknown> }).me;
      expect("clueError" in me).toBe(id === spyId);
    }
    expect(json(as.screenView(bad))).not.toContain("parola della griglia");
  });

  it("regia cieca: niente mappa delle carte coperte; disattivarla a partita iniziata lo dice alla TV", () => {
    let s = cmd(as.init(cfg, ctxOf(make(6)), 0), { type: "set-blind", blind: true });
    s = cmd(s, "deal");
    const info = as.hostView(s).info as { cards: { revealed: boolean; kind?: string }[] };
    expect(coveredKinds(info.cards)).toEqual([]);
    expect(info.cards).toHaveLength(25);
    const open = as.hostView(cmd(s, { type: "set-blind", blind: false })).info as { cards: { kind?: string }[] };
    expect(open.cards.every((c) => c.kind)).toBe(true);
    expect((as.screenView(cmd(s, { type: "set-blind", blind: false })) as { blindBroken: boolean }).blindBroken).toBe(true);
    // in setup si può togliere senza avviso
    const early = cmd(cmd(as.init(cfg, ctxOf(make(6)), 0), { type: "set-blind", blind: true }), { type: "set-blind", blind: false });
    expect(early.blindBroken).toBe(false);
  });

  it("i voti in corso sono pubblici: chi ha votato cosa", () => {
    let s = clue(dealt());
    const a = agentsOf(s, s.turn)[0]!;
    s = input(s, a, { type: "pick", option: 4 });
    const v = as.screenView(s) as { votes: { option: string; voters: { id: string }[] }[] };
    expect(v.votes).toEqual([{ option: "4", voters: [{ id: a, nickname: `Nick-${a}` }] }]);
  });
});
