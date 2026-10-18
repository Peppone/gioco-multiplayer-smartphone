import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { extractZoneCode } from "./zoneCode";

interface Props {
  /** Chiamata una sola volta, con il codice di una zona. */
  onCode: (code: string) => void;
  onClose: () => void;
  /** Nome del parametro del link che contiene il codice (`zona` per Caccia ai Fantasmi, `stanza` per Stanze col botto). */
  param?: string;
  /** Cosa si sta inquadrando, per i messaggi (es. «della zona»). */
  what?: string;
}

const MAX_WIDTH = 480;
const SCAN_EVERY_MS = 150;

function cameraError(e: unknown): string {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return "La fotocamera dell'app funziona solo con il collegamento sicuro (https), non sulla rete locale. Usa la fotocamera del telefono oppure scrivi il codice.";
  }
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Permesso alla fotocamera negato: abilitalo dalle impostazioni del browser, oppure scrivi il codice.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nessuna fotocamera disponibile su questo dispositivo.";
  return "Impossibile avviare la fotocamera: scrivi il codice della zona.";
}

/** Scanner di QR dentro l'app. Caricato solo quando serve: la libreria di decodifica non pesa sul telefono finché non lo si apre. */
export default function QrScanner({ onCode, onClose, param = "zona", what = "della zona" }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (stopped || !v || !ctx) return;
      if (v.readyState >= v.HAVE_CURRENT_DATA && v.videoWidth > 0) {
        const scale = Math.min(1, MAX_WIDTH / v.videoWidth);
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
        if (found) {
          const code = extractZoneCode(found.data, param);
          if (code) {
            stopped = true;
            onCode(code);
            return;
          }
          setHint("Questo QR non fa parte del gioco.");
        }
      }
      timer = setTimeout(tick, SCAN_EVERY_MS);
    };

    (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        tick();
      } catch (e) {
        if (!stopped) setError(cameraError(e));
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onCode e onClose cambiano a ogni rendering del chiamante: lo scanner parte una volta sola.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gf-scanner" role="dialog" aria-label="Scanner QR">
      {error ? (
        <p className="gf-scanner-msg gf-scanner-error" role="alert">{error}</p>
      ) : (
        <>
          <video ref={video} className="gf-scanner-video" playsInline muted />
          <div className="gf-scanner-frame" aria-hidden="true" />
          <p className="gf-scanner-msg">{hint ?? `Inquadra il QR ${what}`}</p>
        </>
      )}
      <button className="gf-scanner-close" onClick={onClose}>Chiudi</button>
    </div>
  );
}
