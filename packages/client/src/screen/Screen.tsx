import { QRCodeSVG } from "qrcode.react";
import type { TunnelInfo } from "@gioco/shared";
import { useServerInfo } from "./useServerInfo";

function QrCard({ title, url, hint }: { title: string; url: string | null; hint: string }) {
  return (
    <section className="qr-card">
      <h2>{title}</h2>
      {url ? (
        <>
          <div className="qr-box">
            <QRCodeSVG value={`${url}/play`} size={260} />
          </div>
          <code>{url}/play</code>
        </>
      ) : (
        <p className="muted">{hint}</p>
      )}
    </section>
  );
}

function tunnelHint(t: TunnelInfo | undefined): string {
  if (!t || t.status === "starting") return "Avvio del tunnel in corso…";
  if (t.status === "error") return `Tunnel non disponibile: ${t.error ?? "errore sconosciuto"}`;
  return "Tunnel disattivato";
}

export function Screen() {
  const info = useServerInfo();

  return (
    <main className="screen">
      <h1>Gioco Ros</h1>
      <p className="muted">Inquadra un QR code per entrare dal telefono</p>
      <div className="qr-row">
        <QrCard
          title="Via internet (4G/5G o Wi-Fi)"
          url={info?.tunnel.status === "ready" ? (info.tunnel.url ?? null) : null}
          hint={tunnelHint(info?.tunnel)}
        />
        <QrCard
          title="Rete locale (Wi-Fi)"
          url={info?.lanUrl ?? null}
          hint={info ? "Nessuna rete locale rilevata" : "Connessione al server…"}
        />
      </div>
    </main>
  );
}
