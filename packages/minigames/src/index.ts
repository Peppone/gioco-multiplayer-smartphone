import type { AnyMinigame } from "@gioco/shared";
import { buzzer } from "./buzzer/index.js";
import { quizMultipla } from "./quiz-multipla/index.js";
import { sondaggio } from "./sondaggio/index.js";
import { stima } from "./stima/index.js";
import { veroFalso } from "./vero-falso/index.js";

export { buzzer, quizMultipla, sondaggio, stima, veroFalso };

/** Registro dei tipi di minigioco disponibili, per id. Per aggiungerne uno: vedi docs/NUOVO-MINIGIOCO.md. */
export const minigames: Record<string, AnyMinigame> = {
  [quizMultipla.id]: quizMultipla,
  [buzzer.id]: buzzer,
  [veroFalso.id]: veroFalso,
  [stima.id]: stima,
  [sondaggio.id]: sondaggio,
};
