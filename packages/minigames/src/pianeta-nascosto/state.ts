import { z } from "zod";
import type { ParticipantInfo } from "@gioco/shared";
import { type Token, TOKEN_KINDS } from "./board.js";
import type { Clue } from "./clues.js";
import { type Knowledge, emptyKnowledge } from "./solver.js";
import type { Mode, ObjectKind } from "./sky.js";
import { SECTORS } from "./sky.js";
import type { ConferenceId, Fact, TopicId } from "./system.js";
import type { ReviewEvent } from "./theories.js";
import type { Observatory, Theory } from "./types.js";

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });

export const pianetaConfigSchema = z.object({
  mode: z.enum(["standard", "expert"]).default("standard").meta({ ...sec("Modalità", "Base: 12 settori. Esperto: 18 settori, più pianeti nani e due conferenze"), enumLabels: { standard: "Base (12 settori)", expert: "Esperto (18 settori)" } }),
  source: z.enum(["generated", "official"]).default("generated").meta({ ...sec("Origine del sistema", "Generato dall'app oppure uno schema importato dall'app ufficiale (Libreria → Schemi dell'app ufficiale)"), enumLabels: { generated: "Generato dall'app", official: "Schema dell'app ufficiale" } }),
  code: z.string().trim().toUpperCase().regex(/^([A-Z0-9]{4})?$/, "Il codice ha 4 caratteri (lettere e numeri)").default("").meta(sec("Codice dello schema", "Solo con gli schemi dell'app ufficiale: vuoto = uno a caso tra quelli importati")),
  turnMode: z.enum(["sequential", "simultaneous"]).default("sequential").meta({ ...sec("Turni", "Una squadra alla volta (come l'originale) oppure insieme le squadre nello stesso settore più arretrato"), enumLabels: { sequential: "Una squadra alla volta", simultaneous: "Squadre insieme" } }),
  decision: z.enum(["vote", "captain"]).default("vote").meta({ ...sec("Chi decide", "Voto della squadra (in parità decide il capitano) oppure solo il capitano"), enumLabels: { vote: "Voto della squadra", captain: "Il capitano" } }),
  turnSeconds: z.number().int().min(0).max(600).default(90).meta(sec("Durata di un turno (s)", "0 = senza limite")),
  theorySeconds: z.number().int().min(0).max(600).default(60).meta(sec("Durata delle fasi teoria (s)", "0 = senza limite")),
  difficulty: z.enum(["youth", "beginner", "experienced", "genius"]).default("beginner").meta({ ...sec("Informazioni iniziali", "Quanti fatti riceve ogni squadra: 12, 8, 4 o 0. La regia può cambiarlo per una squadra"), enumLabels: { youth: "Ragazzi (12 fatti)", beginner: "Principiante (8 fatti)", experienced: "Esperto (4 fatti)", genius: "Genio (nessun fatto)" } }),
  assist: z.boolean().default(false).meta(sec("Aiuto alla deduzione", "Il foglio segna da solo le certezze dirette (un puntamento, un rilevamento a zero)")),
  maxDays: z.number().int().min(0).max(200).default(0).meta(sec("Giorni massimi", "0 = nessun limite. Superato il limite si apre l'ipotesi finale sul Pianeta X")),
  bots: z.number().int().min(0).max(3).default(0).meta(sec("Osservatori robot", "Squadre simulate (fuori dalla classifica generale). Con una sola squadra almeno 1")),
  botLevel: z.enum(["easy", "normal", "hard"]).default("normal").meta({ ...sec("Abilità dei robot"), enumLabels: { easy: "Facile", normal: "Normale", hard: "Difficile" } }),
  blindHost: z.boolean().default(true).meta(sec("Regia cieca", "La regia non vede il sistema solare né i risultati finché non li sblocca")),
  pointScale: z.number().int().min(1).max(50).default(10).meta(sec("Moltiplicatore dei punti", "I punti originali del gioco si moltiplicano per questo valore")),
});
export type PianetaConfig = z.infer<typeof pianetaConfigSchema>;

export type Phase = "briefing" | "turn" | "resolve" | "conference" | "theory" | "review" | "lastCall" | "finalGuess" | "reveal" | "final" | "done";

export interface PublicEntry {
  id: number;
  time: number;
  obsId: string;
  text: string;
  /** Localizzazione riuscita o fallita (solo per le localizzazioni). */
  ok?: boolean;
}

export interface PianetaState {
  cfg: PianetaConfig;
  seed: number;
  mode: Mode;
  participants: ParticipantInfo[];
  players: string[];
  /** Il sistema vero: solo stato e regia sbloccata. */
  sky: ObjectKind[];
  /** Il codice dello schema dell'app ufficiale usato, se c'è (solo stato e regia sbloccata). */
  schemeCode: string | null;
  /** Fatti iniziali di ogni osservatorio (3 blocchi da 4 per serie): la serie `slot % lunghezza` è dell'osservatorio. */
  factSeries: Fact[][][];
  topics: { id: TopicId; clue: Clue }[];
  conferences: { id: ConferenceId; clue: Clue; held: boolean }[];
  observatories: Observatory[];
  theories: Theory[];
  nextTheoryId: number;
  /** Numero dell'ultima fase teoria aperta (la priorità delle teorie). */
  theoryPhase: number;
  confirmed: Record<number, Token>;
  refuted: { sector: number; object: Token }[];
  publicLog: PublicEntry[];
  /** Giorni percorsi dalla Terra: il settore indicato dalla freccia è `earth mod N + 1`. */
  earth: number;
  phase: Phase;
  stackCounter: number;
  actingIds: string[];
  finderIds: string[];
  /** Ultime opportunità: giorni di ritardo di ogni osservatorio dal localizzatore. */
  lastCall: Record<string, number> | null;
  /** La conferenza in corso (fase `conference`). */
  conferenceNow: ConferenceId | null;
  /** Ipotesi finale aperta perché si è superato `maxDays`. */
  fromMaxDays: boolean;
  review: { events: ReviewEvent[]; penalties: { ownerId: string; sector: number }[] } | null;
  eventSeq: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  pausedAt: number | null;
  hostUnlocked: boolean;
}

export const nOf = (s: { mode: Mode }): number => SECTORS[s.mode];

/** Chi gioca prima: meno giorni, poi più in fondo alla pila. */
export const byTurn = (a: Observatory, b: Observatory): number => a.time - b.time || a.stack - b.stack;

export const obsById = (s: PianetaState, id: string): Observatory | undefined => s.observatories.find((o) => o.id === id);
export const obsOf = (s: PianetaState, playerId: string): Observatory | undefined => s.observatories.find((o) => o.members.includes(playerId));

/** Ordina i proprietari di teorie per turno (per piazzamenti e penalità). */
export const turnOrderOf = (s: PianetaState) => (a: string, b: string) => {
  const [x, y] = [obsById(s, a), obsById(s, b)];
  return x && y ? byTurn(x, y) : 0;
};

export const isTokenKind = (k: string): k is Token => (TOKEN_KINDS as string[]).includes(k);

/** Tutto ciò che un osservatorio sa del sistema: fatti, risultati, ricerche lette, conferenze tenute, revisioni. */
export function knowledgeOf(s: PianetaState, obs: Observatory): Knowledge {
  const k = emptyKnowledge(s.mode);
  for (const f of obs.facts) k.notBody.push({ sector: f.sector, body: f.absent });
  for (const r of s.refuted) k.notBody.push({ sector: r.sector, body: r.object });
  for (const [sector, kind] of Object.entries(s.confirmed)) k.exact.push({ sector: Number(sector), kind });
  for (const entry of obs.log) {
    const a = entry.action;
    const r = entry.result;
    if (a.type === "target" && r.type === "target") k.exact.push({ sector: a.sector, kind: r.seen });
    else if (a.type === "survey" && r.type === "survey") k.surveys.push({ object: a.object, from: a.from, to: a.to, count: r.count });
    else if (a.type === "locate" && r.type === "locate" && !r.ok) k.failedLocations.push({ sector: a.sector, left: a.left, right: a.right });
    else if (r.type === "research") {
      const topic = s.topics.find((t) => t.id === r.topic);
      if (topic) k.clues.push(topic.clue);
    }
  }
  for (const c of s.conferences) if (c.held) k.clues.push(c.clue);
  return k;
}
