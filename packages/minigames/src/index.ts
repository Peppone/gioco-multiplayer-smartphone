import type { AnyMinigame } from "@gioco/shared";
import { buzzer } from "./buzzer/index.js";
import { DEFAULT_DECK, createKnightDuel, deckSchema } from "./knight-duel/index.js";
import { quizMultipla } from "./quiz-multipla/index.js";
import { sondaggio } from "./sondaggio/index.js";
import { stima } from "./stima/index.js";
import { veroFalso } from "./vero-falso/index.js";

export { buzzer, quizMultipla, sondaggio, stima, veroFalso };
export * as duel from "./knight-duel/index.js";

/** Minigiochi che si giocano come round di una partita (e che il duello può orchestrare). */
export const roundMinigames: Record<string, AnyMinigame> = {
  [quizMultipla.id]: quizMultipla,
  [buzzer.id]: buzzer,
  [veroFalso.id]: veroFalso,
  [stima.id]: stima,
  [sondaggio.id]: sondaggio,
};

const knightDuel = createKnightDuel(roundMinigames);

/**
 * Registro di tutti i plugin, per id. I plugin con `modeConfigSchema` (come il duello) sono modalità di
 * partita: si scelgono impostando `matches.mode`, non si aggiungono come round. Per aggiungere un
 * minigioco: vedi docs/NUOVO-MINIGIOCO.md.
 */
export const minigames: Record<string, AnyMinigame> = { ...roundMinigames, [knightDuel.id]: knightDuel };

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
};
