import { z } from "zod";
import { type Deck, deckSchema } from "./cards.js";

/**
 * Istanza del duello in libreria, come la compila l'admin: riferisce altre istanze (minigiochi, mazzo) per id.
 * Gli sfidanti non ci sono: li sceglie `buildConfig` tra squadre o giocatori della serata. All'avvio della
 * partita il server la «risolve» in `DuelConfig`.
 */
export const duelLibrarySchema = z.object({
    kind: z.enum(["teams", "players"]).default("teams").meta({
      title: "Chi si sfida",
      enumLabels: { teams: "Due squadre (le prime due della serata, in ordine alfabetico)", players: "Due giocatori (estratti a sorte tra quelli della serata)" },
    }),
    pool: z
      .array(z.string().min(1))
      .min(1)
      .max(20)
      .meta({
        title: "Minigiochi",
        widget: "instance",
        instanceKind: "minigame",
        itemLabel: "Minigioco",
        description: "Istanze della libreria tra cui scegliere i minigiochi del duello",
      }),
    deck: z.string().min(1).optional().meta({ title: "Mazzo di carte", widget: "instance", instanceKind: "deck", description: "Vuoto = mazzo base" }),
    selection: z.enum(["random", "admin"]).default("random").meta({
      title: "Scelta del minigioco",
      enumLabels: { random: "A caso (senza ripetizioni)", admin: "La sceglie la regia ogni volta" },
    }),
    hp: z.number().int().min(5).max(100).default(20).meta({ title: "Punti vita dei cavalieri" }),
    minigamesPerBattle: z.number().int().min(1).max(5).default(2).meta({ title: "Minigiochi tra una battaglia e l'altra" }),
    maxBattles: z.number().int().min(1).max(20).default(6).meta({ title: "Battaglie massime", description: "Poi vince chi ha più PV; in parità si va a oltranza" }),
    draftSize: z.number().int().min(2).max(8).default(5).meta({ title: "Carte offerte a ogni draft", description: "Meglio che siano più delle carte che si prendono, così si sceglie davvero" }),
    winnerPicks: z.number().int().min(1).max(3).default(2).meta({ title: "Carte scelte da chi vince il minigioco" }),
    loserPicks: z.number().int().min(1).max(3).default(1).meta({ title: "Carte scelte da chi perde il minigioco" }),
    maxPlays: z.number().int().min(1).max(4).default(2).meta({ title: "Carte giocabili per battaglia" }),
    handLimit: z.number().int().min(3).max(10).default(6).meta({ title: "Carte massime in mano", description: "Oltre il limite la carta più vecchia viene scartata" }),
    draftSeconds: z.number().int().min(5).max(60).default(15).meta({ title: "Tempo per scegliere al draft (s)" }),
    battleSeconds: z.number().int().min(5).max(90).default(20).meta({ title: "Tempo per scegliere le carte in battaglia (s)" }),
    fallback: z.enum(["random", "prudent", "none"]).default("random").meta({
      title: "Se il team non vota in battaglia",
      enumLabels: { random: "Una carta a caso", prudent: "Una carta difensiva (se c'è)", none: "Nessuna carta" },
    }),
    winnerPoints: z.number().int().min(0).max(10_000).default(500).meta({ title: "Punti serata a ogni vincitore" }),
    loserPoints: z.number().int().min(0).max(10_000).default(100).meta({ title: "Punti serata a ogni perdente" }),
  });

export type DuelLibrary = z.infer<typeof duelLibrarySchema>;

/** Impostazioni del duello con gli sfidanti già scelti (id di squadre o di giocatori). */
export const duelModeSchema = duelLibrarySchema
  .extend({ sideA: z.string().min(1), sideB: z.string().min(1) })
  .refine((c) => c.sideA !== c.sideB, { message: "I due sfidanti devono essere diversi", path: ["sideB"] });

export type DuelMode = z.infer<typeof duelModeSchema>;

/** Istanza della libreria già letta dal database e fissata all'avvio (il plugin non accede mai al database). */
export const resolvedInstanceSchema = z.object({
  instanceId: z.string(),
  title: z.string(),
  typeId: z.string(),
  theme: z.enum(["gameshow", "pixel", "manga", "retro80", "boom"]),
  config: z.unknown(),
});
export type ResolvedInstance = z.infer<typeof resolvedInstanceSchema>;

/** Configurazione completa con cui parte il plugin. */
export const duelConfigSchema = z.object({
  mode: duelModeSchema,
  pool: z.array(resolvedInstanceSchema).min(1),
  deck: deckSchema,
});

export interface DuelConfig {
  mode: DuelMode;
  pool: ResolvedInstance[];
  deck: Deck;
}
