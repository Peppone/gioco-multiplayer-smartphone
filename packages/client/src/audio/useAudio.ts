import { useCallback, useEffect, useState } from "react";
import { Howler } from "howler";
import type { ThemeId } from "@gioco/shared";
import { type SoundName, audio } from "./audio";

/** Funzione stabile per riprodurre un effetto nel tema indicato. */
export function useSfx(theme: ThemeId): (name: SoundName, volume?: number) => void {
  return useCallback((name, volume) => audio.play(theme, name, volume), [theme]);
}

/** Stato del pulsante audio: muto/attivo e se serve ancora un tocco per sbloccare. */
export function useAudioState() {
  const [muted, setMutedState] = useState(audio.isMuted());
  const [unlocked, setUnlocked] = useState(audio.isUnlocked());

  useEffect(() => {
    const id = setInterval(() => setUnlocked(audio.isUnlocked()), 500);
    return () => clearInterval(id);
  }, []);

  const toggle = useCallback(() => {
    const next = !audio.isMuted();
    audio.setMuted(next);
    setMutedState(next);
    // Il tocco su questo pulsante è un gesto utente: ne approfittiamo per sbloccare il contesto audio.
    void Howler.ctx?.resume();
  }, []);

  return { muted, unlocked, toggle };
}
