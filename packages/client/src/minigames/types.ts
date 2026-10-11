import type { ClockSync, ThemeId } from "@gioco/shared";

/** Props comuni alle viste di un minigioco (la `view` è già filtrata dal server). */
export interface ViewProps {
  view: unknown;
  clock: ClockSync;
  theme: ThemeId;
  title: string;
}

export interface ControllerProps extends ViewProps {
  /** Invia un'intenzione al server; il timestamp della pressione è aggiunto in automatico. */
  send: (input: unknown) => void;
}
