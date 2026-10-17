import type { ClockSync, HostAck, ThemeId } from "@gioco/shared";

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

/**
 * Interfaccia ricca della regia (e del Game Master) per i plugin che non si accontentano dei pulsanti generici
 * di `hostView.actions`. `info` è la `hostView.info` del plugin; `run` invia un comando al plugin.
 */
export interface HostProps {
  info: unknown;
  run: (command: Record<string, unknown>) => Promise<HostAck>;
  clock: ClockSync;
  theme: ThemeId;
}
