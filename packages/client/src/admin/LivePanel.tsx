import { useEffect, useState } from "react";
import type { EventDetail, EventSummary, HostCommand } from "@gioco/shared";
import { Leaderboard } from "../ui/Leaderboard";
import { api, errorMessage } from "./api";
import { useAdminGame } from "./useAdminGame";

const PHASE_LABEL = {
  idle: "Nessuna partita",
  ready: "Pronta",
  round: "Round in corso",
  results: "Risultati del round",
  ended: "Conclusa",
} as const;

const INFO_LABEL: Record<string, string> = {
  phase: "Fase",
  index: "Domanda n.",
  total: "Domande totali",
  question: "Domanda",
  correct: "Risposta corretta",
  answer: "Risposta",
  answered: "Hanno risposto",
  playerCount: "Giocatori",
  points: "Punti in palio",
  answering: "Risponde",
  queue: "Coda",
};

function InfoView({ info }: { info: unknown }) {
  if (!info || typeof info !== "object") return null;
  return (
    <dl className="info">
      {Object.entries(info as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => (
          <div key={k}>
            <dt>{INFO_LABEL[k] ?? k}</dt>
            <dd>{k === "index" ? Number(v) + 1 : Array.isArray(v) ? v.join(" → ") : String(v)}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Scelta e avvio di una partita pronta. */
function StartPicker({ onStart }: { onStart: (matchId: string) => void }) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [eventId, setEventId] = useState("");
  const [detail, setDetail] = useState<EventDetail | null>(null);

  useEffect(() => {
    api<EventSummary[]>("GET", "/events").then(setEvents, () => undefined);
  }, []);
  useEffect(() => {
    if (!eventId) return setDetail(null);
    api<EventDetail>("GET", `/events/${eventId}`).then(setDetail, () => setDetail(null));
  }, [eventId]);

  return (
    <section className="panel">
      <h3>Avvia una partita</h3>
      <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
        <option value="">Scegli la serata…</option>
        {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
      </select>
      <ul className="list">
        {detail?.matches.map((m) => (
          <li key={m.id}>
            <span>
              {m.order}. {m.name} <small className="muted">· {m.mode === "classic" ? `${m.rounds.length} round` : "Duello dei Cavalieri"} · {m.status === "pending" ? "pronta" : m.status === "running" ? "avviata" : "conclusa"}</small>
            </span>
            <button className="primary" disabled={m.status !== "pending" || (m.mode === "classic" && m.rounds.length === 0)} onClick={() => onStart(m.id)}>
              Avvia
            </button>
          </li>
        ))}
        {detail && detail.matches.length === 0 && <li className="muted">Questa serata non ha partite.</li>}
      </ul>
    </section>
  );
}

export function LivePanel() {
  const { state, connected, command } = useAdminGame();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [points, setPoints] = useState("100");
  const [reason, setReason] = useState("");

  const run = async (cmd: HostCommand | { type: "plugin"; command: Record<string, unknown> }) => {
    setError(null);
    const ack = await command(cmd);
    if (!ack.ok) setError(ack.error);
  };

  const adjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const [kind, id] = target.split(":");
    await run({
      type: "adjust",
      playerId: kind === "p" ? id! : null,
      teamId: kind === "t" ? id! : null,
      points: Number(points),
      reason,
    });
    setReason("");
  };

  if (!state) return <section className="panel"><p>{connected ? "Caricamento…" : "Connessione alla regia…"}</p></section>;

  const active = state.phase !== "idle";

  return (
    <div className="live">
      {!connected && <p className="error">Connessione persa: riconnessione in corso…</p>}
      {error && <p className="error">{error}</p>}

      {(!active || state.phase === "ended") && (
        <StartPicker onStart={(matchId) => void run({ type: "start", matchId })} />
      )}

      {active && (
        <section className="panel">
          <h2>{state.matchName} <small className="muted">· {PHASE_LABEL[state.phase]}</small></h2>
          <p className="muted">Round {state.roundNumber} di {state.roundCount}{state.frame ? ` · ${state.frame.title}` : ""}</p>

          {state.host && (
            <>
              <InfoView info={state.host.info} />
              <div className="row">
                {state.host.actions.map((a) => (
                  <button
                    key={a.id}
                    disabled={!a.enabled}
                    className={a.danger ? "danger" : "primary"}
                    onClick={() => void run({ type: "plugin", command: { type: a.id } })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="row">
            {state.engineActions.map((a) => (
              <button
                key={a.id}
                disabled={!a.enabled}
                className={a.danger ? "danger" : "primary"}
                onClick={() => {
                  if (a.danger && !confirm(`${a.label}?`)) return;
                  void run({ type: "engine", action: a.id as "next" | "finish-round" | "end-match" | "close" });
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {active && state.leaderboards && (
        <section className="panel">
          <h3>Classifiche</h3>
          <Leaderboard data={state.leaderboards} />
          {state.phase !== "ended" && (
            <form className="row" onSubmit={adjust}>
              <select value={target} onChange={(e) => setTarget(e.target.value)} required>
                <option value="">Assegna punti a…</option>
                {state.leaderboards.teams.map((t) => <option key={t.id} value={`t:${t.id}`}>Squadra {t.name}</option>)}
                {state.leaderboards.players.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.avatar} {p.name}</option>)}
              </select>
              <input value={points} onChange={(e) => setPoints(e.target.value)} type="number" step="1" style={{ width: "6rem" }} required />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo" maxLength={80} required />
              <button type="submit">Assegna</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
