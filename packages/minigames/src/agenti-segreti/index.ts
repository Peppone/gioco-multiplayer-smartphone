import { z } from "zod";
import type { MinigameType, ParticipantInfo, ScoreDelta, TeamInfo } from "@gioco/shared";
import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { type TeamVote, castVote, confirmVote, createVote, resolveVote, tally } from "../team-vote.js";
import { GRACE_MS, rankByPoints, totalsToScores } from "../util.js";
import { clueProblem, normalizeWord } from "./clue.js";
import { lookupWordList } from "../word-list.js";

/**
 * Agenti Segreti: parole e indizi a squadre, in stile Codenames.
 * Due squadre, ognuna con un Capo-spia che vede sul telefono la mappa segreta della griglia; a turno il Capo-spia
 * scrive un indizio (una parola e un numero) e la sua squadra vota dal telefono quali carte scoprire.
 * Vince chi scopre per primo tutti i propri agenti; chi scopre l'assassino perde subito.
 * Regole e decisioni in docs/PIANO-AGENTI-SEGRETI.md.
 */

export type Side = "red" | "blue";
export type CardKind = Side | "civilian" | "assassin";
export type Phase = "setup" | "clue" | "guess" | "reveal" | "done";
export type ClueCount = number | "inf";

const SIDES: Side[] = ["red", "blue"];
const other = (side: Side): Side => (side === "red" ? "blue" : "red");

/** Senza limite di turni ci si ferma comunque qui: un turno saltato dopo l'altro non deve durare per sempre. */
export const TURN_CAP = 50;

/** Prefisso dei Capi-spia in `shownItems`: nei round dopo della partita si sceglie qualcun altro. */
const SPYMASTER_SEEN = "@capo-spia:";

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });

const GRID = { "5x5": { size: 25, first: 9, second: 8 }, "4x4": { size: 16, first: 6, second: 5 } } as const;

/** Lunghezza massima di una parola della griglia: oltre non sta su una carta del telefono. */
export const MAX_WORD_LENGTH = 20;
const wordSchema = z.string().trim().min(1).max(MAX_WORD_LENGTH);

const settingsShape = {
  gridSize: z
    .enum(["5x5", "4x4"])
    .default("5x5")
    .meta({ ...sec("Griglia", "5×5: 9 e 8 agenti, 7 civili. 4×4: 6 e 5 agenti, 4 civili (partite brevi)"), enumLabels: { "5x5": "5×5 (25 carte)", "4x4": "4×4 (16 carte)" } }),
  assassins: z.number().int().min(0).max(3).default(1).meta(sec("Assassini", "0 = niente assassino (versione per bambini); ogni assassino in più toglie un civile")),
  clueSeconds: z.number().int().min(0).max(600).default(90).meta(sec("Tempo per l'indizio (s)", "0 = senza limite. Allo scadere il turno passa")),
  guessSeconds: z.number().int().min(0).max(300).default(60).meta(sec("Tempo di ogni voto (s)", "0 = senza limite: il voto si chiude quando confermano tutti")),
  maxTurns: z.number().int().min(0).max(TURN_CAP).default(0).meta(sec("Turni al massimo", `0 = nessun limite (al massimo ${TURN_CAP}). Alla fine vince chi ha meno agenti da trovare`)),
  allowZeroInfinity: z.boolean().default(true).meta(sec("Indizi con 0 e ∞", "Con 0 o ∞ la squadra può scoprire quante carte vuole")),
  points: z
    .object({
      win: z.number().int().min(0).max(1000).default(100).meta(sec("Punti della vittoria", "A ogni membro della squadra vincitrice, Capo-spia compreso")),
      perAgent: z.number().int().min(0).max(100).default(0).meta(sec("Punti per agente scoperto", "A ogni membro, per ogni agente della propria squadra scoperto")),
    })
    .default({ win: 100, perAgent: 0 })
    .meta(sec("Punti")),
};

const enoughWords = (c: { words: string[]; gridSize: keyof typeof GRID }) => new Set(c.words.map(normalizeWord)).size >= GRID[c.gridSize].size;
const ENOUGH = "Servono almeno 25 parole diverse (16 con la griglia 4×4)";

/** Configurazione completa con cui parte il plugin: le parole sono già risolte (lista della libreria più quelle proprie). */
export const agentiSegretiConfigSchema = z
  .object({ words: z.array(wordSchema).max(800).meta({ title: "Parole", itemLabel: "Parola" }), ...settingsShape })
  .refine(enoughWords, { message: ENOUGH, path: ["words"] });

export type AgentiSegretiConfig = z.infer<typeof agentiSegretiConfigSchema>;

/**
 * Istanza in libreria, come la compila la regia: le parole stanno in una «Lista di parole» della libreria (nel
 * database, modificabile dall'editor e riusabile in più round) e/o nell'istanza stessa. All'avvio della partita
 * `buildConfig` le risolve. Al primo avvio il server crea la lista «Parole di Agenti Segreti» con 300 parole d'esempio.
 */
export const agentiSegretiLibrarySchema = z
  .object({
    wordList: z
      .string()
      .min(1)
      .optional()
      .meta({ title: "Lista di parole", widget: "instance", instanceKind: "word-list", description: `Contenuto della libreria, riusabile in più round. Le parole più lunghe di ${MAX_WORD_LENGTH} lettere si saltano` }),
    words: z.array(wordSchema).max(300).default([]).meta({ title: "Parole proprie di questa istanza", description: "In più rispetto alla lista (facoltative)", itemLabel: "Parola", widget: "lines" }),
    ...settingsShape,
  })
  .refine((c) => !!c.wordList || enoughWords(c), { message: `Scegli una lista di parole, oppure scrivine qui: ${ENOUGH.toLowerCase()}`, path: ["wordList"] });

/** Parole della lista (solo quelle che stanno su una carta) e proprie, senza doppioni dopo la normalizzazione. */
export function mergeWords(listWords: string[], own: string[]): string[] {
  const seen = new Set<string>();
  return [...listWords, ...own]
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && w.length <= MAX_WORD_LENGTH)
    .filter((w) => !seen.has(normalizeWord(w)) && !!seen.add(normalizeWord(w)));
}

const clueWord = z.string().trim().min(1).max(30);
const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), word: clueWord, count: z.union([z.number().int().min(0).max(9), z.literal("inf")]) }),
  /** Indice di una carta coperta, oppure «Passa». Un secondo tocco sulla stessa opzione la toglie. */
  z.object({ type: z.literal("pick"), option: z.union([z.number().int().min(0).max(24), z.literal("pass")]) }),
  z.object({ type: z.literal("confirm") }),
]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move-player"), playerId: z.string(), side: z.enum(["red", "blue"]) }),
  z.object({ type: z.literal("set-spymaster"), side: z.enum(["red", "blue"]), playerId: z.string() }),
  z.object({ type: z.literal("shuffle-teams") }),
  z.object({ type: z.literal("deal") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("reject-clue") }),
  z.object({ type: z.literal("end-turn") }),
  z.object({ type: z.literal("undo-reveal") }),
  z.object({ type: z.literal("set-blind"), blind: z.boolean() }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("next") }),
]);
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface Card {
  word: string;
  /** SEGRETO finché la carta è coperta: lo vedono solo i Capi-spia (dopo «Distribuisci») e la regia non cieca. */
  kind: CardKind;
  revealed: boolean;
  revealedBy: Side | null;
}

export interface Clue {
  seq: number;
  side: Side;
  word: string;
  count: ClueCount;
  /** Carte scoperte con questo indizio. */
  guesses: number;
  /** Annullato dalla regia con «Indizio non valido». */
  rejected: boolean;
}

export interface SideTeam {
  name: string;
  color: string;
  /** Team della serata da cui viene la squadra, `null` se estratta a caso. */
  teamId: string | null;
  /** Capo-spia compreso. */
  members: string[];
  spymaster: string;
}

/** Perché è finito l'ultimo turno: la TV lo spiega a chi non ha seguito. */
export type TurnEndReason = "pass" | "tie" | "no-votes" | "wrong" | "limit" | "clue-timeout" | "rejected" | "host" | "no-agents";

export interface Outcome {
  winner: Side | "draw";
  /** `agents`: tutti gli agenti scoperti · `assassin`: carta dell'assassino · `turns`: turni finiti · `host`: chiusa dalla regia. */
  reason: "agents" | "assassin" | "turns" | "host";
}

interface UndoSnapshot {
  cardIndex: number;
  turn: Side;
  turnNumber: number;
  clues: Clue[];
  lastEnd: AgentiSegretiState["lastEnd"];
}

export interface AgentiSegretiState {
  cfg: AgentiSegretiConfig;
  seed: number;
  participants: ParticipantInfo[];
  players: string[];
  teams: Record<Side, SideTeam>;
  /** Capi-spia dei round precedenti della partita (`ctx.seen`): si evita di ripescarli. */
  pastSpymasters: string[];
  shuffles: number;
  starting: Side;
  turn: Side;
  /** Da 1: ogni turno di una squadra, anche saltato. */
  turnNumber: number;
  maxTurns: number;
  /** In ordine di griglia. Esistono da subito (stato deterministico), ma le viste li mostrano solo da «Distribuisci». */
  cards: Card[];
  clues: Clue[];
  vote: TeamVote | null;
  lastEnd: { side: Side; reason: TurnEndReason } | null;
  /** Ultima carta scoperta (la TV la mette in evidenza). */
  lastReveal: number | null;
  /** Ultimo indizio rifiutato dal controllo automatico: lo vede solo quel Capo-spia (e la regia). */
  clueError: { playerId: string; text: string } | null;
  undo: UndoSnapshot | null;
  blind: boolean;
  /** La regia ha tolto la modalità cieca a partita iniziata: la TV lo dice. */
  blindBroken: boolean;
  outcome: Outcome | null;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
}

type S = AgentiSegretiState;

const nick = (s: S, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";
const sideOf = (s: S, playerId: string): Side | null => SIDES.find((side) => s.teams[side].members.includes(playerId)) ?? null;
const isSpymaster = (s: S, playerId: string) => SIDES.some((side) => s.teams[side].spymaster === playerId);

/** Agenti della squadra (i compagni del Capo-spia): votano solo loro, e solo al proprio turno. */
export const agentsOf = (s: S, side: Side) => s.teams[side].members.filter((id) => id !== s.teams[side].spymaster);
export const agentsLeft = (s: S, side: Side) => s.cards.filter((c) => c.kind === side && !c.revealed).length;
export const activeClue = (s: S): Clue | null => (s.phase === "guess" ? (s.clues[s.clues.length - 1] ?? null) : null);

/** Quante carte può ancora scoprire la squadra con l'indizio attivo: `null` = quante vuole (indizio 0 o ∞). */
export function guessesLeft(s: S): number | null {
  const clue = activeClue(s);
  if (!clue) return 0;
  if (clue.count === "inf" || clue.count === 0) return null;
  return Math.max(0, clue.count + 1 - clue.guesses);
}

// ---- Squadre ----

const RANDOM_TEAMS: Record<Side, { name: string; color: string }> = {
  red: { name: "Rossi", color: "#e5484d" },
  blue: { name: "Blu", color: "#3e63dd" },
};

function pickSpymaster(members: string[], avoid: string[], rng: () => number): string {
  const fresh = members.filter((id) => !avoid.includes(id));
  const pool = fresh.length > 0 ? fresh : members;
  return pool[Math.floor(rng() * pool.length)] ?? "";
}

function randomTeams(players: string[], avoid: string[], rng: () => number): Record<Side, SideTeam> {
  const mixed = shuffle(players, rng);
  const out = {} as Record<Side, SideTeam>;
  SIDES.forEach((side, i) => {
    const members = mixed.filter((_, j) => j % 2 === i);
    out[side] = { ...RANDOM_TEAMS[side], teamId: null, members, spymaster: pickSpymaster(members, avoid, rng) };
  });
  return out;
}

/**
 * Squadre della partita: i team della serata se sono esattamente due con giocatori, ognuno con almeno 2 membri
 * (chi non ha un team va nella squadra più piccola); altrimenti due squadre estratte a caso, equilibrate.
 */
export function formTeams(players: ParticipantInfo[], teams: TeamInfo[], avoid: string[], rng: () => number): Record<Side, SideTeam> {
  const withPlayers = teams.filter((t) => players.some((p) => p.teamId === t.id));
  const sizes = withPlayers.map((t) => players.filter((p) => p.teamId === t.id).length);
  if (withPlayers.length !== 2 || sizes.some((n) => n < 2)) return randomTeams(players.map((p) => p.id), avoid, rng);
  const groups = withPlayers.map((t) => players.filter((p) => p.teamId === t.id).map((p) => p.id));
  for (const p of players) {
    if (groups.some((g) => g.includes(p.id))) continue;
    (groups[0]!.length <= groups[1]!.length ? groups[0]! : groups[1]!).push(p.id);
  }
  const out = {} as Record<Side, SideTeam>;
  SIDES.forEach((side, i) => {
    const t = withPlayers[i]!;
    out[side] = { name: t.name, color: t.color ?? RANDOM_TEAMS[side].color, teamId: t.id, members: groups[i]!, spymaster: pickSpymaster(groups[i]!, avoid, rng) };
  });
  return out;
}

// ---- Griglia ----

/** Parole e mappa della partita: si preferiscono le parole non uscite nei round precedenti (`seen`). */
export function dealCards(cfg: AgentiSegretiConfig, starting: Side, seen: string[], rng: () => number): Card[] {
  const grid = GRID[cfg.gridSize];
  const unique = [...new Map(cfg.words.map((w) => [normalizeWord(w), w.trim()])).values()];
  const old = new Set(seen.map(normalizeWord));
  const fresh = shuffle(unique.filter((w) => !old.has(normalizeWord(w))), rng);
  const reused = shuffle(unique.filter((w) => old.has(normalizeWord(w))), rng);
  const words = [...fresh, ...reused].slice(0, grid.size);
  const assassins = Math.min(cfg.assassins, grid.size - grid.first - grid.second);
  const kinds: CardKind[] = [
    ...Array<CardKind>(grid.first).fill(starting),
    ...Array<CardKind>(grid.second).fill(other(starting)),
    ...Array<CardKind>(assassins).fill("assassin"),
  ];
  while (kinds.length < words.length) kinds.push("civilian");
  const map = shuffle(kinds, rng);
  return words.map((word, i) => ({ word, kind: map[i]!, revealed: false, revealedBy: null }));
}

// ---- Fasi ----

function enter(s: S, phase: Phase, now: number, seconds: number | null): S {
  return { ...s, phase, phaseStartedAt: now, phaseEndsAt: seconds ? now + seconds * 1000 : null, pausedRemainingMs: null };
}

const covered = (s: S) => s.cards.flatMap((c, i) => (c.revealed ? [] : [i]));

/** Un nuovo voto della squadra di turno: le carte coperte, più «Passa» dopo la prima scoperta del turno. */
function startVote(s: S, now: number): S {
  const clue = s.clues[s.clues.length - 1]!;
  const members = agentsOf(s, s.turn);
  if (members.length === 0) return passTurn(s, now, "no-agents");
  const options = [...covered(s).map(String), ...(clue.guesses > 0 ? ["pass"] : [])];
  // La scadenza la tiene la fase (si ferma con la pausa): il voto si chiude solo quando confermano tutti o scade la fase.
  const vote = createVote({ options, max: 1, members, deadline: Number.MAX_SAFE_INTEGER });
  return enter({ ...s, vote }, "guess", now, s.cfg.guessSeconds);
}

/** Il turno passa all'altra squadra (o la partita finisce, se i turni sono finiti). */
function passTurn(s: S, now: number, reason: TurnEndReason): S {
  const next: S = { ...s, vote: null, clueError: null, lastEnd: { side: s.turn, reason }, turn: other(s.turn), turnNumber: s.turnNumber + 1 };
  if (next.turnNumber > next.maxTurns) return finish(next, now, "turns");
  return enter(next, "clue", now, s.cfg.clueSeconds);
}

/** Fine per turni o per decisione della regia: vince chi ha meno agenti da trovare; a parità, pareggio. */
function finish(s: S, now: number, reason: "turns" | "host"): S {
  const red = agentsLeft(s, "red");
  const blue = agentsLeft(s, "blue");
  const winner: Outcome["winner"] = red === blue ? "draw" : red < blue ? "red" : "blue";
  return enter({ ...s, vote: null, outcome: { winner, reason } }, "reveal", now, null);
}

function giveClue(s: S, playerId: string, word: string, count: ClueCount, now: number): S {
  const problem =
    (count === 0 || count === "inf") && !s.cfg.allowZeroInfinity ? "In questa partita gli indizi con 0 e ∞ non sono ammessi" : clueProblem(word, s.cards.filter((c) => !c.revealed).map((c) => c.word));
  if (problem) {
    if (s.clueError?.playerId === playerId && s.clueError.text === problem) return s;
    return { ...s, clueError: { playerId, text: problem } };
  }
  const clue: Clue = { seq: s.clues.length + 1, side: s.turn, word: word.trim(), count, guesses: 0, rejected: false };
  // Con un nuovo indizio l'ultima scoperta non si annulla più: il gioco è andato avanti.
  return startVote({ ...s, clues: [...s.clues, clue], clueError: null, undo: null }, now);
}

/** Chiude il voto: la carta più votata si scopre; con un pareggio o senza voti non si scopre nulla e il turno passa. */
function closeVote(s: S, now: number): S {
  if (!s.vote) return s;
  const { picked } = resolveVote(s.vote, { mode: "none" }, () => 0, { onTie: "none" });
  const choice = picked[0];
  if (choice === undefined) return passTurn(s, now, tally(s.vote).length > 0 ? "tie" : "no-votes");
  if (choice === "pass") return passTurn(s, now, "pass");
  return revealCard(s, Number(choice), now);
}

function revealCard(s: S, index: number, now: number): S {
  const card = s.cards[index];
  if (!card || card.revealed) return s;
  const undo: UndoSnapshot = { cardIndex: index, turn: s.turn, turnNumber: s.turnNumber, clues: s.clues, lastEnd: s.lastEnd };
  const cards = s.cards.map((c, i) => (i === index ? { ...c, revealed: true, revealedBy: s.turn } : c));
  const clues = s.clues.map((c, i) => (i === s.clues.length - 1 ? { ...c, guesses: c.guesses + 1 } : c));
  const next: S = { ...s, cards, clues, undo, lastReveal: index, vote: null };
  if (card.kind === "assassin") return enter({ ...next, outcome: { winner: other(s.turn), reason: "assassin" } }, "reveal", now, null);
  // Vince chi ha scoperto tutti i propri agenti, anche se l'ultimo l'ha scoperto l'avversario.
  const done = SIDES.find((side) => agentsLeft(next, side) === 0);
  if (done) return enter({ ...next, outcome: { winner: done, reason: "agents" } }, "reveal", now, null);
  if (card.kind !== s.turn) return passTurn(next, now, "wrong");
  const left = guessesLeft(next);
  if (left === 0) return passTurn(next, now, "limit");
  return startVote(next, now);
}

/** «Annulla scoperta»: rimette coperta l'ultima carta e ripristina turno, indizi ed esito. Un solo livello. */
function undoReveal(s: S, now: number): S {
  const u = s.undo;
  if (!u) return s;
  const cards = s.cards.map((c, i) => (i === u.cardIndex ? { ...c, revealed: false, revealedBy: null } : c));
  const restored: S = { ...s, cards, turn: u.turn, turnNumber: u.turnNumber, clues: u.clues, lastEnd: u.lastEnd, outcome: null, undo: null, lastReveal: null, clueError: null };
  return startVote(restored, now);
}

/** Un input arriva in tempo per la fase in corso (con la tolleranza sulla scadenza). */
const inTime = (s: S, receivedAt: number) => s.pausedRemainingMs === null && (s.phaseEndsAt === null || receivedAt <= s.phaseEndsAt + GRACE_MS);

const PLAYING: Phase[] = ["clue", "guess"];

// ---- Punti ----

function playerTotals(s: S): Record<string, number> {
  const totals: Record<string, number> = {};
  if (!s.outcome) return totals;
  for (const side of SIDES) {
    const found = s.cards.filter((c) => c.kind === side && c.revealed).length;
    const points = (s.outcome.winner === side ? s.cfg.points.win : 0) + found * s.cfg.points.perAgent;
    for (const id of s.teams[side].members) totals[id] = points;
  }
  return totals;
}

function scoresOf(s: S): ScoreDelta[] {
  return totalsToScores(playerTotals(s), "Agenti Segreti");
}

// ---- Viste ----

/** I numeri di questa partita per la pagina «Regole» del telefono. Sono pubblici. */
export interface RulesInfo {
  gridSize: AgentiSegretiConfig["gridSize"];
  first: number;
  second: number;
  civilians: number;
  assassins: number;
  clueSeconds: number;
  guessSeconds: number;
  maxTurns: number;
  allowZeroInfinity: boolean;
  win: number;
  perAgent: number;
}

function rulesOf(s: S): RulesInfo {
  const grid = GRID[s.cfg.gridSize];
  const assassins = s.cards.filter((c) => c.kind === "assassin").length;
  return {
    gridSize: s.cfg.gridSize,
    first: grid.first,
    second: grid.second,
    civilians: s.cards.length - grid.first - grid.second - assassins,
    assassins,
    clueSeconds: s.cfg.clueSeconds,
    guessSeconds: s.cfg.guessSeconds,
    maxTurns: s.cfg.maxTurns,
    allowZeroInfinity: s.cfg.allowZeroInfinity,
    win: s.cfg.points.win,
    perAgent: s.cfg.points.perAgent,
  };
}

const over = (s: S) => s.phase === "reveal" || s.phase === "done";

/** Carta come la vedono TV e agenti: coperta = solo la parola (la chiave `kind` non c'è proprio); scoperta o a fine partita = tutto. */
function publicCard(s: S, c: Card) {
  return c.revealed || over(s) ? { word: c.word, revealed: c.revealed, kind: c.kind, revealedBy: c.revealedBy } : { word: c.word, revealed: false };
}

/** Parte uguale per TV e telefoni. Nella fase `setup` la griglia non c'è ancora. */
function publicView(s: S) {
  const dealt = s.phase !== "setup";
  const clue = activeClue(s);
  const vote = s.phase === "guess" ? s.vote : null;
  return {
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    phaseEndsAt: s.phaseEndsAt,
    pausedRemainingMs: s.pausedRemainingMs,
    rules: rulesOf(s),
    starting: s.starting,
    turn: s.turn,
    turnNumber: Math.min(s.turnNumber, s.maxTurns),
    maxTurns: s.cfg.maxTurns,
    teams: Object.fromEntries(
      SIDES.map((side) => {
        const t = s.teams[side];
        return [
          side,
          {
            name: t.name,
            color: t.color,
            spymaster: { id: t.spymaster, nickname: nick(s, t.spymaster) },
            members: t.members.map((id) => ({ id, nickname: nick(s, id) })),
            agentsLeft: dealt ? agentsLeft(s, side) : null,
          },
        ];
      }),
    ) as Record<Side, { name: string; color: string; spymaster: { id: string; nickname: string }; members: { id: string; nickname: string }[]; agentsLeft: number | null }>,
    cards: dealt ? s.cards.map((c) => publicCard(s, c)) : [],
    clue: clue ? { side: clue.side, word: clue.word, count: clue.count, guesses: clue.guesses } : null,
    guessesLeft: s.phase === "guess" ? guessesLeft(s) : null,
    clues: s.clues.map((c) => ({ seq: c.seq, side: c.side, word: c.word, count: c.count, guesses: c.guesses, rejected: c.rejected })),
    // I voti sono pubblici (come le dita sulle carte del gioco da tavolo): chi ha votato cosa, e chi ha confermato.
    votes: vote
      ? tally(vote).map((t) => ({
          option: t.option,
          voters: vote.members.filter((m) => (vote.picks[m] ?? []).some((p) => p.option === t.option)).map((id) => ({ id, nickname: nick(s, id) })),
        }))
      : [],
    voters: vote ? vote.members.length : 0,
    confirmed: vote ? vote.ready.length : 0,
    canPass: vote ? vote.options.includes("pass") : false,
    lastEnd: s.lastEnd,
    lastReveal: s.lastReveal,
    blindBroken: s.blindBroken,
    outcome: s.outcome,
  };
}

export const agentiSegreti: MinigameType<AgentiSegretiConfig, AgentiSegretiState, Input, Command> = {
  id: "agenti-segreti",
  title: "Agenti Segreti",
  defaultTheme: "retro80",
  configSchema: agentiSegretiConfigSchema as unknown as z.ZodType<AgentiSegretiConfig>,
  inputSchema,
  commandSchema,
  minPlayers: 4,
  maxPlayers: 30,

  // Le parole stanno nel database (una «Lista di parole» della libreria): l'istanza la riferisce per id.
  libraryConfigSchema: agentiSegretiLibrarySchema as unknown as z.ZodType<unknown>,
  draftLibraryConfig: { words: [], gridSize: "5x5" },
  buildConfig(raw, lookup) {
    const parsed = agentiSegretiLibrarySchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
    const { wordList, words: own, ...rest } = parsed.data;
    const listWords = wordList ? lookupWordList(lookup, wordList) : [];
    if (!listWords) return { ok: false, error: "Lista di parole non valida o non trovata" };
    const config = agentiSegretiConfigSchema.safeParse({ ...rest, words: mergeWords(listWords, own) });
    return config.success ? { ok: true, config: config.data } : { ok: false, error: ENOUGH };
  },

  // Solo per i test e i simulatori: le parole vere vengono dalla libreria.
  sampleConfig: {
    words: Array.from({ length: 60 }, (_, i) => `Parola${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`),
    gridSize: "5x5",
    assassins: 1,
    clueSeconds: 90,
    guessSeconds: 60,
    maxTurns: 0,
    allowZeroInfinity: true,
    points: { win: 100, perAgent: 0 },
  },

  init(config, ctx, now) {
    const rng = makeRng(ctx.seed);
    const seen = ctx.seen ?? [];
    const pastSpymasters = seen.filter((x) => x.startsWith(SPYMASTER_SEEN)).map((x) => x.slice(SPYMASTER_SEEN.length));
    const teams = formTeams(ctx.players, ctx.teams, pastSpymasters, rng);
    const starting: Side = rng() < 0.5 ? "red" : "blue";
    const cards = dealCards(config, starting, seen, makeRng(deriveSeed(ctx.seed, 1)));
    return {
      cfg: config,
      seed: ctx.seed,
      participants: ctx.players,
      players: ctx.players.map((p) => p.id),
      teams,
      pastSpymasters,
      shuffles: 0,
      starting,
      turn: starting,
      turnNumber: 1,
      maxTurns: config.maxTurns || TURN_CAP,
      cards,
      clues: [],
      vote: null,
      lastEnd: null,
      lastReveal: null,
      clueError: null,
      undo: null,
      blind: false,
      blindBroken: false,
      outcome: null,
      phase: "setup",
      phaseStartedAt: now,
      phaseEndsAt: null,
      pausedRemainingMs: null,
    };
  },

  onInput(state, playerId, input, meta) {
    if (!state.players.includes(playerId)) return state;
    const at = meta.receivedAt;
    switch (input.type) {
      case "clue":
        if (state.phase !== "clue" || playerId !== state.teams[state.turn].spymaster || !inTime(state, at)) return state;
        return giveClue(state, playerId, input.word, input.count, at);
      case "pick": {
        if (state.phase !== "guess" || !state.vote || !inTime(state, at)) return state;
        const vote = castVote(state.vote, playerId, String(input.option));
        return vote === state.vote ? state : { ...state, vote };
      }
      case "confirm": {
        if (state.phase !== "guess" || !state.vote || !inTime(state, at)) return state;
        const vote = confirmVote(state.vote, playerId);
        if (vote === state.vote) return state;
        const next = { ...state, vote };
        return vote.members.every((m) => vote.ready.includes(m)) ? closeVote(next, at) : next;
      }
    }
  },

  onTick(state, now) {
    if (state.pausedRemainingMs !== null || state.phaseEndsAt === null) return state;
    if (state.phase === "clue" && now >= state.phaseEndsAt) return passTurn(state, now, "clue-timeout");
    // I voti hanno la tolleranza sulla scadenza: un tocco in tempo può arrivare un po' dopo.
    if (state.phase === "guess" && now >= state.phaseEndsAt + GRACE_MS) return closeVote(state, now);
    return state;
  },

  onHostCommand(state, command, now) {
    const setup = state.phase === "setup";
    switch (command.type) {
      case "move-player": {
        const from = sideOf(state, command.playerId);
        if (!setup || !from || from === command.side || state.teams[from].members.length <= 2) return state;
        const leaving = state.teams[from].members.filter((id) => id !== command.playerId);
        const fromTeam = { ...state.teams[from], members: leaving, spymaster: state.teams[from].spymaster === command.playerId ? leaving[0]! : state.teams[from].spymaster };
        const toTeam = { ...state.teams[command.side], members: [...state.teams[command.side].members, command.playerId] };
        return { ...state, teams: { ...state.teams, [from]: fromTeam, [command.side]: toTeam } as Record<Side, SideTeam> };
      }
      case "set-spymaster": {
        const team = state.teams[command.side];
        if (!setup || !team.members.includes(command.playerId) || team.spymaster === command.playerId) return state;
        return { ...state, teams: { ...state.teams, [command.side]: { ...team, spymaster: command.playerId } } };
      }
      case "shuffle-teams": {
        if (!setup) return state;
        const shuffles = state.shuffles + 1;
        return { ...state, shuffles, teams: randomTeams(state.players, state.pastSpymasters, makeRng(deriveSeed(state.seed, 1000 + shuffles))) };
      }
      case "deal":
        return setup ? enter(state, "clue", now, state.cfg.clueSeconds) : state;
      case "pause":
        if (!PLAYING.includes(state.phase) || state.pausedRemainingMs !== null || state.phaseEndsAt === null) return state;
        return { ...state, pausedRemainingMs: Math.max(0, state.phaseEndsAt - now), phaseEndsAt: null };
      case "resume":
        return state.pausedRemainingMs === null ? state : { ...state, phaseEndsAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
      case "reject-clue": {
        // Indizio non valido a giudizio della regia (per esempio un pezzo di una carta): il turno passa.
        if (state.phase !== "guess") return state;
        const clues = state.clues.map((c, i) => (i === state.clues.length - 1 ? { ...c, rejected: true } : c));
        return passTurn({ ...state, clues }, now, "rejected");
      }
      case "end-turn":
        return PLAYING.includes(state.phase) ? passTurn(state, now, "host") : state;
      case "undo-reveal":
        return state.undo && (PLAYING.includes(state.phase) || state.phase === "reveal") ? undoReveal(state, now) : state;
      case "set-blind":
        if (state.blind === command.blind) return state;
        return { ...state, blind: command.blind, blindBroken: state.blindBroken || (!command.blind && !setup) };
      case "end":
        return PLAYING.includes(state.phase) ? finish(state, now, "host") : state;
      case "next":
        return state.phase === "reveal" ? enter(state, "done", now, null) : state;
    }
  },

  isFinished: (state) => state.phase === "done",
  scores: (state) => scoresOf(state),
  result: (state) => rankByPoints(playerTotals(state), state.players),
  shownItems: (state) =>
    state.phase === "setup" ? [] : [...state.cards.map((c) => c.word), ...SIDES.map((side) => `${SPYMASTER_SEEN}${state.teams[side].spymaster}`)],

  screenView(state) {
    return publicView(state);
  },

  viewFor(state, playerId) {
    if (!state.players.includes(playerId)) return { ...publicView(state), me: null };
    const side = sideOf(state, playerId);
    const spymaster = isSpymaster(state, playerId);
    const vote = state.phase === "guess" && state.vote?.members.includes(playerId) ? state.vote : null;
    return {
      ...publicView(state),
      me: {
        id: playerId,
        side,
        role: spymaster ? ("spymaster" as const) : side ? ("agent" as const) : ("spectator" as const),
        canClue: state.phase === "clue" && side === state.turn && spymaster,
        canVote: vote !== null,
        myPick: vote ? ((vote.picks[playerId] ?? [])[0]?.option ?? null) : null,
        confirmed: vote ? vote.ready.includes(playerId) : false,
        // La mappa: solo ai Capi-spia e solo da «Distribuisci» (prima, e per gli altri, la chiave non c'è).
        ...(spymaster && state.phase !== "setup" && { map: state.cards.map((c) => c.kind) }),
        ...(state.clueError?.playerId === playerId && state.phase === "clue" && { clueError: state.clueError.text }),
      },
    };
  },

  hostView(state) {
    const playing = PLAYING.includes(state.phase);
    const pub = publicView(state);
    return {
      info: {
        phase: state.phase,
        blind: state.blind,
        blindBroken: state.blindBroken,
        turn: state.turn,
        turnNumber: pub.turnNumber,
        maxTurns: state.maxTurns,
        pausedRemainingMs: state.pausedRemainingMs,
        teams: pub.teams,
        canMove: Object.fromEntries(SIDES.map((side) => [side, state.phase === "setup" && state.teams[side].members.length > 2])),
        clue: pub.clue,
        clues: pub.clues,
        votes: pub.votes,
        voters: pub.voters,
        confirmed: pub.confirmed,
        canUndo: !!state.undo && (playing || state.phase === "reveal"),
        lastReveal: state.undo ? state.cards[state.undo.cardIndex]?.word : null,
        clueError: state.phase === "clue" ? (state.clueError?.text ?? null) : null,
        outcome: state.outcome,
        // In modalità cieca la regia vede solo ciò che vede la TV: niente mappa delle carte coperte.
        cards: state.blind ? pub.cards : state.phase === "setup" ? [] : state.cards.map((c) => ({ word: c.word, revealed: c.revealed, kind: c.kind, revealedBy: c.revealedBy })),
      },
      actions: [
        { id: "deal", label: "Distribuisci", enabled: state.phase === "setup" },
        { id: "next", label: "Avanti", enabled: state.phase === "reveal" },
        { id: "shuffle-teams", label: "Mescola squadre", enabled: state.phase === "setup" },
        state.pausedRemainingMs !== null
          ? { id: "resume", label: "Riprendi", enabled: true }
          : { id: "pause", label: "Pausa", enabled: playing && state.phaseEndsAt !== null },
        { id: "reject-clue", label: "Indizio non valido", enabled: state.phase === "guess", danger: true },
        { id: "end-turn", label: "Fine turno", enabled: playing, danger: true },
        { id: "undo-reveal", label: "Annulla scoperta", enabled: !!state.undo && (playing || state.phase === "reveal"), danger: true },
        { id: "end", label: "Termina la partita", enabled: playing, danger: true },
      ],
    };
  },
};
