import { type ReactNode, useMemo, useState } from "react";
import type { EventListItem } from "@gioco/shared";
import { ACTIVITIES, ACTIVITY_BADGE, ACTIVITY_LABEL, type Activity, activityOf, countByActivity, groupEvents } from "./eventList";

/**
 * Elenco delle serate da cercare e filtrare: ricerca per nome della serata o della partita, pulsanti per tipo
 * (in corso, attive, bozze, chiuse) con il conto, serate raggruppate dalle più vive alle chiuse. `actions` e `body`
 * dicono cosa fare con ogni serata (aprirla, avviarne una partita…).
 */
export function EventBrowser({
  events,
  actions,
  body,
  emptyText = "Nessuna serata ancora.",
}: {
  events: EventListItem[];
  actions?: (event: EventListItem) => ReactNode;
  body?: (event: EventListItem) => ReactNode;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<Activity | "all">("all");

  const counts = useMemo(() => countByActivity(events, query), [events, query]);
  const groups = useMemo(() => groupEvents(events, query, only), [events, query, only]);
  const total = ACTIVITIES.reduce((n, a) => n + counts[a], 0);

  return (
    <div className="event-browser">
      <input
        type="search"
        className="event-search"
        aria-label="Cerca una serata o una partita"
        placeholder="Cerca una serata o una partita…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="chips filters" role="group" aria-label="Tipo di serata">
        <button type="button" className={`chip-btn${only === "all" ? " on" : ""}`} aria-pressed={only === "all"} onClick={() => setOnly("all")}>
          Tutte <small>{total}</small>
        </button>
        {ACTIVITIES.map((a) => (
          <button
            key={a}
            type="button"
            className={`chip-btn ${a}${only === a ? " on" : ""}`}
            aria-pressed={only === a}
            disabled={counts[a] === 0 && only !== a}
            onClick={() => setOnly(only === a ? "all" : a)}
          >
            {ACTIVITY_LABEL[a]} <small>{counts[a]}</small>
          </button>
        ))}
      </div>

      {groups.map((g) => {
        const list = (
          <ul className="list event-list">
            {g.events.map((ev) => (
              <li key={ev.id} className={`event-card ${g.activity}`}>
                <div className="event-head">
                  <span className="event-title">
                    <strong>{ev.name}</strong> <span className={`badge ${activityOf(ev)}`}>{ACTIVITY_BADGE[activityOf(ev)]}</span>
                    <small className="muted"> · {ev.matches.length === 1 ? "1 partita" : `${ev.matches.length} partite`} · {ev.playerCount === 1 ? "1 giocatore" : `${ev.playerCount} giocatori`}</small>
                  </span>
                  {actions?.(ev)}
                </div>
                {body?.(ev)}
              </li>
            ))}
          </ul>
        );
        // Le serate chiuse sono tante e di rado servono: restano ripiegate finché non si cerca o non si sceglie il filtro.
        return g.activity === "closed" && only === "all" && query.trim() === "" ? (
          <details key={g.activity} className="event-group">
            <summary>{g.label} ({g.events.length})</summary>
            {list}
          </details>
        ) : (
          <section key={g.activity} className="event-group">
            {(only === "all" || query.trim() !== "") && <h4>{g.label} ({g.events.length})</h4>}
            {list}
          </section>
        );
      })}

      {groups.length === 0 && <p className="muted">{events.length === 0 ? emptyText : "Nessuna serata corrisponde alla ricerca."}</p>}
    </div>
  );
}
