import { type ComponentType, createElement } from "react";
import { BuzzerController, BuzzerScreen } from "./buzzer/BuzzerViews";
import { createDuelController, createDuelScreen } from "./knight-duel/DuelViews";
import { QuizController, QuizScreen } from "./quiz/QuizViews";
import { SondaggioController, SondaggioScreen } from "./sondaggio/SondaggioViews";
import { StimaController, StimaScreen } from "./stima/StimaViews";
import type { ControllerProps, ViewProps } from "./types";
import { VeroFalsoController, VeroFalsoScreen } from "./vero-falso/VeroFalsoViews";
import { ZombieHuntController, ZombieHuntScreen } from "./zombie-hunt/ZombieHuntViews";

export interface MinigameViews {
  Screen: ComponentType<ViewProps>;
  Controller: ComponentType<ControllerProps>;
}

/** Viste dei minigiochi che si giocano come round (e che il duello può contenere). */
const roundViews: Record<string, MinigameViews> = {
  "quiz-multipla": { Screen: QuizScreen, Controller: QuizController },
  buzzer: { Screen: BuzzerScreen, Controller: BuzzerController },
  "vero-falso": { Screen: VeroFalsoScreen, Controller: VeroFalsoController },
  stima: { Screen: StimaScreen, Controller: StimaController },
  sondaggio: { Screen: SondaggioScreen, Controller: SondaggioController },
  "zombie-hunt": { Screen: ZombieHuntScreen, Controller: ZombieHuntController },
};

const DuelScreen = createDuelScreen(roundViews);
const DuelController = createDuelController(roundViews);

/**
 * Viste React dei plugin, per id (la logica sta in `@gioco/minigames`).
 * Il duello riceve le viste dei minigiochi che contiene, così non c'è un import circolare.
 * Per aggiungerne una: vedi docs/NUOVO-MINIGIOCO.md.
 */
export const minigameViews: Record<string, MinigameViews> = {
  ...roundViews,
  "knight-duel": {
    Screen: (p: ViewProps) => createElement(DuelScreen, p),
    Controller: (p: ControllerProps) => createElement(DuelController, p),
  },
};
