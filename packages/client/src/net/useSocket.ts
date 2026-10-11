import { useEffect, useMemo, useState } from "react";
import { type Socket, io } from "socket.io-client";
import type { Role } from "@gioco/shared";

/** Crea il socket del ruolo indicato; la riconnessione automatica è gestita da socket.io. */
export function useSocket(role: Role): { socket: Socket; connected: boolean } {
  const socket = useMemo(() => io({ auth: { role }, autoConnect: false }), [role]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on("connect", up);
    socket.on("disconnect", down);
    socket.connect();
    return () => {
      socket.off("connect", up);
      socket.off("disconnect", down);
      socket.disconnect();
    };
  }, [socket]);

  return { socket, connected };
}
