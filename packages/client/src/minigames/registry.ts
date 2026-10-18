import { type ComponentType, createElement, lazy } from "react";
import { BuzzerController, BuzzerScreen } from "./buzzer/BuzzerViews";
import { GhostHuntController, GhostHuntScreen } from "./caccia-fantasmi/GhostHuntViews";
import { IndovinaCanzoneController, IndovinaCanzoneScreen } from "./indovina-canzone/IndovinaCanzoneViews";
import { createDuelController, createDuelScreen } from "./knight-duel/DuelViews";
import { QuizController, QuizScreen } from "./quiz/QuizViews";
import { ReazioneController, ReazioneScreen } from "./reazione-a-catena/ReazioneViews";
import { ScalataController, ScalataScreen } from "./scalata/ScalataViews";
import { ParoleController, ParoleScreen } from "./parole-mannare/ParoleViews";
import { BottoController, BottoScreen } from "./stanze-col-botto/BottoViews";
import { ShadowTournamentController, ShadowTournamentScreen } from "./shadow-tournament/ShadowTournamentViews";
import { SondaggioController, SondaggioScreen } from "./sondaggio/SondaggioViews";
import { StimaController, StimaScreen } from "./stima/StimaViews";
import { StanzeScreen, StanzeController } from "./stanze-segrete/StanzeViews";
import type { ControllerProps, HostProps, ViewProps } from "./types";
import { VeroFalsoController, VeroFalsoScreen } from "./vero-falso/VeroFalsoViews";
import { ZombieHuntController, ZombieHuntScreen } from "./zombie-hunt/ZombieHuntViews";

export interface MinigameViews {
  Screen: ComponentType<ViewProps>;
  Controller: ComponentType<ControllerProps>;
  /** Interfaccia ricca per regia e Game Master, caricata solo dove serve (non finisce nel bundle del telefono). */
  Host?: ComponentType<HostProps>;
}

/** Viste dei minigiochi che si giocano come round (e che il duello può contenere). */
const roundViews: Record<string, MinigameViews> = {
  "quiz-multipla": { Screen: QuizScreen, Controller: QuizController },
  buzzer: { Screen: BuzzerScreen, Controller: BuzzerController },
  "vero-falso": { Screen: VeroFalsoScreen, Controller: VeroFalsoController },
  stima: { Screen: StimaScreen, Controller: StimaController },
  sondaggio: { Screen: SondaggioScreen, Controller: SondaggioController },
  "zombie-hunt": { Screen: ZombieHuntScreen, Controller: ZombieHuntController },
  "indovina-canzone": { Screen: IndovinaCanzoneScreen, Controller: IndovinaCanzoneController },
  "caccia-fantasmi": { Screen: GhostHuntScreen, Controller: GhostHuntController },
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
  "stanze-segrete": {
    Screen: StanzeScreen,
    Controller: StanzeController,
    Host: lazy(() => import("./stanze-segrete/StanzeHost").then((m) => ({ default: m.StanzeHost }))),
  },
  scalata: { Screen: ScalataScreen, Controller: ScalataController },
  "shadow-tournament": { Screen: ShadowTournamentScreen, Controller: ShadowTournamentController },
  "parole-mannare": { Screen: ParoleScreen, Controller: ParoleController },
  "stanze-col-botto": {
    Screen: BottoScreen,
    Controller: BottoController,
    Host: lazy(() => import("./stanze-col-botto/BottoHost").then((m) => ({ default: m.BottoHost }))),
  },
  "reazione-a-catena": {
    Screen: ReazioneScreen,
    Controller: ReazioneController,
    Host: lazy(() => import("./reazione-a-catena/ReazioneHost").then((m) => ({ default: m.ReazioneHost }))),
  },
  "knight-duel": {
    Screen: (p: ViewProps) => createElement(DuelScreen, p),
    Controller: (p: ControllerProps) => createElement(DuelController, p),
  },
};
