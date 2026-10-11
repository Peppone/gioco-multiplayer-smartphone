import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { type GameScreenState, ServerEvent, type TunnelInfo } from "@gioco/shared";
import { minigameViews } from "../minigames/registry";
import { useClockSync } from "../net/useClockSync";
import { useSocket } from "../net/useSocket";
import { Leaderboard } from "../ui/Leaderboard";
import { Lobby } from "./Lobby";
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

function Join() {
  const info = useServerInfo();
  return (
    <>
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
    </>
  );
}

export function Screen() {
  const { socket } = useSocket("screen");
  const clock = useClockSync(socket, true); // lo schermo sincronizza l'orologio per i countdown
  const [game, setGame] = useState<GameScreenState>({ phase: "idle", roundNumber: 0, roundCount: 0 });

  useEffect(() => {
    socket.on(ServerEvent.GameScreen, setGame);
    return () => void socket.off(ServerEvent.GameScreen, setGame);
  }, [socket]);

  const views = game.frame ? minigameViews[game.frame.typeId] : undefined;

  return (
    <main className="screen" data-theme={game.frame?.theme}>
      {game.phase === "idle" && (
        <>
          <h1>Gioco Ros</h1>
          <Join />
          <Lobby socket={socket} />
        </>
      )}

      {game.phase === "ready" && (
        <>
          <h1>{game.eventName}</h1>
          <h2>{game.matchName}</h2>
          <p className="big">Si comincia tra poco!</p>
          {game.leaderboards && <Leaderboard data={game.leaderboards} limit={10} />}
        </>
      )}

      {game.phase === "round" && game.frame && (
        <>
          <p className="muted">
            {game.matchName} · Round {game.roundNumber}/{game.roundCount} · {game.frame.title}
          </p>
          {views ? (
            <views.Screen view={game.frame.view} clock={clock.current} theme={game.frame.theme} title={game.frame.title} />
          ) : (
            <p>Minigioco sconosciuto: {game.frame.typeId}</p>
          )}
        </>
      )}

      {game.phase === "results" && (
        <>
          <h2>Classifica dopo il round {game.roundNumber}</h2>
          {game.leaderboards && <Leaderboard data={game.leaderboards} limit={10} />}
        </>
      )}

      {game.phase === "ended" && (
        <>
          <h1>Classifica finale</h1>
          <h2>{game.matchName}</h2>
          {game.leaderboards && <Leaderboard data={game.leaderboards} limit={10} />}
        </>
      )}
    </main>
  );
}
