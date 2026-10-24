import { z } from "zod";
import type { TeamVote } from "../team-vote.js";
import type { Token } from "./board.js";
import type { Body, Seen } from "./sky.js";
import type { Difficulty, Fact, TopicId } from "./system.js";

/** Ciò che una squadra può fare nel suo turno (piano, §3.3). */
export type Action =
  | { type: "survey"; object: Seen; from: number; to: number }
  | { type: "target"; sector: number }
  | { type: "research"; topic: TopicId }
  | { type: "locate"; sector: number; left: Seen; right: Seen }
  | { type: "pass" };

const sector = z.number().int().min(1).max(18);
const seen = z.enum(["asteroid", "dwarf", "comet", "gas", "empty"]);
const token = z.enum(["asteroid", "comet", "gas", "dwarf"]);
const topic = z.enum(["A", "B", "C", "D", "E", "F"]);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("survey"), object: seen, from: sector, to: sector }),
  z.object({ type: z.literal("target"), sector }),
  z.object({ type: z.literal("research"), topic }),
  z.object({ type: z.literal("locate"), sector, left: seen, right: seen }),
]);

export const inputSchema = z.discriminatedUnion("type", [
  /** Una proposta d'azione per il turno della squadra. */
  z.object({ type: z.literal("propose"), action: actionSchema }),
  z.object({ type: z.literal("vote"), proposalId: z.string().min(1).max(20) }),
  /** Il capitano sceglie una proposta (con `decision: "captain"`, o per risolvere una parità). */
  z.object({ type: z.literal("decide"), proposalId: z.string().min(1).max(20) }),
  /** Conferma: del voto del turno, o della scelta delle teorie / dell'ipotesi. */
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("theory"), sector, object: token }),
  z.object({ type: z.literal("withdraw"), sector }),
  /** Ultima opportunità o ipotesi finale: localizzare il Pianeta X. */
  z.object({ type: z.literal("guess"), sector, left: seen, right: seen }),
  z.object({ type: z.literal("note"), sector, object: z.enum(["asteroid", "dwarf", "comet", "gas", "empty", "planetX"]), mark: z.enum(["excluded", "supposed", "confirmed"]).nullable() }),
  z.object({ type: z.literal("noteSector"), sector, mark: z.enum(["looksEmpty", "excludeRest", "clear"]) }),
]);
export type Input = z.infer<typeof inputSchema>;

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("next") }),
  /** Applica subito la proposta più votata. */
  z.object({ type: z.literal("force-decide") }),
  /** La squadra di turno passa e avanza di 1. */
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("set-difficulty"), teamId: z.string().min(1), difficulty: z.enum(["youth", "beginner", "experienced", "genius"]) }),
  z.object({ type: z.literal("unlock-solution") }),
  z.object({ type: z.literal("end") }),
]);
export type Command = z.infer<typeof commandSchema>;

export type Mark = "excluded" | "supposed" | "confirmed";

export interface LogEntry {
  /** Tempo (giorni) a cui l'azione è stata fatta. */
  time: number;
  action: Action;
  cost: number;
  /** Il risultato, privato della squadra. */
  result: ActionResult;
}

export type ActionResult =
  | { type: "survey"; count: number }
  | { type: "target"; seen: Seen }
  | { type: "research"; topic: TopicId }
  | { type: "locate"; ok: boolean }
  | { type: "pass" };

export interface Proposal {
  id: string;
  by: string;
  action: Action;
}

export interface Guess {
  sector: number;
  left: Seen;
  right: Seen;
}

export interface Observatory {
  id: string;
  /** Indice della serie di fatti iniziali assegnata (umani nell'ordine della serata, poi i robot). */
  slot: number;
  bot: boolean;
  name: string;
  color: string;
  members: string[];
  captainId: string | null;
  difficulty: Difficulty;
  /** Giorni percorsi: il settore è `time mod N + 1`. */
  time: number;
  /** Ordine nella pila: a pari tempo agisce chi ha il numero più basso. */
  stack: number;
  targetsLeft: number;
  lastWasResearch: boolean;
  tokens: Record<Token, number>;
  facts: Fact[];
  log: LogEntry[];
  /** Foglio appunti condiviso: «settore:oggetto» → segno. */
  notes: Record<string, Mark>;
  proposals: Proposal[];
  vote: TeamVote | null;
  chosen: Action | null;
  /** Teorie scelte e non ancora inviate (fase teoria e ultime opportunità). */
  draft: { sector: number; object: Token }[];
  /** Ipotesi su dove sta il Pianeta X (ultima opportunità o ipotesi finale). */
  guess: Guess | null;
  readyBy: string[];
  /** Quando il bot sceglie. */
  botAt: number | null;
  /** Il Pianeta X localizzato nel turno (prima opportunità). */
  located: boolean;
  /** Punti già assegnati da ultima opportunità e ipotesi finale (in punti originali). */
  guessPoints: number;
  /** Quante proposte ha fatto (per gli id). */
  proposalSeq: number;
}

export interface Theory {
  id: number;
  ownerId: string;
  sector: number;
  object: Token;
  /** Spazio della pista di revisione: 0 = esterno [+], 3 = interno [↻]. */
  space: 0 | 1 | 2 | 3;
  /** Fase teoria in cui è stata inviata (priorità); le ultime opportunità hanno una fase maggiore di tutte. */
  phase: number;
  faceUp: boolean;
  /** Null finché è coperta. */
  correct: boolean | null;
}

export type { Body, Difficulty, Fact, Token, TopicId };
