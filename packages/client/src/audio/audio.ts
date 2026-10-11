import { Howl, Howler } from "howler";
import type { ThemeId } from "@gioco/shared";

export type SoundName = "tick" | "start" | "buzz" | "correct" | "wrong" | "reveal" | "fanfare";

const MUTE_KEY = "gioco.muted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Effetti sonori per tema. I file sono piccoli WAV generati da `tools/sounds/generate.mjs`
 * e caricati solo quando servono (il telefono ne usa pochi, lo schermo tutti quelli del tema).
 * Howler sblocca l'audio al primo tocco, anche su iOS.
 */
class AudioManager {
  private cache = new Map<string, Howl>();
  private muted = readMuted();

  constructor() {
    Howler.mute(this.muted);
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    Howler.mute(muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* preferenza non salvata: vale per questa sessione */
    }
  }

  /** True se il browser ha già permesso la riproduzione (serve un tocco dell'utente). */
  isUnlocked(): boolean {
    return Howler.ctx?.state === "running";
  }

  play(theme: ThemeId, name: SoundName, volume = 0.6): void {
    if (this.muted) return;
    const key = `${theme}/${name}`;
    let howl = this.cache.get(key);
    if (!howl) {
      howl = new Howl({ src: [`/sounds/${key}.wav`], volume, preload: true });
      this.cache.set(key, howl);
    }
    howl.volume(volume);
    howl.play();
  }
}

export const audio = new AudioManager();
