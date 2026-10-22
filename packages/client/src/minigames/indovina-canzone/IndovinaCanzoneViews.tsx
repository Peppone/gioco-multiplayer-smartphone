import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { type AudioEffect, type ClockSync, type LoopPlan, type LoopPosition, clarityAt, loopPosition } from "@gioco/shared";
import { useAudioState, useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
import { Countdown } from "../Countdown";
import { type MusicBackend, bufferFileBackend, fileBackend, youtubeBackend } from "./backends";
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
  /** Ascolto a spezzoni crescenti; assente nell'ascolto continuo. */
  loop: LoopPlan | null;
  /** Percentuale dell'ascolto a cui il suono è nitido; assente se l'effetto resta uguale. */
  clearAtPercent: number | null;
}
interface CategoryOption {
  key: string;
  name: string;
  left: number;
}
interface ScreenView {
  phase: "choosing" | "idle" | "playing" | "collecting" | "answering" | "paused" | "resolved";
  index: number;
  total: number;
  /** Assente mentre si sceglie la categoria: il brano non è ancora stato scelto. */
  music: Music | null;
  category: string | null;
  choosing: {
    team: { id: string; name: string; color: string | null } | null;
    captain: { playerId: string; nickname: string | null } | null;
    openedAt: number;
    deadline: number;
    options: CategoryOption[];
  } | null;
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
  /** Solo per il capitano della squadra di turno nella scelta della categoria. */
  pick: { openedAt: number; deadline: number; options: CategoryOption[] } | null;
  chooserName: string | null;
  category: string | null;
}
type Done = { phase: "done" };

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s`;

/**
 * La musica suona solo sullo schermo condiviso, sentita da tutti nella stanza. Il server dice quando è
 * (ri)partita e da dove: ogni schermo ricostruisce la posizione con l'orologio sincronizzato. Negli ascolti a
 * spezzoni lo schermo fa suonare e tacere il brano agli istanti dettati dal piano; se l'effetto si attenua col
 * tempo, la rampa del filtro è programmata fino al punto in cui il suono torna nitido.
 * Restituisce lo spezzone in corso (solo negli ascolti a spezzoni).
 */
function useMusic(music: Music | null | undefined, clock: ClockSync, host: RefObject<HTMLDivElement | null>): LoopPosition | null {
  const backend = useRef<MusicBackend | null>(null);
  const [loopPos, setLoopPos] = useState<LoopPosition | null>(null);
  const file = music?.file;
  const video = music?.youtubeId;
  const effect = music?.effect ?? "none";
  const loopKey = JSON.stringify(music?.loop ?? null);
  const loop = useMemo(() => JSON.parse(loopKey) as LoopPlan | null, [loopKey]);
  const hasLoop = loop !== null;

  // Il brano si carica appena il round passa a questo pezzo, così la musica parte senza attese.
  useEffect(() => {
    if (video && host.current) backend.current = youtubeBackend(video, host.current);
    else if (file) backend.current = hasLoop ? bufferFileBackend(file, effect) : fileBackend(file, effect);
    else return;
    return () => {
      backend.current?.dispose();
      backend.current = null;
    };
  }, [file, video, effect, hasLoop, host]);

  const playing = music?.playing ?? false;
  const segmentStart = music?.segmentStart ?? 0;
  const offsetMs = music?.offsetMs ?? 0;
  const stopAt = music?.stopAt ?? null;
  const startSeconds = music?.startSeconds ?? 0;
  const clipMs = music?.clipMs ?? 0;
  const clearAt = music?.clearAtPercent ?? null;

  useEffect(() => {
    const b = backend.current;
    if (!b) return;
    const serverNow = () => clock.toServerTime(Date.now());
    const heardNow = () => offsetMs + Math.max(0, serverNow() - segmentStart);
    const clarity = (heard: number) => (clearAt === null ? 0 : clarityAt(heard, clipMs, clearAt));

    if (!playing) {
      b.pause();
      const held = clarity(offsetMs); // da fermo il suono resta nitido quanto lo era al momento dello stop
      b.setClarity(held, held, 0);
      setLoopPos(null);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const heard = heardNow();
      if (!loop) {
        b.playAt(startSeconds + heard / 1000);
        return;
      }
      const pos = loopPosition(loop, heard);
      setLoopPos(pos);
      if (pos.sounding) b.playAt(startSeconds + pos.songMs / 1000, pos.nextChangeMs! - heard);
      else {
        b.pause();
        b.cue(startSeconds); // il prossimo spezzone riparte dall'inizio senza ritardo
      }
      if (pos.nextChangeMs !== null) timer = setTimeout(step, Math.max(1, segmentStart + pos.nextChangeMs - offsetMs - serverNow()));
    };
    const begin = () => {
      // Negli ascolti a spezzoni il server fissa l'inizio poco nel futuro: si aspetta, così il primo spezzone è intero.
      const early = segmentStart - serverNow();
      if (early > 0) {
        timer = setTimeout(begin, early);
        return;
      }
      step();
      if (clearAt !== null) {
        const heard = heardNow();
        b.setClarity(clarity(heard), 1, Math.max(0, (clipMs * clearAt) / 100 - heard));
      }
    };
    const cancel = b.whenReady(begin);
    const stop = stopAt === null ? undefined : setTimeout(() => b.pause(), Math.max(0, stopAt - serverNow()));
    return () => {
      cancel();
      clearTimeout(timer);
      clearTimeout(stop);
    };
  }, [file, video, playing, segmentStart, offsetMs, stopAt, startSeconds, clipMs, clearAt, loop, clock]);

  return loopPos;
}

function CategoryChips({ options }: { options: CategoryOption[] }) {
  return (
    <ul className="categories" aria-label="Categorie">
      {options.map((o) => (
        <li key={o.key}>
          {o.name} <small>({o.left})</small>
        </li>
      ))}
    </ul>
  );
}

export function IndovinaCanzoneScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenView | Done;
  const sfx = useSfx(theme);
  const { unlocked } = useAudioState();
  const ytHost = useRef<HTMLDivElement>(null);
  const loopPos = useMusic(v.phase === "done" ? undefined : v.music, clock, ytHost);

  const phase = v.phase;
  const answeringId = v.phase === "answering" ? v.answering?.playerId : undefined;
  const hasWinner = v.phase === "resolved" && v.winner?.playerId != null;
  const choosingTeam = v.phase === "choosing" ? (v.choosing?.team?.id ?? "regia") : null;
  useEffect(() => {
    if (answeringId) sfx("buzz");
  }, [answeringId, sfx]);
  useEffect(() => {
    if (phase === "resolved") sfx(hasWinner ? "correct" : "wrong");
  }, [phase, hasWinner, sfx]);
  useEffect(() => {
    if (choosingTeam) sfx("start");
  }, [choosingTeam, sfx]);

  if (v.phase === "done") return <p className="big">Indovina la canzone concluso!</p>;
  return (
    <div className="buzzer-screen song-screen">
      {/* Contenitore del lettore YouTube: fuori vista, si usa solo l'audio. */}
      <div ref={ytHost} className="yt-hidden" aria-hidden />
      <Sfx theme={theme} text="BZZT!" trigger={answeringId ?? null} />
      <Sfx theme={theme} text="BAM!" trigger={hasWinner ? v.index : null} />
      <p className="muted">Brano {v.index + 1} di {v.total}</p>
      <h2 className="question note" aria-hidden>🎵</h2>
      {v.category && v.phase !== "choosing" && <p className="muted song-category">Categoria: <b>{v.category}</b></p>}
      {v.phase === "choosing" && v.choosing && (
        <>
          <p className="big">
            {v.choosing.team
              ? `🎯 Tocca a ${v.choosing.team.name}: ${v.choosing.captain?.nickname ?? "il capitano"} sceglie la categoria!`
              : "🎯 Si sceglie la categoria…"}
          </p>
          <Countdown openedAt={v.choosing.openedAt} deadline={v.choosing.deadline} clock={clock} />
          <CategoryChips options={v.choosing.options} />
        </>
      )}
      {v.phase === "idle" && <p className="big">Pronti ad ascoltare…</p>}
      {v.phase === "playing" && v.music && (
        <>
          <p className="big pulse">Chi lo sa? PRENOTATEVI!</p>
          {loopPos && v.music.loop && (
            <p className="muted song-loop" data-sounding={loopPos.sounding}>
              {loopPos.sounding ? "🔊" : "⏸"} Spezzone {loopPos.index + 1} di {v.music.loop.snippetsMs.length} ({seconds(v.music.loop.snippetsMs[loopPos.index]!)})
            </p>
          )}
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

export function IndovinaCanzoneController({ view, send, theme, clock }: ControllerProps) {
  const v = view as PlayerView | Done;
  const sfx = useSfx(theme);
  const answering = v.phase !== "done" && v.isAnswering;
  const wasAnswering = useRef(false);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (answering && !wasAnswering.current) sfx("start");
    wasAnswering.current = answering;
  }, [answering, sfx]);
  // Una nuova scelta (brano successivo) riabilita i pulsanti.
  const choosing = v.phase === "choosing";
  useEffect(() => {
    if (!choosing) setPicked(null);
  }, [choosing]);

  if (v.phase === "done") return <p className="big">Indovina la canzone concluso!</p>;

  if (v.phase === "choosing") {
    if (!v.pick) {
      return (
        <div className="buzzer-ctrl">
          <h2>🎵 Si sceglie la categoria</h2>
          <p className="big">{v.chooserName ? `Sceglie la squadra ${v.chooserName}…` : "Sceglie la regia…"}</p>
        </div>
      );
    }
    return (
      <div className="buzzer-ctrl pick-ctrl">
        <h2>🎯 Scegli la categoria!</h2>
        <p className="muted">Sei il capitano: scegli per la tua squadra.</p>
        <Countdown openedAt={v.pick.openedAt} deadline={v.pick.deadline} clock={clock} />
        <div className="pick-grid">
          {v.pick.options.map((o) => (
            <button
              key={o.key}
              className="pick-btn"
              disabled={picked !== null}
              onClick={() => {
                setPicked(o.key);
                send({ type: "pick", category: o.key });
                navigator.vibrate?.(30);
                sfx("buzz", 0.5);
              }}
            >
              {o.name} <small>({o.left})</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  let label = "Aspetta…";
  if (v.phase === "idle") label = "Ascolta lo schermo…";
  if (v.phase === "playing" || v.phase === "collecting") label = v.buzzed ? "Prenotato!" : "LO SO!";
  if (v.phase === "answering") label = v.isAnswering ? "Tocca a te: rispondi a voce!" : v.buzzed ? `Sei in coda (${v.position})` : "Aspetta…";
  if (v.phase === "paused") label = "La musica riparte…";
  if (v.phase === "resolved") label = v.won ? "Hai indovinato! 🎉" : "Brano chiuso";

  return (
    <div className="buzzer-ctrl">
      <h2>🎵 Ascolta lo schermo</h2>
      {v.category && <p className="muted">Categoria: <b>{v.category}</b></p>}
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
