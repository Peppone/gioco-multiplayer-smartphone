import { useCallback, useEffect, useState } from "react";
import type { AdminPlayerView, EventDetail, EventStatus, InstanceView, TeamView } from "@gioco/shared";
import { STATUS_LABEL } from "./EventsPanel";
import { api, errorMessage } from "./api";
import { moveItem } from "./schema-form/logic";

export function EventEditor({
  eventId,
  onBack,
  onAuthLost,
}: {
  eventId: string;
  onBack: () => void;
  onAuthLost: () => void;
}) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [players, setPlayers] = useState<AdminPlayerView[]>([]);
  const [instances, setInstances] = useState<InstanceView[]>([]);
  const [matchName, setMatchName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ev, t, p, inst] = await Promise.all([
        api<EventDetail>("GET", `/events/${eventId}`),
        api<TeamView[]>("GET", "/teams"),
        api<AdminPlayerView[]>("GET", "/players"),
        api<InstanceView[]>("GET", "/instances"),
      ]);
      setEvent(ev);
      setTeams(t);
      setPlayers(p);
      setInstances(inst);
    } catch (e) {
      setError(errorMessage(e));
      onAuthLost();
    }
  }, [eventId, onAuthLost]);

  useEffect(() => void load(), [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!event) return <section className="panel">{error ? <p className="error">{error}</p> : <p>Caricamento…</p>}</section>;

  const toggleTeam = (teamId: string) => {
    const teamIds = event.teamIds.includes(teamId)
      ? event.teamIds.filter((id) => id !== teamId)
      : [...event.teamIds, teamId];
    void run(() => api("PUT", `/events/${eventId}/teams`, { teamIds }));
  };

  const assignment = new Map(event.players.map((p) => [p.playerId, p.teamId]));
  const eventTeams = teams.filter((t) => event.teamIds.includes(t.id));

  const addMatch = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("POST", `/events/${eventId}/matches`, { name: matchName });
      setMatchName("");
    });
  };

  return (
    <section className="panel">
      <button className="link" onClick={onBack}>← Tutte le serate</button>
      <h2>{event.name}</h2>
      {error && <p className="error">{error}</p>}

      <div className="row">
        <label>
          Stato{" "}
          <select
            value={event.status}
            onChange={(e) => void run(() => api("PATCH", `/events/${eventId}`, { status: e.target.value as EventStatus }))}
          >
            {(Object.keys(STATUS_LABEL) as EventStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <button
          onClick={() => confirm("Eliminare la serata con partite e assegnazioni?") && void run(async () => { await api("DELETE", `/events/${eventId}`); onBack(); })}
        >
          Elimina serata
        </button>
      </div>

      <h3>Squadre della serata</h3>
      <div className="chips">
        {teams.map((t) => (
          <label key={t.id} className="chip" style={{ borderColor: t.color }}>
            <input type="checkbox" checked={event.teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
            {t.emblem} {t.name}
          </label>
        ))}
        {teams.length === 0 && <span className="muted">Crea prima delle squadre dalla scheda «Squadre».</span>}
      </div>

      <h3>Giocatori ({players.length} registrati)</h3>
      <ul className="list">
        {players.map((p) => {
          const inEvent = assignment.has(p.id);
          const teamId = assignment.get(p.id) ?? "";
          return (
            <li key={p.id}>
              <span>{p.avatar} {p.nickname}</span>
              <span className="row">
                <select
                  value={inEvent ? teamId : "__out"}
                  onChange={(e) => {
                    const v = e.target.value;
                    void run(() =>
                      v === "__out"
                        ? api("DELETE", `/events/${eventId}/players/${p.id}`)
                        : api("PUT", `/events/${eventId}/players/${p.id}`, { teamId: v === "" ? null : v }),
                    );
                  }}
                >
                  <option value="__out">Non in serata</option>
                  <option value="">In serata, senza team</option>
                  {eventTeams.map((t) => <option key={t.id} value={t.id}>{t.emblem} {t.name}</option>)}
                </select>
              </span>
            </li>
          );
        })}
        {players.length === 0 && <li className="muted">Nessun giocatore: si registrano dal telefono su /play.</li>}
      </ul>

      <h3>Partite</h3>
      <form className="row" onSubmit={addMatch}>
        <input value={matchName} onChange={(e) => setMatchName(e.target.value)} placeholder="Nome partita" maxLength={60} required />
        <button className="primary" type="submit">Aggiungi</button>
      </form>
      <ol className="list">
        {event.matches.map((m) => (
          <li key={m.id} className="match">
            <div className="row spread">
              <span>
                {m.order}. {m.name}{" "}
                <small className="muted">
                  · {m.status === "pending" ? "da giocare" : m.status === "running" ? "avviata" : "conclusa"}
                </small>
              </span>
              <button onClick={() => void run(() => api("DELETE", `/matches/${m.id}`))} disabled={m.status === "running"}>
                Elimina
              </button>
            </div>
            <ol className="rounds">
              {m.rounds.map((r, i) => {
                const ids = m.rounds.map((x) => x.id);
                const move = (delta: -1 | 1) =>
                  run(() => api("PUT", `/matches/${m.id}/rounds/order`, { roundIds: moveItem(ids, i, delta) }));
                const locked = m.status !== "pending";
                return (
                  <li key={r.id}>
                    <span>{r.order}. {r.title} <small className="muted">· {r.typeId}</small></span>
                    <span className="row">
                      <button disabled={locked || i === 0} onClick={() => void move(-1)} aria-label="Sposta su">↑</button>
                      <button disabled={locked || i === m.rounds.length - 1} onClick={() => void move(1)} aria-label="Sposta giù">↓</button>
                      <button disabled={locked} onClick={() => void run(() => api("DELETE", `/rounds/${r.id}`))} aria-label="Elimina">✕</button>
                    </span>
                  </li>
                );
              })}
              {m.rounds.length === 0 && <li className="muted">Nessun round: aggiungine uno dalla libreria.</li>}
            </ol>
            {m.status === "pending" && (
              <select
                value=""
                onChange={(e) => e.target.value && void run(() => api("POST", `/matches/${m.id}/rounds`, { instanceId: e.target.value }))}
              >
                <option value="">+ Aggiungi round dalla libreria…</option>
                {instances.filter((i) => i.typeId !== "deck" && i.typeId !== "word-list").map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
              </select>
            )}
          </li>
        ))}
        {event.matches.length === 0 && <li className="muted">Nessuna partita.</li>}
      </ol>
    </section>
  );
}
