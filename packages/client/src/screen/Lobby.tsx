import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { type LobbyView, ServerEvent } from "@gioco/shared";

function pingClass(ms: number | null): string {
  if (ms === null) return "";
  return ms < 100 ? "good" : ms < 250 ? "mid" : "bad";
}

export function Lobby({ socket }: { socket: Socket }) {
  const [lobby, setLobby] = useState<LobbyView>({ players: [] });

  // Il server invia lo stato completo ad ogni (ri)connessione, quindi nessuna risincronizzazione manuale.
  useEffect(() => {
    socket.on(ServerEvent.LobbyUpdate, setLobby);
    return () => void socket.off(ServerEvent.LobbyUpdate, setLobby);
  }, [socket]);

  const online = lobby.players.filter((p) => p.connected).length;

  return (
    <section className="lobby">
      <h2>In lobby: {online}</h2>
      <ul>
        {lobby.players.map((p) => (
          <li key={p.id} className={p.connected ? "" : "offline"} style={{ borderColor: p.color }}>
            <span className="emoji">{p.avatar}</span>
            <span className="name">{p.nickname}</span>
            <span className={`ping ${pingClass(p.rttMs)}`}>
              {p.connected && p.rttMs !== null ? `${p.rttMs} ms` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
