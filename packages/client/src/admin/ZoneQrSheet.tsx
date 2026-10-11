import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useServerInfo } from "../screen/useServerInfo";

export interface QrCode {
  name: string;
  code: string;
}

/** Un QR per ogni zona del gioco: apre /play?zona=CODICE. L'indirizzo del tunnel cambia a ogni avvio, quindi si stampa a serata avviata. */
export function ZoneQrSheet({ codes }: { codes: QrCode[] }) {
  const info = useServerInfo(5000);
  const tunnel = info?.tunnel.status === "ready" ? (info.tunnel.url ?? null) : null;
  const lan = info?.lanUrl ?? null;
  const [choice, setChoice] = useState<"tunnel" | "lan">("tunnel");
  const detected = choice === "tunnel" ? (tunnel ?? lan) : (lan ?? tunnel);
  // Senza tunnel né rete locale resta l'indirizzo con cui si è aperta la regia (va bene solo per provare sul PC).
  const base = detected ?? window.location.origin;

  return (
    <section className="panel">
      <h3>QR delle zone</h3>
      <p className="muted">Stampali e appendili nei punti giusti prima di dare il via. Se riavvii il server l'indirizzo cambia: ristampali.</p>
      <div className="row">
        <select value={choice} onChange={(e) => setChoice(e.target.value as "tunnel" | "lan")} aria-label="Indirizzo dei QR">
          <option value="tunnel">Via internet (tunnel){tunnel ? "" : " — non pronto"}</option>
          <option value="lan">Rete locale (Wi-Fi){lan ? "" : " — non rilevata"}</option>
        </select>
        <button onClick={() => window.print()}>Stampa</button>
      </div>
      {!detected && <p className="muted">Indirizzo pubblico non ancora disponibile: i QR usano {base}, valido solo su questo PC.</p>}
      <div className="zone-sheet">
        {codes.map((z) => (
          <figure key={z.code}>
            <QRCodeSVG value={`${base}/play?zona=${z.code}`} size={180} />
            <figcaption>{z.name}</figcaption>
            <code>{z.code}</code>
          </figure>
        ))}
      </div>
    </section>
  );
}
