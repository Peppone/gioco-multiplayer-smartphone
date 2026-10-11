import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClientEvent,
  type GamePlayerState,
  type JoinResult,
  type PublicPlayer,
  ServerEvent,
  type ThemeId,
} from "@gioco/shared";
import { minigameViews } from "../minigames/registry";
import { useClockSync } from "../net/useClockSync";
import { useSocket } from "../net/useSocket";
import { ReactionBar } from "../reactions/ReactionBar";
import { MuteButton } from "../ui/MuteButton";
import { Stage } from "../ui/Stage";
import { ProfileForm } from "./ProfileForm";

const TOKEN_KEY = "gioco.token";

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const writeToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage non disponibile (es. navigazione privata): si perde solo il rientro automatico */
  }
};

export function Play() {
  const { socket, connected } = useSocket("play");
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const clock = useClockSync(socket, player !== null);
  const [game, setGame] = useState<GamePlayerState | null>(null);
  const lastTheme = useRef<ThemeId>("gameshow");

  // Il server invia la vista filtrata per questo giocatore a ogni cambiamento e a ogni (ri)ingresso.
  useEffect(() => {
    socket.on(ServerEvent.GamePlayer, setGame);
    return () => void socket.off(ServerEvent.GamePlayer, setGame);
  }, [socket]);

  /** Invia un'intenzione con l'ora della pressione già convertita in ora server. */
  const send = useCallback(
    (input: unknown) => {
      socket.emit(ClientEvent.GameInput, { input, clientTime: clock.current.toServerTime(Date.now()) });
    },
    [socket, clock],
  );

  const onJoined = useCallback((r: Extract<JoinResult, { ok: true }>) => {
    writeToken(r.token);
    setPlayer(r.player);
    if (r.pin) setPin(r.pin);
  }, []);

  // Ad ogni (ri)connessione si rientra col token: lo stato lato server è la fonte di verità.
  useEffect(() => {
    const resume = () => {
      const token = readToken();
      if (!token) return setChecking(false);
      socket.emit(ClientEvent.Resume, { token }, (r: JoinResult) => {
        if (r.ok) onJoined(r);
        else {
          writeToken(null);
          setPlayer(null);
        }
        setChecking(false);
      });
    };
    socket.on("connect", resume);
    if (socket.connected) resume();
    return () => void socket.off("connect", resume);
  }, [socket, onJoined]);

  // Tiene lo schermo acceso dove il browser lo supporta (richiede HTTPS: ok col tunnel).
  useEffect(() => {
    if (!player || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible") {
        navigator.wakeLock.request("screen").then((l) => (lock = l), () => undefined);
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [player]);

  const rtt = clock.current.rtt;
  const status = (
    <div className={`conn ${connected ? "ok" : "ko"}`}>
      {connected ? `Connesso${rtt !== null ? ` · ${Math.round(rtt)} ms` : ""}` : "Riconnessione…"}
    </div>
  );

  if (checking) {
    return (
      <main className="center">
        {status}
        <p>Connessione…</p>
      </main>
    );
  }

  if (!player) {
    return (
      <main className="center">
        {status}
        <ProfileForm socket={socket} onJoined={onJoined} />
      </main>
    );
  }

  const views = game?.frame ? minigameViews[game.frame.typeId] : undefined;
  if (game?.frame) lastTheme.current = game.frame.theme;
  else if (!game || game.phase === "idle") lastTheme.current = "gameshow";
  const theme = lastTheme.current;

  const tools = (
    <>
      <MuteButton className="corner-left" />
      <ReactionBar socket={socket} />
    </>
  );

  if (game?.phase === "round" && game.inRoster && game.frame && views) {
    return (
      <main className="controller" data-theme={game.frame.theme}>
        {status}
        <Stage theme={game.frame.theme} id={`${game.roundNumber ?? 0}-${game.frame.typeId}`}>
          <views.Controller
            view={game.frame.view}
            clock={clock.current}
            theme={game.frame.theme}
            title={game.frame.title}
            send={send}
          />
        </Stage>
        {tools}
      </main>
    );
  }

  return (
    <main className="controller waiting" data-theme={theme}>
      {status}
      <div className="avatar" style={{ background: player.color }}>
        {player.avatar}
      </div>
      <h1>{player.nickname}</h1>
      {pin && (
        <div className="pin-box">
          <p>Il tuo PIN per rientrare da un altro telefono:</p>
          <strong>{pin}</strong>
          <button onClick={() => setPin(null)}>Annotato</button>
        </div>
      )}
      {game?.me && game.inRoster && (
        <p className="big">
          {game.me.points} punti{game.me.rank ? ` · ${game.me.rank}° posto` : ""}
          {game.me.teamName ? ` · ${game.me.teamName}` : ""}
        </p>
      )}
      <p className="muted">
        {!game || game.phase === "idle"
          ? "Sei in lobby: aspetta che la serata inizi."
          : !game.inRoster
            ? "Una partita è in corso, ma non sei stato aggiunto alla serata: chiedi alla regia."
            : game.phase === "ended"
              ? "Partita conclusa. Guarda la classifica sullo schermo!"
              : "Guarda lo schermo: il prossimo round sta per iniziare."}
      </p>
      {tools}
    </main>
  );
}
