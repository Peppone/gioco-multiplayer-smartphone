import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";

interface Status {
  standard: number;
  expert: number;
}

interface Summary {
  imported: number;
  ignored: number;
  rejected: number;
  warnings: number;
  problems: string[];
  total: Status;
}

const FOLDER_KEY = "gioco.pianeta.cartella";

const remembered = (): string => {
  try {
    return localStorage.getItem(FOLDER_KEY) ?? "";
  } catch {
    return "";
  }
};

/**
 * Schemi dell'app ufficiale di *The Search for Planet X* per «Il Pianeta Nascosto»: la regia indica la cartella della propria copia
 * dell'app (`assets/www/assets/maps`) e il server salva gli schemi validi. Non stanno mai nel progetto né nel pacchetto.
 * Poi nell'istanza si sceglie «Origine del sistema → Schema dell'app ufficiale».
 */
export function PianetaSchemiPanel({ onAuthLost }: { onAuthLost: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [folder, setFolder] = useState(remembered);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    if ((e as { status?: number }).status === 401) onAuthLost();
    setError(errorMessage(e));
  };

  useEffect(() => {
    api<Status>("GET", "/pianeta-schemi").then(setStatus, fail);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const importFolder = () =>
    run(async () => {
      try {
        localStorage.setItem(FOLDER_KEY, folder);
      } catch {
        /* storage non disponibile: la cartella andrà riscritta */
      }
      const result = await api<Summary>("POST", "/pianeta-schemi/import", { folder });
      setSummary(result);
      setStatus(result.total);
    });

  const clear = () =>
    run(async () => {
      if (!confirm("Cancellare tutti gli schemi importati? Le partite già avviate non cambiano.")) return;
      setStatus(await api<Status>("DELETE", "/pianeta-schemi"));
      setSummary(null);
    });

  return (
    <section className="panel pianeta-schemi" data-testid="px-schemi">
      <h4>Schemi dell'app ufficiale</h4>
      <p className="muted" data-testid="px-schemi-status">
        {status === null ? "…" : status.standard + status.expert === 0 ? "Nessuno schema importato." : `Importati: ${status.standard} Base e ${status.expert} Esperto.`}
      </p>
      <p className="muted">
        Se hai l'app ufficiale, indica la cartella degli schemi (di solito <code>assets/www/assets/maps</code> nella copia dell'app): i file validi si salvano su questo PC, mai nel progetto. Poi scegli «Schema dell'app ufficiale» in «Origine del sistema».
      </p>
      <div className="row">
        <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Cartella degli schemi, es. C:\app\assets\www\assets\maps" aria-label="Cartella degli schemi" data-testid="px-schemi-folder" />
        <button type="button" className="primary" disabled={busy || !folder.trim()} onClick={() => void importFolder()} data-testid="px-schemi-import">Importa schemi</button>
        <button type="button" disabled={busy || !status || status.standard + status.expert === 0} onClick={() => void clear()} data-testid="px-schemi-clear">Cancella gli schemi</button>
      </div>
      {error && <p className="error" role="alert" data-testid="px-schemi-error">{error}</p>}
      {summary && (
        <p className="notice" data-testid="px-schemi-summary">
          Importati {summary.imported}, rifiutati {summary.rejected}, ignorati {summary.ignored} file{summary.warnings > 0 ? `, ${summary.warnings} avvisi` : ""}.
          {summary.problems.length > 0 && <> Primi problemi: {summary.problems.join(" · ")}</>}
        </p>
      )}
    </section>
  );
}
