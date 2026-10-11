import { Howl, Howler } from "howler";
import type { AudioEffect } from "@gioco/shared";
import { audio } from "../../audio/audio";
import { connectEffect } from "./effects";

/** Un lettore di musica, indipendente dalla sorgente (file del server o video YouTube nascosto). */
export interface MusicBackend {
  /** Esegue `cb` appena il brano è pronto (subito se lo è già); restituisce l'annullamento. */
  whenReady(cb: () => void): () => void;
  /** Fa suonare dal secondo indicato. */
  playAt(seconds: number): void;
  pause(): void;
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
  const disconnect = connectEffect(ctx, ctx.createMediaElementSource(el), effect);
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
    dispose() {
      el.pause();
      disconnect();
      el.removeAttribute("src");
      el.load();
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
    dispose() {
      disposed = true;
      waiting.clear();
      player?.destroy();
      el.remove();
    },
  };
}
