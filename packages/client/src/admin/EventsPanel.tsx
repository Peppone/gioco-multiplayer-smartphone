import { useCallback, useEffect, useState } from "react";
import type { EventStatus, EventSummary } from "@gioco/shared";
import { EventEditor } from "./EventEditor";
import { api, errorMessage } from "./api";

export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Bozza",
  live: "In corso",
  closed: "Chiusa",
};

export function EventsPanel({ onAuthLost }: { onAuthLost: () => void }) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await api<EventSummary[]>("GET", "/events"));
    } catch (e) {
      setError(errorMessage(e));
      onAuthLost();
    }
  }, [onAuthLost]);

  useEffect(() => void load(), [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const ev = await api<EventSummary>("POST", "/events", { name });
      setName("");
      await load();
      setSelected(ev.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (selected) {
    return (
      <EventEditor
        eventId={selected}
        onBack={() => { setSelected(null); void load(); }}
        onAuthLost={onAuthLost}
      />
    );
  }

  return (
    <section className="panel">
      <h2>Serate</h2>
      <form className="row" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome serata" maxLength={60} required />
        <button className="primary" type="submit">Crea serata</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {events.map((ev) => (
          <li key={ev.id}>
            <span>{ev.name} <small className="muted">· {STATUS_LABEL[ev.status]}</small></span>
            <button onClick={() => setSelected(ev.id)}>Apri</button>
          </li>
        ))}
        {events.length === 0 && <li className="muted">Nessuna serata ancora.</li>}
      </ul>
    </section>
  );
}
