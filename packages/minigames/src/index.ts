import type { AnyMinigame } from "@gioco/shared";
import { buzzer } from "./buzzer/index.js";
import { ghostHunt } from "./caccia-fantasmi/index.js";
import { indovinaCanzone } from "./indovina-canzone/index.js";
import { DEFAULT_DECK, createKnightDuel, deckSchema } from "./knight-duel/index.js";
import { quizMultipla } from "./quiz-multipla/index.js";
import { reazioneACatena, wordListSchema } from "./reazione-a-catena/index.js";
import { stanzeSegrete } from "./stanze-segrete/index.js";
import { scalata } from "./scalata/index.js";
import { shadowTournament } from "./shadow-tournament/index.js";
import { sondaggio } from "./sondaggio/index.js";
import { stima } from "./stima/index.js";
import { veroFalso } from "./vero-falso/index.js";
import { zombieHunt } from "./zombie-hunt/index.js";

export { buzzer, ghostHunt, indovinaCanzone, quizMultipla, reazioneACatena, scalata, shadowTournament, sondaggio, stanzeSegrete, stima, veroFalso, zombieHunt };
export * as duel from "./knight-duel/index.js";

/** Minigiochi che si giocano come round di una partita (e che il duello può orchestrare). */
export const roundMinigames: Record<string, AnyMinigame> = {
  [quizMultipla.id]: quizMultipla,
  [buzzer.id]: buzzer,
  [veroFalso.id]: veroFalso,
  [stima.id]: stima,
  [sondaggio.id]: sondaggio,
  [zombieHunt.id]: zombieHunt,
  [indovinaCanzone.id]: indovinaCanzone,
  [ghostHunt.id]: ghostHunt,
};

const knightDuel = createKnightDuel(roundMinigames);

/**
 * Registro di tutti i plugin, per id. Il duello è un minigioco come gli altri (si aggiunge come round), ma la
 * sua istanza riferisce altre istanze della libreria, quindi non è tra quelli che può orchestrare.
 * Per aggiungere un minigioco: vedi docs/NUOVO-MINIGIOCO.md.
 */
export const minigames: Record<string, AnyMinigame> = {
  ...roundMinigames,
  [knightDuel.id]: knightDuel,
  [stanzeSegrete.id]: stanzeSegrete,
  [reazioneACatena.id]: reazioneACatena,
  [scalata.id]: scalata,
  [shadowTournament.id]: shadowTournament,
};

/** Tipi di contenuto della libreria che non sono minigiochi (hanno solo un form di configurazione). */
export interface LibraryContentType {
  id: string;
  title: string;
  defaultTheme: "gameshow" | "pixel" | "manga" | "retro80";
  configSchema: import("zod").ZodType<unknown>;
  sampleConfig: unknown;
}

export const libraryContentTypes: Record<string, LibraryContentType> = {
  deck: {
    id: "deck",
    title: "Mazzo di carte (Duello)",
    defaultTheme: "pixel",
    configSchema: deckSchema as unknown as import("zod").ZodType<unknown>,
    sampleConfig: DEFAULT_DECK,
  },
  "word-list": {
    id: "word-list",
    title: "Lista di parole (Reazione a catena)",
    defaultTheme: "gameshow",
    configSchema: wordListSchema as unknown as import("zod").ZodType<unknown>,
    sampleConfig: { words: ["Pizza", "Spiaggia", "Telefono", "Montagna", "Chitarra", "Gelato"] },
  },
};
