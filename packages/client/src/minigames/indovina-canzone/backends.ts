import { Howl, Howler } from "howler";
import type { AudioEffect } from "@gioco/shared";
import { audio } from "../../audio/audio";
import { connectEffect } from "./effects";

/** Un lettore di musica, indipendente dalla sorgente (file del server o video YouTube nascosto). */
export interface MusicBackend {
  /** Esegue `cb` appena il brano è pronto (subito se lo è già); restituisce l'annullamento. */
  whenReady(cb: () => void): () => void;
  /**
   * Fa suonare dal secondo indicato. Con `maxMs` il lettore si ferma da solo dopo quel tempo, con precisione al campione
   * se la sorgente lo permette (gli spezzoni da mezzo secondo non possono dipendere dai timer della pagina).
   */
  playAt(seconds: number, maxMs?: number): void;
  pause(): void;
  /** Da fermo si prepara al secondo indicato, così il prossimo `playAt` parte senza ritardo (negli ascolti a spezzoni). */
  cue(seconds: number): void;
  /**
   * Solo con un effetto: porta la nitidezza da `from` a `to` (0 = effetto pieno, 1 = suono originale) in `durationMs`.
   * Senza effetto non c'è nulla da attenuare e non fa nulla.
   */
  setClarity(from: number, to: number, durationMs: number): void;
  dispose(): void;
}

/**
 * File del server con un effetto: l'elemento audio passa per la Web Audio API (stessa origine, quindi nessun
 * problema di CORS). Usa il contesto di Howler, già sbloccato dal primo tocco sullo schermo.
 */
function effectFileBackend(file: string, effect: AudioEffect): MusicBackend {
  const el = new Audio(`/media/${file}`);
  el.preload = "auto";
  const ctx = (Howler.ctx as AudioContext | null) ?? new AudioContext();
  const chain = connectEffect(ctx, ctx.createMediaElementSource(el), effect);
  return {
    whenReady(cb) {
      if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        cb();
        return () => undefined;
      }
      el.addEventListener("canplay", cb, { once: true });
      return () => el.removeEventListener("canplay", cb);
    },
    playAt(seconds) {
      el.muted = audio.isMuted();
      void ctx.resume();
      el.currentTime = seconds;
      void el.play().catch(() => undefined); // senza tocco dell'utente il browser può rifiutare
    },
    pause: () => el.pause(),
    cue(seconds) {
      el.currentTime = seconds;
    },
    setClarity: chain.setClarity,
    dispose() {
      el.pause();
      chain.disconnect();
      el.removeAttribute("src");
      el.load();
    },
  };
}

/**
 * File del server decodificato in memoria e suonato con la Web Audio API, per gli ascolti a spezzoni: attacco e stacco
 * di ogni spezzone sono programmati sul tempo dell'audio (al campione), mentre un elemento audio impiegherebbe qualche
 * centinaio di millisecondi a partire e a fermarsi, troppi per uno spezzone da mezzo secondo. Gli effetti passano da
 * un nodo d'ingresso fisso, a cui si collega ogni spezzone.
 */
export function bufferFileBackend(file: string, effect: AudioEffect = "none"): MusicBackend {
  const ctx = (Howler.ctx as AudioContext | null) ?? new AudioContext();
  const input = ctx.createGain();
  const chain = connectEffect(ctx, input, effect);
  let buffer: AudioBuffer | null = null;
  let current: AudioBufferSourceNode | null = null;
  let disposed = false;
  const waiting = new Set<() => void>();

  fetch(`/media/${file}`)
    .then((res) => res.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then(
      (decoded) => {
        if (disposed) return;
        buffer = decoded;
        waiting.forEach((cb) => cb());
        waiting.clear();
      },
      () => undefined, // brano illeggibile: resta muto e la regia può saltarlo
    );

  const stop = () => {
    try {
      current?.stop();
    } catch {
      /* già fermo */
    }
    current?.disconnect();
    current = null;
  };

  return {
    whenReady(cb) {
      if (buffer) {
        cb();
        return () => undefined;
      }
      waiting.add(cb);
      return () => void waiting.delete(cb);
    },
    playAt(seconds, maxMs) {
      if (!buffer) return;
      stop();
      void ctx.resume();
      input.gain.value = audio.isMuted() ? 0 : 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(input);
      source.start(0, Math.min(Math.max(0, seconds), buffer.duration));
      if (maxMs !== undefined) source.stop(ctx.currentTime + Math.max(0, maxMs) / 1000);
      current = source;
    },
    pause: stop,
    cue: () => undefined, // ogni spezzone riparte da sé: non c'è nulla da preparare
    setClarity: chain.setClarity,
    dispose() {
      disposed = true;
      waiting.clear();
      stop();
      chain.disconnect();
    },
  };
}

export function fileBackend(file: string, effect: AudioEffect = "none"): MusicBackend {
  if (effect !== "none") return effectFileBackend(file, effect);
  const h = new Howl({ src: [`/media/${file}`], html5: true, preload: true });
  return {
    whenReady(cb) {
      if (h.state() === "loaded") {
        cb();
        return () => undefined;
      }
      h.once("load", cb);
      return () => void h.off("load", cb);
    },
    playAt(seconds) {
      h.seek(seconds);
      if (!h.playing()) h.play();
    },
    pause: () => void h.pause(),
    cue: (seconds) => void h.seek(seconds),
    setClarity: () => undefined,
    dispose: () => void h.unload(),
  };
}

// ---- YouTube: IFrame Player API ufficiale, senza account né chiave. Serve internet sul PC dello schermo. ----

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
}
interface YTApi {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
type YTWindow = Window & { YT?: YTApi; onYouTubeIframeAPIReady?: () => void };

let apiPromise: Promise<YTApi> | null = null;
function loadYouTubeApi(): Promise<YTApi> {
  apiPromise ??= new Promise<YTApi>((resolve, reject) => {
    const w = window as YTWindow;
    if (w.YT?.Player) return resolve(w.YT);
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiPromise = null; // si potrà riprovare (es. internet tornato)
      reject(new Error("YouTube non raggiungibile"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/** `host` è un contenitore nascosto in pagina: il video resta nascosto, si usa solo l'audio. */
export function youtubeBackend(videoId: string, host: HTMLElement): MusicBackend {
  const el = document.createElement("div");
  host.appendChild(el);
  let player: YTPlayer | null = null;
  let ready = false;
  let disposed = false;
  const waiting = new Set<() => void>();

  loadYouTubeApi().then(
    (YT) => {
      if (disposed) return;
      player = new YT.Player(el, {
        width: 200,
        height: 200,
        videoId,
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            ready = true;
            waiting.forEach((cb) => cb());
            waiting.clear();
          },
        },
      });
    },
    () => undefined, // senza internet il brano resta muto: la regia può saltarlo
  );

  return {
    whenReady(cb) {
      if (ready) {
        cb();
        return () => undefined;
      }
      waiting.add(cb);
      return () => void waiting.delete(cb);
    },
    playAt(seconds) {
      if (!player) return;
      if (audio.isMuted()) player.mute();
      else player.unMute();
      player.seekTo(seconds, true);
      player.playVideo();
    },
    pause: () => void player?.pauseVideo(),
    cue: () => undefined, // un video non ancora avviato ripartirebbe da solo: si cerca il punto direttamente in `playAt`
    setClarity: () => undefined,
    dispose() {
      disposed = true;
      waiting.clear();
      player?.destroy();
      el.remove();
    },
  };
}
