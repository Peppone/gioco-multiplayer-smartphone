import { useEffect, useRef, useState } from "react";
import type { ClockSync } from "@gioco/shared";

/** Millisecondi rimasti alla scadenza (espressa in ora server), aggiornati ogni 100 ms. */
export function useRemaining(deadline: number, clock: ClockSync): number {
  const calc = () => Math.max(0, deadline - clock.toServerTime(Date.now()));
  const [remaining, setRemaining] = useState(calc);
  useEffect(() => {
    setRemaining(calc());
    const id = setInterval(() => setRemaining(calc()), 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, clock]);
  return remaining;
}

interface CountdownProps {
  openedAt: number;
  deadline: number;
  clock: ClockSync;
  /** Chiamata una volta per ciascuno degli ultimi 5 secondi (per il tic sonoro). */
  onTick?: () => void;
}

export function Countdown({ openedAt, deadline, clock, onTick }: CountdownProps) {
  const remaining = useRemaining(deadline, clock);
  const total = Math.max(1, deadline - openedAt);
  const seconds = Math.ceil(remaining / 1000);
  const lastSecond = useRef<number | null>(null);

  useEffect(() => {
    if (onTick && seconds > 0 && seconds <= 5 && lastSecond.current !== seconds) onTick();
    lastSecond.current = seconds;
  }, [seconds, onTick]);

  return (
    <div className="countdown">
      <div className="bar">
        <div style={{ width: `${Math.min(100, (remaining / total) * 100)}%` }} />
      </div>
      <span>{seconds}s</span>
    </div>
  );
}
