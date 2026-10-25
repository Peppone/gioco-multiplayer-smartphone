import { useEffect, useMemo, useRef, useState } from "react";
import { type AudioEffect, type Listening, PLAYBACK_MODES, type PlaybackMode, type SongListen, resolveListening } from "@gioco/shared";
import { fileBackendFor } from "../../minigames/indovina-canzone/backends";
import { type EffectChain, connectEffect } from "../../minigames/indovina-canzone/effects";
import { startListening } from "../../minigames/indovina-canzone/listening";

interface Graph {
  source: MediaElementAudioSourceNode;
  chain: EffectChain | null;
}

// Un elemento audio si può collegare a un contesto una volta sola: contesto e sorgenti restano per tutta la pagina.
let sharedCtx: AudioContext | null = null;
const graphs = new WeakMap<HTMLAudioElement, Graph>();
const context = () => (sharedCtx ??= new AudioContext());

/** Anticipo con cui parte la prova: negli spezzoni il primo non deve essere accorciato dal tempo di avvio. */
const TRIAL_LEAD_MS = 400;

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const nums = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : undefined);

/** Le impostazioni di ascolto di un brano e i predefiniti del round, lette dai valori del modulo (che possono essere incompleti). */
export function listeningFromForm(song: Record<string, unknown>, round: Record<string, unknown>): Listening {
  const mode = PLAYBACK_MODES.find((m) => m === song.playback);
  const roundMode = round.playback === "loops" ? "loops" : "continuous";
  const songListen: SongListen = {
    playback: mode ?? "inherit",
    clipSeconds: num(song.clipSeconds),
    loopSeconds: nums(song.loopSeconds),
    loopPauseSeconds: num(song.loopPauseSeconds),
    speed: num(song.speed),
    normalAfterSeconds: num(song.normalAfterSeconds),
    speedTransitionSeconds: num(song.speedTransitionSeconds),
    keepPitch: typeof song.keepPitch === "boolean" ? song.keepPitch : undefined,
    stage1Seconds: num(song.stage1Seconds),
    stage2Seconds: num(song.stage2Seconds),
    stageTransitionSeconds: num(song.stageTransitionSeconds),
  };
  const roundListen = { playback: roundMode as "continuous" | "loops", clipSeconds: num(round.clipSeconds), loopSeconds: nums(round.loopSeconds), loopPauseSeconds: num(round.loopPauseSeconds) };
  return resolveListening(
    Object.fromEntries(Object.entries(roundListen).filter(([, v]) => v !== undefined)),
    songListen,
  );
}

const MODE_NAMES: Record<PlaybackMode, string> = {
  continuous: "continuo",
  loops: "a spezzoni crescenti",
  speed: "più lento o più veloce",
  speed_then_normal: "velocità diversa, poi normale",
  blur_stages: "molto ovattato, poi poco, poi normale",
};

/**
 * Anteprima di un brano nel modulo. Il lettore normale suona il file con l'effetto scelto (stessa catena dello
 * schermo), e la casella permette di confrontarlo con l'originale. «Prova l'ascolto» fa suonare il brano come lo
 * sentirà lo schermo in partita, con la modalità scelta per questo brano (spezzoni, velocità, fasi), usando lo stesso motore.
 */
export function AudioPreview({ file, effect, song, round }: { file: string; effect: AudioEffect; song: Record<string, unknown>; round: Record<string, unknown> }) {
  const el = useRef<HTMLAudioElement>(null);
  const [withEffect, setWithEffect] = useState(true);
  const active: AudioEffect = withEffect ? effect : "none";

  useEffect(() => {
    const audioEl = el.current;
    if (!audioEl) return;
    let graph = graphs.get(audioEl);
    if (!graph) {
      // Senza effetto e mai collegato: resta il lettore normale, senza Web Audio.
      if (active === "none") return;
      graph = { source: context().createMediaElementSource(audioEl), chain: null };
      graphs.set(audioEl, graph);
    }
    graph.chain?.disconnect();
    graph.chain = connectEffect(context(), graph.source, active);
    return () => {
      graph.chain?.disconnect();
      graph.chain = null;
    };
  }, [active]);

  return (
    <>
      <audio ref={el} controls preload="none" src={`/media/${file}`} aria-label="Anteprima" onPlay={() => void sharedCtx?.resume()} />
      {effect !== "none" && (
        <label className="check">
          <input type="checkbox" checked={withEffect} onChange={(e) => setWithEffect(e.target.checked)} />
          Ascolta con l'effetto
        </label>
      )}
      <ListenTrial file={file} effect={effect} song={song} round={round} />
    </>
  );
}

/** Prova dell'ascolto del brano, con il motore di riproduzione dello schermo. */
function ListenTrial({ file, effect, song, round }: { file: string; effect: AudioEffect; song: Record<string, unknown>; round: Record<string, unknown> }) {
  const listening = useMemo(() => listeningFromForm(song, round), [JSON.stringify(song), JSON.stringify(round)]); // eslint-disable-line react-hooks/exhaustive-deps
  const startSeconds = num(song.startSeconds) ?? 0;
  const clearAtPercent = round.progressive === true && !listening.stages ? (num(round.clearAtPercent) ?? 100) : null;
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(false);
  };

  // Cambiando brano, modalità o parametri la prova in corso non vale più; uscendo dalla pagina si ferma.
  const key = JSON.stringify([file, listening, startSeconds, effect, clearAtPercent]);
  useEffect(() => stop, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    stop();
    // Con le fasi il filtro lo guidano le fasi, come in partita.
    const backend = fileBackendFor(file, listening.stages ? "heavy_blur" : effect, listening, { ctx: context() });
    let run: (() => void) | undefined;
    let end: ReturnType<typeof setTimeout> | undefined;
    // Si parte a brano pronto, così il tempo di caricamento non accorcia il primo spezzone.
    const cancelReady = backend.whenReady(() => {
      const t0 = Date.now() + TRIAL_LEAD_MS;
      run = startListening(backend, { listening, startSeconds, offsetMs: 0, segmentStart: t0, stopAt: t0 + listening.clipMs, clipMs: listening.clipMs, clearAtPercent, now: Date.now });
      end = setTimeout(stop, TRIAL_LEAD_MS + listening.clipMs + 300);
    });
    stopRef.current = () => {
      cancelReady();
      run?.();
      clearTimeout(end);
      backend.pause();
      backend.dispose();
    };
    setPlaying(true);
  };

  return (
    <div className="listen-trial" data-state={playing ? "playing" : "idle"} data-mode={listening.mode}>
      <button type="button" aria-pressed={playing} onClick={playing ? stop : start}>
        {playing ? "■ Ferma la prova" : "▶ Prova l'ascolto"}
      </button>
      <small className="muted">
        {MODE_NAMES[listening.mode]}, {(listening.clipMs / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s
      </small>
    </div>
  );
}
