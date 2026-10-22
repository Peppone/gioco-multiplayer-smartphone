import { useCallback, useEffect, useState } from "react";
import type { AdminPlayerView, EventDetail, TeamView, TempTeam, TempTeamsInput } from "@gioco/shared";
import { api, errorMessage } from "./api";
import { TempTeamsPanel } from "./TempTeamsPanel";

/** Chi è in serata e in quale squadra: ogni cambio vale subito, anche a partita avviata. */
export function EventRoster({
  eventId,
  event,
  teams,
  players,
  run,
}: {
  eventId: string;
  event: EventDetail;
  teams: TeamView[];
  players: AdminPlayerView[];
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const assignment = new Map(event.players.map((p) => [p.playerId, p.teamId]));
  const captains = new Set(event.players.filter((p) => p.captain).map((p) => p.playerId));
  const eventTeams = teams.filter((t) => event.teamIds.includes(t.id));

  return (
    <ul className="list">
      {players.map((p) => {
        const inEvent = assignment.has(p.id);
        const teamId = assignment.get(p.id) ?? "";
        const isCaptain = captains.has(p.id);
        return (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{isCaptain && " 👑"}</span>
            <span className="row">
              {inEvent && teamId !== "" && (
                <button
                  aria-pressed={isCaptain}
                  aria-label={`Capitano di ${p.nickname}`}
                  title={isCaptain ? "Capitano della squadra: tocca per togliere" : "Rendi capitano della squadra"}
                  className={isCaptain ? "primary" : ""}
                  onClick={() => void run(() => api("PUT", `/events/${eventId}/players/${p.id}/captain`, { captain: !isCaptain }))}
                >
                  👑
                </button>
              )}
              <select
                aria-label={`Squadra di ${p.nickname}`}
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
  );
}

/** Giocatori della serata in corso, dal pannello Live. Si rilegge quando cambia il numero di iscritti o la partita. */
export function LiveRoster({
  eventId,
  inRound,
  pending,
  tempTeams,
  onTempTeams,
}: {
  eventId: string;
  inRound: boolean;
  pending: boolean;
  /** Squadre temporanee attive (dallo stato della partita). */
  tempTeams?: TempTeam[];
  /** Imposta le squadre temporanee, o le toglie con `null`; risponde se la regia le ha accettate. */
  onTempTeams: (teams: TempTeamsInput | null) => Promise<boolean>;
}) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [players, setPlayers] = useState<AdminPlayerView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ev, t, p] = await Promise.all([
        api<EventDetail>("GET", `/events/${eventId}`),
        api<TeamView[]>("GET", "/teams"),
        api<AdminPlayerView[]>("GET", "/players"),
      ]);
      setEvent(ev);
      setTeams(t);
      setPlayers(p);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [eventId]);

  useEffect(() => void load(), [load]);
  // Chi si registra dal telefono durante la serata compare qui senza ricaricare la pagina.
  useEffect(() => {
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!event) return error ? <p className="error">{error}</p> : <p>Caricamento…</p>;

  const inEvent = new Set(event.players.map((p) => p.playerId));

  return (
    <>
    <section className="panel">
      <h3>Giocatori della serata ({event.players.length} in serata su {players.length} registrati)</h3>
      <p className="muted">
        Puoi aggiungere o togliere giocatori e cambiarli di squadra in ogni momento.
        {inRound
          ? ` C'è un round in corso: le modifiche valgono dal prossimo round${pending ? " (ce n'è già qualcuna in attesa)" : ""}.`
          : " Le modifiche valgono subito."}
      </p>
      {error && <p className="error">{error}</p>}
      <EventRoster eventId={eventId} event={event} teams={teams} players={players} run={run} />
    </section>
    <TempTeamsPanel people={players.filter((p) => inEvent.has(p.id))} temp={tempTeams} inRound={inRound} onApply={onTempTeams} />
    </>
  );
}
