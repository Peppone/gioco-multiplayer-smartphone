import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { type GameScreenState, type Leaderboards, ServerEvent, type ThemeId, type TunnelInfo } from "@gioco/shared";
import { useSfx } from "../audio/useAudio";
import { minigameViews } from "../minigames/registry";
import { useClockSync } from "../net/useClockSync";
import { useSocket } from "../net/useSocket";
import { ReactionLayer } from "../reactions/ReactionLayer";
import { Leaderboard } from "../ui/Leaderboard";
import { MuteButton } from "../ui/MuteButton";
import { Stage } from "../ui/Stage";
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

/** Ultima classifica vista e quella prima: serve per animare il passaggio dai punti vecchi ai nuovi. */
function usePreviousBoards(current: Leaderboards | undefined): Leaderboards | undefined {
  const cur = useRef<Leaderboards | undefined>(undefined);
  const prev = useRef<Leaderboards | undefined>(undefined);
  if (current && current !== cur.current) {
    prev.current = cur.current;
    cur.current = current;
  }
  return prev.current;
}

export function Screen() {
  const { socket } = useSocket("screen");
  const clock = useClockSync(socket, true); // lo schermo sincronizza l'orologio per i countdown
  const [game, setGame] = useState<GameScreenState>({ phase: "idle", roundNumber: 0, roundCount: 0 });
  // Il tema resta quello dell'ultimo round anche nelle schermate di classifica; fuori dal gioco vale «gameshow».
  const lastTheme = useRef<ThemeId>("gameshow");
  if (game.frame) lastTheme.current = game.frame.theme;
  else if (game.phase === "idle") lastTheme.current = "gameshow";
  const theme = lastTheme.current;
  const sfx = useSfx(theme);
  const previousBoards = usePreviousBoards(game.leaderboards);

  useEffect(() => {
    socket.on(ServerEvent.GameScreen, setGame);
    return () => void socket.off(ServerEvent.GameScreen, setGame);
  }, [socket]);

  // Fanfara quando compare una classifica di fine round o di fine partita.
  useEffect(() => {
    if (game.phase === "results" || game.phase === "ended") sfx("fanfare");
  }, [game.phase, game.roundNumber, sfx]);

  const views = game.frame ? minigameViews[game.frame.typeId] : undefined;
  // Cambia a ogni fase/round, così `Stage` fa uscire la schermata vecchia ed entrare la nuova.
  const stageId = `${game.phase}-${game.roundNumber}`;

  return (
    <main className="screen" data-theme={theme}>
      <MuteButton className="corner" />
      <ReactionLayer socket={socket} />
      <Stage theme={theme} id={stageId}>
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
            {game.leaderboards && <Leaderboard data={game.leaderboards} previous={previousBoards} limit={10} />}
          </>
        )}

        {game.phase === "ended" && (
          <>
            <h1>Classifica finale</h1>
            <h2>{game.matchName}</h2>
            {game.leaderboards && <Leaderboard data={game.leaderboards} previous={previousBoards} limit={10} />}
          </>
        )}
      </Stage>
    </main>
  );
}
