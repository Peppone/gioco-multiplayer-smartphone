import { useEffect, useRef, useState } from "react";
import type { TestSessionInfo } from "@gioco/shared";
import { api, errorMessage } from "./api";
import { LivePanel } from "./LivePanel";

/** Dimensioni «vere» delle pagine: dentro la regia si vedono rimpicciolite, ma si comportano come su TV e telefono. */
const SCREEN_SIZE = { width: 1920, height: 1080 };
const PHONE_SIZE = { width: 360, height: 640 };

/** Una pagina del gioco in un riquadro rimpicciolito; senza `scale` si adatta alla larghezza disponibile. */
function ScaledFrame({ src, title, width, height, scale }: { src: string; title: string; width: number; height: number; scale?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (scale !== undefined || !el) return;
    const measure = () => setFit(Math.max(0.1, el.clientWidth / width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scale, width]);

  const s = scale ?? fit;
  return (
    <div ref={box} className="scaled-frame" style={{ width: scale === undefined ? "100%" : Math.round(width * s), height: Math.round(height * s) }}>
      <iframe
        src={src}
        title={title}
        allow="autoplay"
        style={{ width, height, transform: `scale(${s})`, transformOrigin: "0 0" }}
      />
    </div>
  );
}

/**
 * Pagina della prova rapida di un minigioco: lo schermo condiviso e un telefono per ogni giocatore di prova, tutti in
 * questa pagina, più i comandi della regia. Nessuna serata da preparare: la prova parte già dal primo round, i punti
 * non restano e a fine prova tutto sparisce.
 */
export function TestPanel({ session, onClosed }: { session: TestSessionInfo; onClosed: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [phoneScale, setPhoneScale] = useState(0.5);
  const [showPhones, setShowPhones] = useState(true);

  const close = async () => {
    setError(null);
    try {
      await api("DELETE", "/test-session");
      onClosed();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="panel test-panel">
      <div className="row spread">
        <h2>🧪 Prova: {session.title}</h2>
        <div className="row">
          <button onClick={() => window.open("/screen", "_blank", "noopener")}>Apri lo schermo in una finestra</button>
          <button className="danger" onClick={() => void close()}>Chiudi la prova</button>
        </div>
      </div>
      <p className="muted">
        {session.players.length} telefoni di prova. Nessun punto viene salvato e giocatori, squadre e partita di prova spariscono a fine prova.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="test-stage">
        <div className="test-main">
          <ScaledFrame src="/screen" title="Schermo di prova" {...SCREEN_SIZE} />
          <div className="row spread test-phones-bar">
            <h3>Telefoni</h3>
            <label className="row">
              <input type="checkbox" checked={showPhones} onChange={(e) => setShowPhones(e.target.checked)} /> Mostra i telefoni
            </label>
            <label className="row">
              Dimensione
              <input type="range" min={0.3} max={0.9} step={0.05} value={phoneScale} onChange={(e) => setPhoneScale(Number(e.target.value))} aria-label="Dimensione dei telefoni" />
            </label>
          </div>
          {showPhones && (
            <div className="test-phones">
              {session.players.map((p) => (
                <figure key={p.id} className="test-phone">
                  <ScaledFrame src={`/play?as=${encodeURIComponent(p.token)}&silent=1`} title={`Telefono di ${p.nickname}`} scale={phoneScale} {...PHONE_SIZE} />
                  <figcaption style={p.teamColor ? { borderColor: p.teamColor } : undefined}>
                    {p.nickname}
                    {p.teamName && <small className="muted"> · {p.teamName}</small>}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
        <div className="test-host">
          <LivePanel embedded />
        </div>
      </div>
    </section>
  );
}
