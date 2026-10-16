import { Suspense, useEffect, useState } from "react";
import { minigameViews } from "../minigames/registry";
import { useClockSync } from "../net/useClockSync";
import { useMasterGame } from "./useMasterGame";

const TOKEN_KEY = "gioco.master.token";

const readStored = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeStored = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage non disponibile: dopo il blocco dello schermo servirà riaprire il link */
  }
};

/** Il token sta nel frammento `#t=...` (non finisce nei log HTTP): lo si salva e lo si toglie dall'indirizzo. */
function initialToken(): string | null {
  const m = /[#&]t=([0-9a-f]{16,128})/.exec(window.location.hash);
  if (m) {
    writeStored(m[1]!);
    window.history.replaceState(null, "", window.location.pathname);
    return m[1]!;
  }
  return readStored();
}

export function Master() {
  const [token, setToken] = useState<string | null>(initialToken);
  if (!token) {
    return (
      <main className="center">
        <h1>Game Master</h1>
        <p>Apri il link che ti ha dato la regia (o inquadra il suo QR) per entrare.</p>
      </main>
    );
  }
  return (
    <MasterSession
      token={token}
      onLost={() => {
        writeStored(null);
        setToken(null);
      }}
    />
  );
}

function MasterSession({ token, onLost }: { token: string; onLost: () => void }) {
  const { socket, state, connected, denied, run } = useMasterGame(token);
  const clock = useClockSync(socket, true);
  useEffect(() => {
    if (denied) writeStored(null);
  }, [denied]);

  const [error, setError] = useState<string | null>(null);
  const send = async (command: Record<string, unknown>) => {
    setError(null);
    const ack = await run(command);
    if (!ack.ok) setError(ack.error === "unauthorized" ? "Accesso non più valido." : ack.error);
    return ack;
  };

  if (denied) {
    return (
      <main className="center">
        <h1>Link non più valido</h1>
        <p>L&apos;accesso è stato revocato, è scaduto o la partita è finita. Chiedi alla regia un nuovo link.</p>
        <button onClick={onLost}>Ok</button>
      </main>
    );
  }

  const host = state?.host;
  const views = state?.typeId ? minigameViews[state.typeId] : undefined;
  const Host = views?.Host;

  return (
    <main className="master" data-theme="retro80">
      <div className={`conn ${connected ? "ok" : "ko"}`}>{connected ? "Connesso" : "Riconnessione…"}</div>
      <header className="master-head">
        <h1>Game Master</h1>
        {state?.roundTitle && <p className="muted">{state.matchName} · {state.roundTitle}</p>}
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {!state ? (
        <p>Connessione…</p>
      ) : host && Host ? (
        <Suspense fallback={<p>Caricamento…</p>}>
          <Host info={host.info} run={send} clock={clock.current} theme="retro80" />
        </Suspense>
      ) : (
        <p className="big">In attesa del round…</p>
      )}
    </main>
  );
}
