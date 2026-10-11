import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { ClientEvent, type GameAdminState, type HostAck, type HostCommand, ServerEvent } from "@gioco/shared";
import { getAdminToken } from "./api";

/** Socket autenticato della regia: riceve lo stato completo (anche i segreti) e invia i comandi. */
export function useAdminGame() {
  const socket = useMemo(() => io({ auth: { role: "admin", token: getAdminToken() }, autoConnect: false }), []);
  const [state, setState] = useState<GameAdminState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on("connect", up);
    socket.on("disconnect", down);
    socket.on(ServerEvent.GameAdmin, setState);
    socket.connect();
    return () => {
      socket.off("connect", up);
      socket.off("disconnect", down);
      socket.off(ServerEvent.GameAdmin, setState);
      socket.disconnect();
    };
  }, [socket]);

  const command = useCallback(
    (cmd: HostCommand | { type: "plugin"; command: Record<string, unknown> }) =>
      new Promise<HostAck>((resolve) => {
        socket.timeout(5000).emit(ClientEvent.HostCommand, cmd, (err: unknown, ack: HostAck) =>
          resolve(err ? { ok: false, error: "Il server non risponde." } : ack),
        );
      }),
    [socket],
  );

  return { state, connected, command };
}
