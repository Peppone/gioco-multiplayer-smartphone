import { useEffect, useState } from "react";
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

export function Countdown({ openedAt, deadline, clock }: { openedAt: number; deadline: number; clock: ClockSync }) {
  const remaining = useRemaining(deadline, clock);
  const total = Math.max(1, deadline - openedAt);
  return (
    <div className="countdown">
      <div className="bar">
        <div style={{ width: `${Math.min(100, (remaining / total) * 100)}%` }} />
      </div>
      <span>{Math.ceil(remaining / 1000)}s</span>
    </div>
  );
}
