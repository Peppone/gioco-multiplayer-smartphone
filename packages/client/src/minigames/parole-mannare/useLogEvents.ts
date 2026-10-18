import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "./types";

export interface LogEvent {
  /** Cambia a ogni evento: serve da `key` per ripetere le animazioni. */
  id: number;
  kind: "given" | "undone";
  entry: LogEntry;
}

/**
 * Trasforma il registro dei gettoni in eventi: un `seq` nuovo è un gettone assegnato, una voce che diventa annullata
 * è un annullamento. Dopo la prima vista (o una riconnessione) le voci già presenti non generano avvisi.
 * L'evento resta per `ttl` ms; uno nuovo sostituisce il precedente.
 */
export function useLogEvents(log: LogEntry[], ttl = 3000): LogEvent | null {
  const known = useRef<Map<number, boolean> | null>(null);
  const counter = useRef(0);
  const [event, setEvent] = useState<LogEvent | null>(null);

  useEffect(() => {
    if (known.current === null) {
      known.current = new Map(log.map((e) => [e.seq, e.undone]));
      return;
    }
    let latest: LogEvent | null = null;
    for (const entry of log) {
      const before = known.current.get(entry.seq);
      if (before === undefined) latest = { id: ++counter.current, kind: "given", entry };
      else if (!before && entry.undone) latest = { id: ++counter.current, kind: "undone", entry };
      known.current.set(entry.seq, entry.undone);
    }
    if (latest) setEvent(latest);
  }, [log]);

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => setEvent((e) => (e?.id === event.id ? null : e)), ttl);
    return () => clearTimeout(t);
  }, [event, ttl]);

  return event;
}
