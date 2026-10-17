import { useEffect, useState } from "react";
import type { ArchivedMessage, EventSummary } from "@gioco/shared";
import { api, errorMessage } from "./api";

const time = (ts: number) => new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function who(m: ArchivedMessage): string {
  const from = m.fromKind === "master" ? "Master" : (m.fromNickname ?? "?");
  if (m.kind === "event") return `Evento · ${m.toKind === "all" ? "tutti" : `${m.recipients.length} giocatori`}`;
  const to =
    m.toKind === "master" ? "Master" : m.toKind === "player" ? (m.toNickname ?? "?") : m.toKind === "room" ? `Stanza ${(m.toCell ?? 0) + 1}` : "tutti";
  return `${from} → ${to}`;
}

/** Archivio di sola lettura dei messaggi ed eventi dei round con Game Master, per serata. */
export function MessagesPanel({ onAuthLost }: { onAuthLost: () => void }) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [eventId, setEventId] = useState("");
  const [rows, setRows] = useState<ArchivedMessage[]>([]);
  const [filter, setFilter] = useState<"all" | "message" | "event">("all");
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    const msg = errorMessage(e);
    if (msg.startsWith("Sessione scaduta")) onAuthLost();
    setError(msg);
  };

  useEffect(() => {
    api<EventSummary[]>("GET", "/events").then(setEvents, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setError(null);
    if (!eventId) return setRows([]);
    api<ArchivedMessage[]>("GET", `/events/${eventId}/messages`).then(setRows, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const shown = rows.filter((r) => filter === "all" || r.kind === filter);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "messaggi-ed-eventi.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const remove = async () => {
    if (!confirm("Eliminare tutti i messaggi e gli eventi di questa serata? Non si può annullare.")) return;
    try {
      await api("DELETE", `/events/${eventId}/messages`);
      setRows([]);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section className="panel messages-panel">
      <h2>Messaggi ed eventi</h2>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Serata">
          <option value="">Scegli la serata…</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filtro">
          <option value="all">Messaggi ed eventi</option>
          <option value="message">Solo messaggi</option>
          <option value="event">Solo eventi</option>
        </select>
        <button onClick={exportJson} disabled={rows.length === 0}>Esporta JSON</button>
        <button className="danger" onClick={() => void remove()} disabled={rows.length === 0}>Elimina messaggi ed eventi di questa serata</button>
      </div>
      {eventId && shown.length === 0 && <p className="muted">Nessun messaggio.</p>}
      <ul className="list msg-archive">
        {shown.map((m) => (
          <li key={`${m.roundId}-${m.messageId}`} className={m.kind}>
            <div>
              <small className="muted">{time(m.ts)} · {m.matchName} · {m.roundTitle}</small>
              <div><b>{who(m)}</b>{m.cancelled && " (annullato)"}</div>
              <div>{m.text}</div>
              {m.kind === "event" && (
                <small className="muted">
                  Accettato da {m.recipients.filter((r) => r.acceptedAt !== null).length} di {m.recipients.length}:{" "}
                  {m.recipients.map((r) => `${r.nickname}${r.acceptedAt !== null ? ` (${time(r.acceptedAt)})` : " (no)"}`).join(", ")}
                </small>
              )}
              {m.kind === "message" && m.readAt !== null && <small className="muted">Letto alle {time(m.readAt)}</small>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
