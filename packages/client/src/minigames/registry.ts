import type { ComponentType } from "react";
import { BuzzerController, BuzzerScreen } from "./buzzer/BuzzerViews";
import { QuizController, QuizScreen } from "./quiz/QuizViews";
import type { ControllerProps, ViewProps } from "./types";

export interface MinigameViews {
  Screen: ComponentType<ViewProps>;
  Controller: ComponentType<ControllerProps>;
}

/** Viste React dei minigiochi, per id del plugin (la logica sta in `@gioco/minigames`). */
export const minigameViews: Record<string, MinigameViews> = {
  "quiz-multipla": { Screen: QuizScreen, Controller: QuizController },
  buzzer: { Screen: BuzzerScreen, Controller: BuzzerController },
};
