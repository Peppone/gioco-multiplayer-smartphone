import type { Socket } from "socket.io-client";
import { ClientEvent, REACTIONS } from "@gioco/shared";

/** Barra delle reazioni emoji, sempre disponibile sul telefono. */
export function ReactionBar({ socket }: { socket: Socket }) {
  return (
    <div className="reaction-bar" role="group" aria-label="Reazioni">
      {REACTIONS.map((emoji) => (
        <button key={emoji} type="button" onClick={() => socket.emit(ClientEvent.Reaction, { emoji })} aria-label={emoji}>
          {emoji}
        </button>
      ))}
    </div>
  );
}
