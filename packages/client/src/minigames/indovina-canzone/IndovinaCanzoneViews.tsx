import { type RefObject, useEffect, useRef } from "react";
import type { AudioEffect, ClockSync } from "@gioco/shared";
import { useAudioState, useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
import { Countdown } from "../Countdown";
import { type MusicBackend, fileBackend, youtubeBackend } from "./backends";
import type { ControllerProps, ViewProps } from "../types";

interface Music {
  /** Una sola delle due sorgenti è presente: file caricato o video YouTube. */
  file: string | null;
  youtubeId: string | null;
  effect: AudioEffect;
  startSeconds: number;
  playing: boolean;
  offsetMs: number;
  segmentStart: number;
  stopAt: number | null;
  clipMs: number;
}
interface ScreenView {
  phase: "idle" | "playing" | "collecting" | "answering" | "paused" | "resolved";
  index: number;
  total: number;
  music: Music;
  answering: { playerId: string; nickname: string | null } | null;
  queue: { playerId: string; nickname: string | null }[];
  current: number;
  winner: { playerId: string | null; nickname: string | null; points: number } | null;
  reveal: string | null;
}
interface PlayerView {
  phase: ScreenView["phase"];
  canBuzz: boolean;
  buzzed: boolean;
  isAnswering: boolean;
  position: number | null;
  won: boolean;
}
type Done = { phase: "done" };

/**
 * La musica suona solo sullo schermo condiviso, sentita da tutti nella stanza. Il server dice quando è
 * (ri)partita e da dove: ogni schermo ricostruisce la posizione con l'orologio sincronizzato.
 */
function useMusic(music: Music | undefined, clock: ClockSync, host: RefObject<HTMLDivElement | null>) {
  const backend = useRef<MusicBackend | null>(null);
  const file = music?.file;
  const video = music?.youtubeId;
  const effect = music?.effect ?? "none";

  // Il brano si carica appena il round passa a questo pezzo, così la musica parte senza attese.
  useEffect(() => {
    if (video && host.current) backend.current = youtubeBackend(video, host.current);
    else if (file) backend.current = fileBackend(file, effect);
    else return;
    return () => {
      backend.current?.dispose();
      backend.current = null;
    };
  }, [file, video, effect, host]);

  const playing = music?.playing ?? false;
  const segmentStart = music?.segmentStart ?? 0;
  const offsetMs = music?.offsetMs ?? 0;
  const stopAt = music?.stopAt ?? null;
  const startSeconds = music?.startSeconds ?? 0;
  useEffect(() => {
    const b = backend.current;
    if (!b) return;
    if (!playing) {
      b.pause();
      return;
    }
    const begin = () => {
      const heard = offsetMs + Math.max(0, clock.toServerTime(Date.now()) - segmentStart);
      b.playAt(startSeconds + heard / 1000);
    };
    const cancel = b.whenReady(begin);
    const stop = stopAt === null ? undefined : setTimeout(() => b.pause(), Math.max(0, stopAt - clock.toServerTime(Date.now())));
    return () => {
      cancel();
      clearTimeout(stop);
    };
  }, [file, video, playing, segmentStart, offsetMs, stopAt, startSeconds, clock]);
}

export function IndovinaCanzoneScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenView | Done;
  const sfx = useSfx(theme);
  const { unlocked } = useAudioState();
  const ytHost = useRef<HTMLDivElement>(null);
  useMusic(v.phase === "done" ? undefined : v.music, clock, ytHost);

  const phase = v.phase;
  const answeringId = v.phase === "answering" ? v.answering?.playerId : undefined;
  const hasWinner = v.phase === "resolved" && v.winner?.playerId != null;
  useEffect(() => {
    if (answeringId) sfx("buzz");
  }, [answeringId, sfx]);
  useEffect(() => {
    if (phase === "resolved") sfx(hasWinner ? "correct" : "wrong");
  }, [phase, hasWinner, sfx]);

  if (v.phase === "done") return <p className="big">Indovina la canzone concluso!</p>;
  return (
    <div className="buzzer-screen song-screen">
      {/* Contenitore del lettore YouTube: fuori vista, si usa solo l'audio. */}
      <div ref={ytHost} className="yt-hidden" aria-hidden />
      <Sfx theme={theme} text="BZZT!" trigger={answeringId ?? null} />
      <Sfx theme={theme} text="BAM!" trigger={hasWinner ? v.index : null} />
      <p className="muted">Brano {v.index + 1} di {v.total}</p>
      <h2 className="question note" aria-hidden>🎵</h2>
      {v.phase === "idle" && <p className="big">Pronti ad ascoltare…</p>}
      {v.phase === "playing" && (
        <>
          <p className="big pulse">Chi lo sa? PRENOTATEVI!</p>
          {v.music.stopAt !== null && <Countdown openedAt={v.music.stopAt - v.music.clipMs + v.music.offsetMs} deadline={v.music.stopAt} clock={clock} />}
          {!unlocked && <p className="muted">Tocca lo schermo per attivare l'audio.</p>}
        </>
      )}
      {v.phase === "collecting" && <p className="big">⏸ Qualcuno si è prenotato…</p>}
      {v.phase === "answering" && v.answering && (
        <>
          <p className="big">🔔 {v.answering.nickname} risponde!</p>
          {v.queue.length > 1 && (
            <ol className="queue">
              {v.queue.map((p, i) => (
                <li key={p.playerId} className={i === v.current ? "now" : i < v.current ? "done" : ""}>{p.nickname}</li>
              ))}
            </ol>
          )}
        </>
      )}
      {v.phase === "paused" && <p className="big">Sbagliato! La musica riparte tra poco…</p>}
      {v.phase === "resolved" && (
        <>
          <p className="big">
            {v.winner?.playerId ? `${v.winner.nickname} +${v.winner.points}!` : "Nessuno l'ha indovinata"}
          </p>
          {v.reveal && <p className="answer">{v.reveal}</p>}
        </>
      )}
    </div>
  );
}

export function IndovinaCanzoneController({ view, send, theme }: ControllerProps) {
  const v = view as PlayerView | Done;
  const sfx = useSfx(theme);
  const answering = v.phase !== "done" && v.isAnswering;
  const wasAnswering = useRef(false);

  useEffect(() => {
    if (answering && !wasAnswering.current) sfx("start");
    wasAnswering.current = answering;
  }, [answering, sfx]);

  if (v.phase === "done") return <p className="big">Indovina la canzone concluso!</p>;

  let label = "Aspetta…";
  if (v.phase === "idle") label = "Ascolta lo schermo…";
  if (v.phase === "playing" || v.phase === "collecting") label = v.buzzed ? "Prenotato!" : "LO SO!";
  if (v.phase === "answering") label = v.isAnswering ? "Tocca a te: rispondi a voce!" : v.buzzed ? `Sei in coda (${v.position})` : "Aspetta…";
  if (v.phase === "paused") label = "La musica riparte…";
  if (v.phase === "resolved") label = v.won ? "Hai indovinato! 🎉" : "Brano chiuso";

  return (
    <div className="buzzer-ctrl">
      <h2>🎵 Ascolta lo schermo</h2>
      <button
        className={`buzz-btn ${v.isAnswering ? "answering" : ""}`}
        disabled={!v.canBuzz}
        // pointerdown e non click: niente ritardo di 300 ms su mobile.
        onPointerDown={() => {
          if (!v.canBuzz) return;
          send({ type: "buzz" });
          navigator.vibrate?.(30); // Android; iOS la ignora
          sfx("buzz", 0.5);
        }}
      >
        {label}
      </button>
    </div>
  );
}
