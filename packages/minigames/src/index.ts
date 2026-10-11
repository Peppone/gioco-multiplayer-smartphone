import type { AnyMinigame } from "@gioco/shared";
import { buzzer } from "./buzzer/index.js";
import { quizMultipla } from "./quiz-multipla/index.js";

export { buzzer, quizMultipla };

/** Registro dei tipi di minigioco disponibili, per id. */
export const minigames: Record<string, AnyMinigame> = {
  [quizMultipla.id]: quizMultipla,
  [buzzer.id]: buzzer,
};
