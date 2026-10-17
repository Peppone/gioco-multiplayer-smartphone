import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { ClientEvent, type GameMasterState, type HostAck, ServerEvent } from "@gioco/shared";

/**
 * Socket del Game Master: riceve solo la vista del round in corso (se il plugin la prevede) e invia comandi
 * del plugin. `denied` diventa vero quando il server chiude l'accesso (link revocato, scaduto o partita finita).
 */
export function useMasterGame(token: string) {
  const socket = useMemo(() => io({ auth: { role: "master", token }, autoConnect: false }), [token]);
  const [state, setState] = useState<GameMasterState | null>(null);
  const [connected, setConnected] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const up = () => setConnected(true);
    const down = (reason: string) => {
      setConnected(false);
      // Chiusura decisa dal server: non si riprova con un token che non vale più.
      if (reason === "io server disconnect") setDenied(true);
    };
    socket.on("connect", up);
    socket.on("disconnect", down);
    socket.on(ServerEvent.GameMaster, setState);
    socket.connect();
    return () => {
      socket.off("connect", up);
      socket.off("disconnect", down);
      socket.off(ServerEvent.GameMaster, setState);
      socket.disconnect();
    };
  }, [socket]);

  const run = useCallback(
    (command: Record<string, unknown>) =>
      new Promise<HostAck>((resolve) => {
        socket.timeout(5000).emit(ClientEvent.MasterCommand, { type: "plugin", command }, (err: unknown, ack: HostAck) =>
          resolve(err ? { ok: false, error: "Il server non risponde." } : ack),
        );
      }),
    [socket],
  );

  return { socket, state, connected, denied, run };
}
