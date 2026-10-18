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
  /** Solo nella regia (non nel link del Game Master): salvare, esportare e caricare la configurazione del round. */
  library?: HostLibrary;
}

/** Tutte le funzioni lanciano un `Error` con il motivo, già in italiano, se non riescono. */
export interface HostLibrary {
  /** Salva ciò che il round ha scritto: senza titolo nell'istanza del round, con un titolo come nuova istanza. */
  save(title?: string): Promise<void>;
  /** Scarica la configurazione attuale in un file JSON (stesso formato dell'esportazione della libreria). */
  exportFile(): Promise<void>;
  /** Le istanze della libreria dello stesso tipo di minigioco. */
  list(): Promise<{ id: string; title: string }[]>;
  /** La configurazione di un'istanza della libreria o di un file JSON esportato, da caricare nel round. */
  fetchConfig(source: { instanceId: string } | { file: File }): Promise<unknown>;
}
