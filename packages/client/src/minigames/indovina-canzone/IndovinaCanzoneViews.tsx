import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { type BlurStagesPlan, type EffectSetting, type ClockSync, type LoopPlan, type LoopPosition, type PlaybackMode, type RatePlan } from "@gioco/shared";
import { useAudioState, useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
import { Countdown, useServerNow } from "../Countdown";
import { type MusicBackend, fileBackendFor, youtubeBackend } from "./backends";
import { holdListening, startListening } from "./listening";
import type { ControllerProps, ViewProps } from "../types";

interface Music {
  /** Una sola delle due sorgenti è presente: file caricato o video YouTube. */
  file: string | null;
  youtubeId: string | null;
  /** Effetti in serie, ciascuno con la sua quantità; vuoto = brano com'è. */
  effects: EffectSetting[];
  startSeconds: number;
  playing: boolean;
  offsetMs: number;
  segmentStart: number;
  stopAt: number | null;
  clipMs: number;
  /** Come si ascolta questo brano. */
  mode: PlaybackMode;
  /** Ascolto a spezzoni crescenti; assente negli altri. */
  loop: LoopPlan | null;
  /** Ripetizioni sempre più nitide: ogni giro dello spezzone attenua gli effetti, l'ultimo è l'originale. */
  stepped: boolean;
  /** Brano più lento o più veloce, con l'eventuale ritorno alla velocità normale; assente negli altri. */
  rate: RatePlan | null;
  keepPitch: boolean;
  /** Suono molto ovattato, poi poco, poi normale; assente negli altri. */
  stages: BlurStagesPlan | null;
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
  /** Il round in corso (quando il quiz ha dei round per categoria); `song` è 0 mentre se ne sceglie la categoria. */
  round: { number: number; total: number; song: number; songs: number; category: string | null } | null;
  choosing: {
    /** Chi decide la categoria: le squadre a turno (con tempo) oppure la regia (senza). */
    by: "teams" | "host";
    team: { id: string; name: string; color: string | null } | null;
    captain: { playerId: string; nickname: string | null } | null;
    openedAt: number;
    deadline: number | null;
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
  /** Solo dopo una risposta sbagliata con la riprenotazione: ora server da cui ci si può prenotare di nuovo, e durata dell'attesa. */
  cooldownUntil?: number | null;
  cooldownMs?: number;
  /** L'attesa vale per tutta la squadra. */
  cooldownTeam?: boolean;
  isAnswering: boolean;
  position: number | null;
  won: boolean;
  /** Solo per il capitano della squadra di turno nella scelta della categoria. */
  pick: { openedAt: number; deadline: number; round: number | null; options: CategoryOption[] } | null;
  chooserName: string | null;
  category: string | null;
}
type Done = { phase: "done" };

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s`;

/**
 * La musica suona solo sullo schermo condiviso, sentita da tutti nella stanza. Il server dice quando è
 * (ri)partita e da dove: ogni schermo ricostruisce la posizione con l'orologio sincronizzato. Come suona il brano
 * (spezzoni, velocità, fasi del filtro, rampa della nitidezza) lo decide `startListening`, in funzione del tempo ascoltato.
 * Restituisce lo spezzone in corso (solo negli ascolti a spezzoni).
 */
function useMusic(music: Music | null | undefined, clock: ClockSync, host: RefObject<HTMLDivElement | null>): LoopPosition | null {
  const backend = useRef<MusicBackend | null>(null);
  const [loopPos, setLoopPos] = useState<LoopPosition | null>(null);
  const file = music?.file;
  const video = music?.youtubeId;
  const keepPitch = music?.keepPitch ?? true;
  const startSeconds = music?.startSeconds ?? 0;
  // I piani sono oggetti nuovi a ogni vista: si confrontano per contenuto, altrimenti la musica ripartirebbe a ogni aggiornamento.
  const planKey = JSON.stringify([music?.loop ?? null, music?.rate ?? null, music?.stages ?? null, music?.effects ?? [], music?.stepped ?? false]);
  const { plan, effects } = useMemo(() => {
    const [loop, rate, stages, effects, stepped] = JSON.parse(planKey) as [LoopPlan | null, RatePlan | null, BlurStagesPlan | null, EffectSetting[], boolean];
    return { plan: { loop, rate, stages, stepped }, effects };
  }, [planKey]);

  const clipMs = music?.clipMs ?? 0;
  const stepped = plan.stepped;
  // Con le ripetizioni la nitidezza segue i giri, non il tempo: serve comunque un piano di svelamento (per i camuffamenti).
  const clearAtPercent = stepped ? 100 : (music?.clearAtPercent ?? null);

  // Il brano si carica appena il round passa a questo pezzo, così la musica parte senza attese.
  useEffect(() => {
    if (video && host.current) backend.current = youtubeBackend(video, host.current);
    else if (file) {
      const reveal = clearAtPercent === null ? undefined : { clipMs, clearAtPercent, stepped };
      backend.current = fileBackendFor(file, effects, { ...plan, keepPitch }, { startSeconds, reveal });
    } else return;
    return () => {
      backend.current?.dispose();
      backend.current = null;
    };
  }, [file, video, effects, plan, keepPitch, startSeconds, clipMs, clearAtPercent, stepped, host]);

  const playing = music?.playing ?? false;
  const segmentStart = music?.segmentStart ?? 0;
  const offsetMs = music?.offsetMs ?? 0;
  const stopAt = music?.stopAt ?? null;

  useEffect(() => {
    const b = backend.current;
    if (!b) return;
    const run = { listening: plan, startSeconds, offsetMs, segmentStart, stopAt, clipMs, clearAtPercent, now: () => clock.toServerTime(Date.now()), onLoop: setLoopPos };
    if (!playing) {
      holdListening(b, run);
      return;
    }
    return startListening(b, run);
  }, [file, video, playing, segmentStart, offsetMs, stopAt, startSeconds, clipMs, clearAtPercent, plan, clock]);

  return loopPos;
}

/** Una riga per dire come suona il brano (solo le modalità che si sentono subito: velocità e fasi). */
function ModeNote({ music }: { music: Music }) {
  const { rate, stages } = music;
  if (rate) {
    const slow = rate.rate < 1;
    return (
      <p className="muted song-mode" data-mode={music.mode}>
        {slow ? "🐢 Brano rallentato" : rate.rate > 1 ? "🐇 Brano accelerato" : "🎚 Brano a velocità normale"}
        {rate.untilMs !== null && ", poi torna normale"}
      </p>
    );
  }
  if (stages) return <p className="muted song-mode" data-mode={music.mode}>🌫 Il suono è ovattato e si schiarisce a poco a poco</p>;
  return null;
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
      {v.round ? (
        <p className="muted song-round" data-round={v.round.number}>
          Round {v.round.number} di {v.round.total}
          {v.round.song > 0 && ` · brano ${v.round.song} di ${v.round.songs}`}
        </p>
      ) : (
        <p className="muted">Brano {v.index + 1} di {v.total}</p>
      )}
      <h2 className="question note" aria-hidden>🎵</h2>
      {v.category && v.phase !== "choosing" && <p className="muted song-category">Categoria: <b>{v.category}</b></p>}
      {v.phase === "choosing" && v.choosing && (
        <>
          <p className="big">
            {v.choosing.team
              ? `🎯 Tocca a ${v.choosing.team.name}: ${v.choosing.captain?.nickname ?? "il capitano"} sceglie la categoria${v.round ? " per tutti" : ""}!`
              : v.choosing.by === "host"
                ? "🎯 La regia sceglie la categoria…"
                : "🎯 Si sceglie la categoria…"}
          </p>
          {v.choosing.deadline !== null && <Countdown openedAt={v.choosing.openedAt} deadline={v.choosing.deadline} clock={clock} />}
          <CategoryChips options={v.choosing.options} />
        </>
      )}
      {v.phase === "idle" && <p className="big">Pronti ad ascoltare…</p>}
      {v.phase === "playing" && v.music && (
        <>
          <p className="big pulse">Chi lo sa? PRENOTATEVI!</p>
          <ModeNote music={v.music} />
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
  const nowMs = useServerNow(clock, 100);

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
        <p className="muted">{v.pick.round ? `Round ${v.pick.round}: sei il capitano, scegli per tutti.` : "Sei il capitano: scegli per la tua squadra."}</p>
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

  // Dopo una risposta sbagliata (con la riprenotazione) il pulsante resta spento fino alla fine dell'attesa.
  const cooldownUntil = v.cooldownUntil ?? null;
  const cooling = cooldownUntil !== null && cooldownUntil > nowMs;
  const canBuzz = v.canBuzz && !cooling;
  const waitLabel = v.cooldownTeam ? "Squadra in attesa…" : "Hai sbagliato…";
  let label = "Aspetta…";
  if (v.phase === "idle") label = "Ascolta lo schermo…";
  if (v.phase === "playing" || v.phase === "collecting") label = v.buzzed ? "Prenotato!" : cooling ? waitLabel : "LO SO!";
  if (v.phase === "answering") label = v.isAnswering ? "Tocca a te: rispondi a voce!" : v.buzzed ? `Sei in coda (${v.position})` : "Aspetta…";
  if (v.phase === "paused") label = cooling ? waitLabel : "La musica riparte…";
  if (v.phase === "resolved") label = v.won ? "Hai indovinato! 🎉" : "Brano chiuso";

  return (
    <div className="buzzer-ctrl">
      <h2>🎵 Ascolta lo schermo</h2>
      {v.category && <p className="muted">Categoria: <b>{v.category}</b></p>}
      <button
        className={`buzz-btn ${v.isAnswering ? "answering" : ""}`}
        disabled={!canBuzz}
        // pointerdown e non click: niente ritardo di 300 ms su mobile.
        onPointerDown={() => {
          if (!canBuzz) return;
          send({ type: "buzz" });
          navigator.vibrate?.(30); // Android; iOS la ignora
          sfx("buzz", 0.5);
        }}
      >
        {label}
      </button>
      {cooling && cooldownUntil !== null && v.phase !== "resolved" && (
        <div className="rebuzz-wait" data-testid="rebuzz-wait">
          <p className="muted">Potrai prenotarti di nuovo tra:</p>
          <Countdown openedAt={cooldownUntil - (v.cooldownMs ?? 0)} deadline={cooldownUntil} clock={clock} />
        </div>
      )}
    </div>
  );
}
