import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSfx } from "../../audio/useAudio";
import { useRemaining } from "../Countdown";
import { clockText } from "../parole-mannare/tokens";
import type { ControllerProps, ViewProps } from "../types";
import { LaneMap, useServerNow } from "./LaneMap";
import { LAYER_NAME, rulesSections } from "./rulesText";
import type { Me, PhoneView, PublicLane, PublicView, Result } from "./types";
import "./pilota.css";

const ordinal = (n: number) => `${n}°`;

const teamStyle = (color: string): CSSProperties => ({ ["--pc-team" as string]: color });

/** Il tempo del livello: alla presentazione il conto alla rovescia del via, poi quello che resta; in pausa si ferma. */
function Timer({ v, clock }: { v: Pick<PublicView, "phase" | "phaseEndsAt" | "pausedRemainingMs">; clock: ViewProps["clock"] }) {
  const left = useRemaining(v.phaseEndsAt ?? 0, clock);
  if (v.pausedRemainingMs !== null) return <span className="pc-timer" data-paused="true">⏸ {clockText(v.pausedRemainingMs)}</span>;
  if (v.phaseEndsAt === null || (v.phase !== "ready" && v.phase !== "run")) return null;
  return (
    <span className="pc-timer" data-testid="pc-timer">
      {v.phase === "ready" ? "Via tra " : "⏱ "}
      {v.phase === "ready" ? Math.ceil(left / 1000) : clockText(left)}
    </span>
  );
}

const laneOf = (v: PublicView, teamId: string | null): PublicLane | undefined => v.lanes.find((l) => l.teamId === teamId);
const frozenSeconds = (lane: PublicLane, nowMs: number) => Math.max(0, Math.ceil((lane.frozenUntil - nowMs) / 1000));

// ---- Schermo condiviso ----

function LaneCard({ lane, v, nowMs, elapsedMs }: { lane: PublicLane; v: PublicView; nowMs: number; elapsedMs: number }) {
  const frozen = frozenSeconds(lane, nowMs);
  return (
    <section className="pc-lane" data-testid="pc-lane" data-team={lane.teamId} data-finished={lane.finishedAt !== null || undefined} style={teamStyle(lane.teamColor)}>
      <h3>
        {lane.teamName} <small>🧭 {lane.pilot.nickname}</small>
      </h3>
      <LaneMap lane={lane} reveal={lane.reveal} elapsedMs={elapsedMs} nowMs={nowMs} compact />
      <footer>
        <span data-testid="pc-keys">🔑 {lane.keys.taken}/{lane.keys.total}</span>
        <span data-testid="pc-strikes">✖ {lane.strikes}</span>
        {lane.rank !== null ? <b data-testid="pc-rank">🏁 {ordinal(lane.rank)}</b> : v.phase === "run" && frozen > 0 ? <b data-testid="pc-frozen">⏸ fermo {frozen} s</b> : null}
      </footer>
    </section>
  );
}

function ResultsTable({ v, results }: { v: PublicView; results: Result[] }) {
  const name = (id: string) => v.teams.find((t) => t.id === id)?.name ?? id;
  const rows = [...results].sort((a, b) => Number(b.finished) - Number(a.finished) || (a.elapsedMs ?? 1e12) - (b.elapsedMs ?? 1e12) || b.progress - a.progress);
  return (
    <table className="pc-results" data-testid="pc-results">
      <tbody>
        {rows.map((r) => (
          <tr key={r.teamId} data-finished={r.finished || undefined}>
            <th>{name(r.teamId)}</th>
            <td>{r.finished ? `🏁 ${clockText(r.elapsedMs ?? 0)}` : `${Math.round(r.progress * 100)}% della strada`}</td>
            <td>✖ {r.strikes}</td>
            <td>{r.points === null ? "…" : `+${r.points}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Standings({ v }: { v: PublicView }) {
  const rows = v.teams.map((t) => ({ t, points: v.board[t.id] ?? 0 })).sort((a, b) => b.points - a.points);
  return (
    <div className="pc-final" data-testid="pc-final">
      <h2 className="question">Classifica del round</h2>
      <ol>
        {rows.map(({ t, points }) => (
          <li key={t.id} style={teamStyle(t.color)}>
            <b>{t.name}</b>
            <span>{points} punti</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Suoni: errore, chiave, arrivo e fine gara. */
function useRaceSounds(v: PublicView, theme: ViewProps["theme"]) {
  const sfx = useSfx(theme);
  const strikes = v.lanes.reduce((n, l) => n + l.strikes, 0);
  const keys = v.lanes.reduce((n, l) => n + l.keys.taken, 0);
  const done = v.lanes.filter((l) => l.finishedAt !== null).length;
  const prev = useRef({ strikes, keys, done, phase: v.phase });
  useEffect(() => {
    const p = prev.current;
    if (v.phase === p.phase) {
      if (strikes > p.strikes) sfx("wrong");
      else if (done > p.done) sfx("fanfare");
      else if (keys > p.keys) sfx("correct");
    } else if (v.phase === "run") sfx("start");
    else if (v.phase === "level-end" || v.phase === "final") sfx("reveal");
    prev.current = { strikes, keys, done, phase: v.phase };
  }, [v.phase, strikes, keys, done, sfx]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function PilotaScreen({ view, clock, theme }: ViewProps) {
  const v = view as PublicView;
  const nowMs = useServerNow(clock);
  useRaceSounds(v, theme);
  const elapsedMs = v.levelStartedAt === null ? 0 : nowMs - v.levelStartedAt;

  if (v.phase === "final" || v.phase === "done") {
    return (
      <div className="pc-screen" data-phase={v.phase}>
        <Standings v={v} />
      </div>
    );
  }
  return (
    <div className="pc-screen" data-phase={v.phase} data-lanes={v.lanes.length} data-paused={v.pausedRemainingMs !== null || undefined}>
      <div className="pc-topbar">
        <span className="pc-level" data-testid="pc-level">
          Livello {v.level}/{v.settings.levels}
          {v.units > 1 && ` · gara ${v.unit + 1}/${v.units}`}
        </span>
        <Timer v={v} clock={clock} />
      </div>
      {v.phase === "ready" && (
        <p className="big" data-testid="pc-ready">
          {v.lanes.length === 1 ? `Tocca alla squadra ${v.lanes[0]!.teamName}` : "Pronti: i piloti guardano la TV, i navigatori il telefono"}
        </p>
      )}
      <div className="pc-lanes" style={{ ["--n" as string]: v.lanes.length } as CSSProperties}>
        {v.lanes.map((l) => (
          <LaneCard key={l.teamId} lane={l} v={v} nowMs={nowMs} elapsedMs={elapsedMs} />
        ))}
      </div>
      {v.phase === "level-end" && <ResultsTable v={v} results={v.results} />}
    </div>
  );
}

// ---- Telefono ----

function RulesDialog({ v, me, onClose }: { v: PhoneView; me: Me; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco" data-testid="pc-rules-dialog">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(me.role, v.settings, me.role === "navigator" ? me.layers : []).map((s) => (
          <section key={s.title} className={s.title === "Per te" ? "gf-rules-mine" : undefined}>
            <h3>{s.title}</h3>
            {s.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        ))}
      </div>
      <button className="primary gf-rules-close" onClick={onClose}>
        Ho capito
      </button>
    </div>
  );
}

const ARROWS = [
  { dir: "up", icon: "↑", label: "Su", area: "up" },
  { dir: "left", icon: "←", label: "Sinistra", area: "left" },
  { dir: "right", icon: "→", label: "Destra", area: "right" },
  { dir: "down", icon: "↓", label: "Giù", area: "down" },
] as const;

/**
 * La croce del pilota. Conta la rapidità: l'invio parte alla pressione (`onPointerDown`) e, tenendo premuto, si ripete a ogni
 * pausa tra due passi. `touch-action: none` evita scorrimenti e zoom, e il puntatore catturato non perde il dito.
 */
function Pad({ send, stepMs, disabled }: { send: ControllerProps["send"]; stepMs: number; disabled: boolean }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const press = (dir: string, e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // evento sintetico: il rilascio arriva comunque da pointerup/pointercancel
    }
    stop();
    send({ type: "move", dir });
    timer.current = setInterval(() => send({ type: "move", dir }), stepMs + 20);
  };
  return (
    <div className="pc-dpad" data-testid="pc-dpad">
      {ARROWS.map((a) => (
        <button key={a.dir} style={{ gridArea: a.area }} data-testid={`pc-move-${a.dir}`} aria-label={a.label} disabled={disabled} onPointerDown={(e) => press(a.dir, e)} onPointerUp={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}>
          {a.icon}
        </button>
      ))}
    </div>
  );
}

export function PilotaController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const me = v.me;
  const sfx = useSfx(theme);
  const nowMs = useServerNow(clock);
  const [rules, setRules] = useState(false);
  const [hidden, setHidden] = useState(false);
  useRaceSounds(v, theme);

  const lane = laneOf(v, me?.role === "pilot" || me?.role === "navigator" ? me.teamId : null);
  useEffect(() => {
    if (me?.role === "pilot" && v.phase === "ready") sfx("notify");
  }, [me?.role, v.phase, v.level, sfx]);

  if (!me) return <p className="big">Non sei in questa partita.</p>;
  if (v.phase === "final" || v.phase === "done") {
    return (
      <div className="pc-ctrl" data-phase={v.phase}>
        <Standings v={v} />
      </div>
    );
  }
  const elapsedMs = v.levelStartedAt === null ? 0 : nowMs - v.levelStartedAt;
  const roleName = me.role === "pilot" ? "Pilota" : me.role === "navigator" ? "Navigatore" : "Spettatore";
  const mine = v.results.find((r) => r.teamId === me.teamId);

  let body;
  if (v.phase === "level-end") {
    body = (
      <>
        {mine ? (
          <p className="big" data-testid="pc-my-result">
            {mine.finished ? `Arrivati in ${clockText(mine.elapsedMs ?? 0)}!` : `Strada fatta: ${Math.round(mine.progress * 100)}%`}
            {mine.points !== null && ` · +${mine.points} punti`}
          </p>
        ) : (
          <p className="big">Gara finita</p>
        )}
        <p className="muted">Aspetta il livello successivo…</p>
      </>
    );
  } else if (me.role === "pilot" && lane) {
    const frozen = v.phase === "run" ? frozenSeconds(lane, nowMs) : 0;
    body = (
      <>
        <p className="pc-status" data-testid="pc-status">
          {v.phase === "ready" ? "Sei il pilota! Guarda la TV: i pericoli te li dicono i navigatori." : lane.finishedAt !== null ? "🏁 Sei arrivato!" : frozen > 0 ? `⏸ Fermo ${frozen} s` : "Via! Muovi la pedina."}
        </p>
        <p className="pc-stats">
          <span>🔑 {lane.keys.taken}/{lane.keys.total}</span> <span>✖ {lane.strikes}</span>
        </p>
        <Pad send={send} stepMs={v.settings.stepMs} disabled={v.phase !== "run" || frozen > 0 || lane.finishedAt !== null} />
      </>
    );
  } else if (me.role === "navigator" && lane) {
    body = (
      <>
        <p className="pc-legend" data-testid="pc-legend">
          {me.layers.length > 0 ? <>Tu vedi: <b>{me.layers.map((l) => LAYER_NAME[l]).join(" · ")}</b></> : "Nessuno strato per te in questo livello"}
        </p>
        <LaneMap lane={lane} layers={me.layerData} elapsedMs={elapsedMs} nowMs={nowMs} hidden={hidden} />
        <p className="pc-stats">
          <span>🔑 {lane.keys.taken}/{lane.keys.total}</span> <span>✖ {lane.strikes}</span>
          {lane.finishedAt !== null && <b> 🏁 arrivati!</b>}
        </p>
      </>
    );
  } else {
    body = (
      <p className="pc-status" data-testid="pc-status">
        {v.lanes.length > 0 ? "Non corre la tua squadra in questa gara: guarda la TV e fai il tifo." : "Aspetta…"}
      </p>
    );
  }

  return (
    <div className="pc-ctrl" data-phase={v.phase} data-role={me.role} style={teamStyle(lane?.teamColor ?? "var(--accent)")}>
      <div className="pc-head">
        <span className="pc-me">
          {lane && <b className="pc-tag">{lane.teamName}</b>} {roleName}
        </span>
        <Timer v={v} clock={clock} />
        {me.role === "navigator" && (
          <button className="pc-hide" data-testid="pc-hide" aria-pressed={hidden} onClick={() => setHidden((h) => !h)}>
            {hidden ? "👁 Mostra" : "🙈 Nascondi"}
          </button>
        )}
        <button className="gf-info" data-testid="pc-rules" onClick={() => setRules(true)} aria-label="Regole">
          ℹ️
        </button>
      </div>
      {body}
      {rules && <RulesDialog v={v} me={me} onClose={() => setRules(false)} />}
    </div>
  );
}
