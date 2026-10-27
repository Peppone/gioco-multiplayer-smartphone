import { useEffect, useMemo, useRef, useState } from "react";
import { type EffectSetting, type Listening, PLAYBACK_MODES, type PlaybackMode, type SongListen, effectZone, effectsForListening, resolveListening } from "@gioco/shared";
import { type MusicBackend, fileBackendFor } from "../../minigames/indovina-canzone/backends";
import { type EffectChain, connectEffects } from "../../minigames/indovina-canzone/effects";
import { startListening } from "../../minigames/indovina-canzone/listening";
import { type PreparedFile, prepareFile, splitChain } from "../../minigames/indovina-canzone/prepare";
import { Waveform } from "./Waveform";

interface Graph {
  source: MediaElementAudioSourceNode;
  chain: EffectChain | null;
}

// Un elemento audio si può collegare a un contesto una volta sola: contesto e sorgenti restano per tutta la pagina.
let sharedCtx: AudioContext | null = null;
const graphs = new WeakMap<HTMLAudioElement, Graph>();
const context = () => (sharedCtx ??= new AudioContext());

/** Dopo quanto (ms) dall'ultimo cambio di un effetto lo si risente: muovendo un cursore non si ricostruisce la catena a ogni pixel. */
const EFFECT_SETTLE_MS = 120;

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
 * Anteprima di un brano nel modulo. Il lettore normale suona il file con tutti gli effetti scelti, in serie (stessa catena
 * dello schermo), e li segue mentre si cambiano: aggiungere, togliere o spostare un effetto, o muovere il cursore della sua
 * quantità, si sente subito, anche a brano in riproduzione. La casella permette di confrontarlo con l'originale.
 * «Prova l'ascolto» fa suonare il brano come lo sentirà lo schermo in partita, con la modalità scelta per questo brano
 * (spezzoni, velocità, fasi), usando lo stesso motore.
 */
export function AudioPreview({
  file,
  effects,
  song,
  round,
  onZoneChange,
  onAddZone,
}: {
  file: string;
  effects: EffectSetting[];
  song: Record<string, unknown>;
  round: Record<string, unknown>;
  /** Se c'è, le zone degli effetti si trascinano su una forma d'onda. */
  onZoneChange?: (index: number, zone: { from: number; to: number } | null) => void;
  onAddZone?: (index: number, zone: { from: number; to: number }) => void;
}) {
  const el = useRef<HTMLAudioElement>(null);
  const [withEffect, setWithEffect] = useState(true);
  const wanted = withEffect ? effects : [];
  const wantedKey = JSON.stringify(wanted);
  // Si aspetta che il cursore si fermi un attimo prima di rifare la catena.
  const [settledKey, setSettledKey] = useState(wantedKey);
  useEffect(() => {
    const t = setTimeout(() => setSettledKey(wantedKey), EFFECT_SETTLE_MS);
    return () => clearTimeout(t);
  }, [wantedKey]);

  // I camuffamenti rielaborano il file: finché non è pronto l'anteprima non suona (suonerebbe il brano senza camuffamento).
  const { pre, live } = useMemo(() => splitChain(JSON.parse(settledKey) as EffectSetting[]), [settledKey]);
  const preKey = JSON.stringify(pre);
  const [prepared, setPrepared] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (pre.length === 0) return;
    const abort = new AbortController();
    let made: PreparedFile | null = null;
    prepareFile(file, pre, { signal: abort.signal }).then(
      (done) => {
        if (abort.signal.aborted) return done.dispose();
        made = done;
        setPrepared({ key: preKey, url: done.url });
      },
      () => undefined,
    );
    return () => {
      abort.abort();
      made?.dispose();
    };
  }, [file, preKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Prepara» anche mentre un cambio di effetti non si è ancora assestato: l'anteprima non deve suonare l'elenco di prima.
  const preparing = settledKey !== wantedKey || (pre.length > 0 && prepared?.key !== preKey);
  const source = pre.length === 0 ? `/media/${file}` : prepared?.key === preKey ? prepared.url : undefined;

  useEffect(() => {
    const audioEl = el.current;
    if (!audioEl) return;
    const active = live;
    let graph = graphs.get(audioEl);
    if (!graph) {
      // Senza effetti e mai collegato: resta il lettore normale, senza Web Audio. Con dei camuffamenti il file è già
      // rielaborato (resta solo da suonare), ma si passa comunque da Web Audio come con gli altri effetti.
      if (active.length === 0 && pre.length === 0) return;
      graph = { source: context().createMediaElementSource(audioEl), chain: null };
      graphs.set(audioEl, graph);
    }
    graph.chain?.disconnect();
    graph.chain = connectEffects(context(), graph.source, active);
    return () => {
      graph.chain?.disconnect();
      graph.chain = null;
    };
  }, [settledKey]);

  return (
    <div className="audio-preview">
      <audio ref={el} controls preload="none" src={source} aria-label="Anteprima" data-effects={(JSON.parse(settledKey) as EffectSetting[]).length} data-state={preparing ? "preparing" : "ready"} onPlay={() => void sharedCtx?.resume()} />
      {preparing && <small className="muted" role="status">Preparo l'anteprima con i camuffamenti…</small>}
      {effects.length > 0 && (
        <label className="check">
          <input type="checkbox" checked={withEffect} onChange={(e) => setWithEffect(e.target.checked)} />
          Ascolta con gli effetti
        </label>
      )}
      {onZoneChange && effects.length > 0 && <Waveform file={file} effects={effects} onZoneChange={onZoneChange} onAddZone={onAddZone} />}
      {withEffect && <ZoneButtons audio={el} effects={effects} disabled={preparing || !source} />}
      <ListenTrial file={file} effects={effects} song={song} round={round} />
    </div>
  );
}

/** Secondi di brano che si sentono prima e dopo una zona, per capire in che punto cade. */
const ZONE_CONTEXT_SECONDS = 1.5;

/** Un pulsante per ogni effetto con una zona: suona l'anteprima da poco prima a poco dopo quella zona, con gli effetti. */
function ZoneButtons({ audio, effects, disabled }: { audio: React.RefObject<HTMLAudioElement | null>; effects: EffectSetting[]; disabled: boolean }) {
  const zoned = effects.flatMap((e, i) => {
    const zone = effectZone(e);
    return zone ? [{ i, zone }] : [];
  });
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  if (zoned.length === 0) return null;

  const play = (zone: { from: number; to: number }) => {
    const el = audio.current;
    if (!el) return;
    stopRef.current?.();
    const end = zone.to + ZONE_CONTEXT_SECONDS;
    const onTime = () => el.currentTime >= end && stop();
    const stop = () => {
      el.pause();
      el.removeEventListener("timeupdate", onTime);
      stopRef.current = null;
    };
    stopRef.current = stop;
    el.currentTime = Math.max(0, zone.from - ZONE_CONTEXT_SECONDS);
    el.addEventListener("timeupdate", onTime);
    void sharedCtx?.resume();
    void el.play().catch(stop);
  };

  return (
    <div className="zone-buttons">
      {zoned.map(({ i, zone }) => (
        <button key={i} type="button" disabled={disabled} onClick={() => play(zone)} title="Suona il brano da poco prima a poco dopo la zona, con gli effetti">
          ▶ Ascolta la zona {zone.from.toLocaleString("it-IT", { maximumFractionDigits: 1 })}–{zone.to.toLocaleString("it-IT", { maximumFractionDigits: 1 })} s
        </button>
      ))}
    </div>
  );
}

/** Prova dell'ascolto del brano, con il motore di riproduzione dello schermo. */
function ListenTrial({ file, effects, song, round }: { file: string; effects: EffectSetting[]; song: Record<string, unknown>; round: Record<string, unknown> }) {
  const listening = useMemo(() => listeningFromForm(song, round), [JSON.stringify(song), JSON.stringify(round)]); // eslint-disable-line react-hooks/exhaustive-deps
  const startSeconds = num(song.startSeconds) ?? 0;
  const progressive = typeof song.progressive === "boolean" ? song.progressive : round.progressive === true;
  const clearAtPercent = progressive && !listening.stages ? (num(song.clearAtPercent) ?? num(round.clearAtPercent) ?? 100) : null;
  const [playing, setPlaying] = useState(false);
  const [updating, setUpdating] = useState(false);
  // Ciò che suona adesso e, durante un cambio di effetti, il nuovo lettore che si sta preparando.
  const live = useRef<{ t0: number; backend: MusicBackend; stopRun: () => void; end: ReturnType<typeof setTimeout> } | null>(null);
  const pending = useRef<{ backend: MusicBackend; cancel: () => void } | null>(null);

  const dropPending = () => {
    pending.current?.cancel();
    pending.current?.backend.dispose();
    pending.current = null;
    setUpdating(false);
  };
  const dropLive = () => {
    const l = live.current;
    if (!l) return;
    l.stopRun();
    clearTimeout(l.end);
    l.backend.pause();
    l.backend.dispose();
    live.current = null;
  };
  const stop = () => {
    dropPending();
    dropLive();
    setPlaying(false);
  };

  // Cambiando brano, modalità o parametri la prova in corso non vale più; uscendo dalla pagina si ferma. Gli effetti no: si cambiano a prova in corso (vedi sotto).
  const key = JSON.stringify([file, listening, startSeconds, clearAtPercent]);
  useEffect(() => stop, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const makeBackend = (fx: EffectSetting[]) =>
    // Con le fasi il filtro lo guidano le fasi, come in partita.
    fileBackendFor(file, effectsForListening(fx, listening.stages), listening, {
      ctx: context(),
      startSeconds,
      ignoreMute: true,
      reveal: clearAtPercent === null ? undefined : { clipMs: listening.clipMs, clearAtPercent },
    });

  /**
   * Fa suonare `backend` appena è pronto, così il tempo di caricamento non accorcia il primo spezzone. Con `resumeT0` (l'inizio
   * della prova in corso) prosegue dal punto già raggiunto: il lettore di prima tace solo a questo punto, senza interruzioni.
   */
  const launch = (backend: MusicBackend, resumeT0?: number) => {
    const cancel = backend.whenReady(() => {
      pending.current = null;
      setUpdating(false);
      const now = Date.now();
      const t0 = resumeT0 ?? now + TRIAL_LEAD_MS;
      dropLive();
      const running = now >= t0;
      const stopRun = startListening(backend, {
        listening,
        startSeconds,
        offsetMs: running ? now - t0 : 0,
        segmentStart: running ? now : t0,
        stopAt: t0 + listening.clipMs,
        clipMs: listening.clipMs,
        clearAtPercent,
        now: Date.now,
      });
      live.current = { t0, backend, stopRun, end: setTimeout(stop, Math.max(0, t0 + listening.clipMs + 300 - now)) };
    });
    pending.current = { backend, cancel };
  };

  const start = () => {
    stop();
    // Il contesto audio si sblocca qui, nel clic: più avanti (a brano caricato) il browser potrebbe rifiutarlo.
    void context().resume();
    launch(makeBackend(effects));
    setPlaying(true);
  };

  // Gli effetti cambiati a prova in corso si sentono senza fermarla: il nuovo lettore si prepara mentre il vecchio continua
  // (i camuffamenti richiedono qualche secondo), poi prende il suo posto dal punto raggiunto. Più cambi di fila: vale l'ultimo.
  const effectsKey = JSON.stringify(effects);
  useEffect(() => {
    if (!live.current && !pending.current) return;
    const t = setTimeout(() => {
      const t0 = live.current?.t0;
      dropPending();
      if (t0 !== undefined) setUpdating(true);
      launch(makeBackend(effects), t0);
    }, EFFECT_SETTLE_MS);
    return () => clearTimeout(t);
  }, [effectsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="listen-trial" data-state={playing ? "playing" : "idle"} data-updating={updating} data-mode={listening.mode}>
      <button
        type="button"
        aria-pressed={playing}
        onClick={playing ? stop : start}
        title="Suona il brano come lo sentirà lo schermo in partita: dal punto «Parti da», con la modalità di ascolto, la durata e gli effetti di questo brano. Si ferma da solo."
      >
        {playing ? "■ Ferma la prova" : "▶ Prova l'ascolto"}
      </button>
      {updating && <small className="muted" role="status">Aggiorno gli effetti senza fermare la prova…</small>}
      <small className="muted">
        {MODE_NAMES[listening.mode]}, {(listening.clipMs / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} s · come in partita, dal secondo {startSeconds.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
      </small>
    </div>
  );
}
