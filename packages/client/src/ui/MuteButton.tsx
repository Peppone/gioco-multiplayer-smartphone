import { useAudioState } from "../audio/useAudio";

/** Attiva/disattiva l'audio. Finché il browser non l'ha sbloccato invita a toccare. */
export function MuteButton({ className = "" }: { className?: string }) {
  const { muted, unlocked, toggle } = useAudioState();
  const needsTap = !muted && !unlocked;
  return (
    <button
      type="button"
      className={`mute-btn ${needsTap ? "pulse" : ""} ${className}`}
      onClick={toggle}
      aria-label={muted ? "Attiva l'audio" : "Disattiva l'audio"}
    >
      {muted ? "🔇" : "🔊"}
      {needsTap && <span> tocca per attivare l'audio</span>}
    </button>
  );
}
