import type { ComponentType } from "react";
import { BuzzerController, BuzzerScreen } from "./buzzer/BuzzerViews";
import { QuizController, QuizScreen } from "./quiz/QuizViews";
import { SondaggioController, SondaggioScreen } from "./sondaggio/SondaggioViews";
import { StimaController, StimaScreen } from "./stima/StimaViews";
import type { ControllerProps, ViewProps } from "./types";
import { VeroFalsoController, VeroFalsoScreen } from "./vero-falso/VeroFalsoViews";

export interface MinigameViews {
  Screen: ComponentType<ViewProps>;
  Controller: ComponentType<ControllerProps>;
}

/**
 * Viste React dei minigiochi, per id del plugin (la logica sta in `@gioco/minigames`).
 * Per aggiungerne una: vedi docs/NUOVO-MINIGIOCO.md.
 */
export const minigameViews: Record<string, MinigameViews> = {
  "quiz-multipla": { Screen: QuizScreen, Controller: QuizController },
  buzzer: { Screen: BuzzerScreen, Controller: BuzzerController },
  "vero-falso": { Screen: VeroFalsoScreen, Controller: VeroFalsoController },
  stima: { Screen: StimaScreen, Controller: StimaController },
  sondaggio: { Screen: SondaggioScreen, Controller: SondaggioController },
};
