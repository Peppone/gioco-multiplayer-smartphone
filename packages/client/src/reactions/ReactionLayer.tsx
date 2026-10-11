import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Socket } from "socket.io-client";
import { type ReactionEvent, ServerEvent } from "@gioco/shared";

interface Floating extends ReactionEvent {
  key: number;
  /** Posizione orizzontale (% della larghezza) e deriva laterale, casuali per ogni reazione. */
  x: number;
  drift: number;
}

const MAX_ON_SCREEN = 40;

/** Le emoji dei giocatori «volano» verso l'alto sullo schermo condiviso, con il nome di chi le ha inviate. */
export function ReactionLayer({ socket }: { socket: Socket }) {
  const [items, setItems] = useState<Floating[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const onReaction = (r: ReactionEvent) => {
      const item: Floating = { ...r, key: counter.current++, x: 8 + Math.random() * 84, drift: (Math.random() - 0.5) * 120 };
      setItems((cur) => [...cur.slice(-(MAX_ON_SCREEN - 1)), item]);
    };
    socket.on(ServerEvent.Reaction, onReaction);
    return () => void socket.off(ServerEvent.Reaction, onReaction);
  }, [socket]);

  return (
    <div className="reaction-layer" aria-hidden>
      {items.map((it) => (
        <motion.div
          key={it.key}
          className="reaction"
          style={{ left: `${it.x}%` }}
          initial={{ y: 0, opacity: 0, scale: 0.4 }}
          animate={{ y: "-85vh", x: it.drift, opacity: [0, 1, 1, 0], scale: [0.4, 1.2, 1, 1] }}
          transition={{ duration: 4, ease: "easeOut", times: [0, 0.1, 0.8, 1] }}
          onAnimationComplete={() => setItems((cur) => cur.filter((c) => c.key !== it.key))}
        >
          <span className="emoji">{it.emoji}</span>
          <span className="tag" style={{ background: it.color }}>{it.nickname}</span>
        </motion.div>
      ))}
    </div>
  );
}
