import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { ClientEvent, ClockSync, makeSample } from "@gioco/shared";

const SYNC_EVERY_MS = 5000;

/**
 * Misura RTT e offset dell'orologio rispetto al server (ping/pong in stile NTP)
 * e comunica l'RTT al server. Parte solo quando `active` è true (profilo agganciato).
 */
export function useClockSync(socket: Socket, active: boolean): React.RefObject<ClockSync> {
  const clock = useRef(new ClockSync());

  useEffect(() => {
    if (!active) return;
    let stopped = false;

    const sample = () => {
      if (!socket.connected) return;
      const sentAt = Date.now();
      socket.timeout(4000).emit(ClientEvent.TimeSync, {}, (err: unknown, serverNow: number) => {
        if (err || stopped) return;
        clock.current.add(makeSample(sentAt, serverNow, Date.now()));
        const rtt = clock.current.rtt;
        if (rtt !== null) socket.emit(ClientEvent.RttReport, { rtt });
      });
    };

    // Raffica iniziale per una stima subito decente, poi campionamento periodico.
    const burst = [0, 200, 400].map((d) => setTimeout(sample, d));
    const id = setInterval(sample, SYNC_EVERY_MS);
    const onVisible = () => document.visibilityState === "visible" && sample();
    document.addEventListener("visibilitychange", onVisible);
    socket.on("connect", sample);

    return () => {
      stopped = true;
      burst.forEach(clearTimeout);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      socket.off("connect", sample);
    };
  }, [socket, active]);

  return clock;
}
