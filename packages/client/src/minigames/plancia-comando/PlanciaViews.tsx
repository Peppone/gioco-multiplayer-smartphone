import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSfx } from "../../audio/useAudio";
import { useRemaining, useServerNow } from "../Countdown";
import { clockText } from "../parole-mannare/tokens";
import type { ControllerProps, ViewProps } from "../types";
import { rulesSections } from "./rulesText";
import type { EventInfo, PhoneControl, PhoneView, PublicView, ScreenCrew, ScreenView } from "./types";
import "./plancia.css";

/** Quanti passi per membro e per settore ci si aspetta da un equipaggio: serve solo a dimensionare la pista sulla TV. */
const STEPS_PER_SECTOR = 8;
/** L'ultimo ordine eseguito compare sulla TV con questo ritardo (non rivela l'ordine finché si sta ancora gridando). */
const LAST_DONE_DELAY_MS = 2000;

const teamStyle = (color: string): CSSProperties => ({ ["--pdc-team" as string]: color });

function Timer({ v, clock }: { v: Pick<PublicView, "phase" | "phaseEndsAt" | "pausedRemainingMs">; clock: ViewProps["clock"] }) {
  const left = useRemaining(v.phaseEndsAt ?? 0, clock);
  if (v.pausedRemainingMs !== null) return <span className="pdc-timer" data-paused="true">⏸ {clockText(v.pausedRemainingMs)}</span>;
  if (v.phaseEndsAt === null || (v.phase !== "sector" && v.phase !== "jump")) return null;
  return <span className="pdc-timer" data-testid="pdc-timer">{v.phase === "jump" ? "Salto " : "⏱ "}{clockText(left)}</span>;
}

function EventBanner({ event, clock, big }: { event: EventInfo; clock: ViewProps["clock"]; big?: boolean }) {
  const left = useRemaining(event.until, clock);
  return (
    <div className="pdc-event" data-testid="pdc-event" data-kind={event.kind} data-big={big || undefined} role="alert">
      {event.kind === "alarm" ? "🚨 ALLARME GENERALE!" : "🌑 BLACKOUT!"} <b>{Math.ceil(left / 1000)}</b>
    </div>
  );
}

// ---- Schermo condiviso ----

function Ship() {
  return (
    <svg className="pdc-ship-svg" viewBox="0 0 48 24" aria-hidden>
      <path className="pdc-flame" d="M6 12 L-4 6 L-2 12 L-4 18 Z" />
      <path className="pdc-hull-shape" d="M6 7 H30 L46 12 L30 17 H6 Z" />
      <circle className="pdc-window" cx="24" cy="12" r="3" />
      <path className="pdc-fin" d="M8 7 L2 1 H12 Z M8 17 L2 23 H12 Z" />
    </svg>
  );
}

/** L'ultimo ordine eseguito, con un po' di ritardo (e senza lampeggiare tra un ordine e l'altro). */
function useDelayedLast(lastDone: ScreenCrew["lastDone"], nowMs: number): string | null {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (lastDone && nowMs >= lastDone.at + LAST_DONE_DELAY_MS) setShown(lastDone.text);
  }, [lastDone, nowMs]);
  return shown;
}

function Lane({ crew, v, nowMs }: { crew: ScreenCrew; v: ScreenView; nowMs: number }) {
  const pct = Math.min(100, (crew.distance / (v.settings.sectors * STEPS_PER_SECTOR)) * 100);
  const last = useDelayedLast(crew.lastDone, nowMs);
  return (
    <section className="pdc-lane" data-testid="pdc-lane" data-team={crew.id} data-stopped={crew.stopped || undefined} data-event={crew.event?.kind} style={teamStyle(crew.color)}>
      <header>
        <b>{crew.name}</b> <small>{crew.members} 👥</small>
      </header>
      <div className="pdc-track">
        {Array.from({ length: v.settings.sectors + 1 }, (_, i) => (
          <i key={i} className="pdc-tick" style={{ left: `${(i / v.settings.sectors) * 100}%` }} data-passed={i <= v.sector - 1 || undefined} />
        ))}
        <div className="pdc-ship" data-testid="pdc-ship" style={{ ["--x" as string]: `${pct}%` }}>
          <Ship />
        </div>
      </div>
      <div className="pdc-stats">
        <span className="pdc-hull" role="meter" aria-label="Scafo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={crew.hull} data-low={crew.hull <= 30 || undefined}>
          <i style={{ width: `${crew.hull}%` }} />
          <small data-testid="pdc-hull">{crew.hull}%</small>
        </span>
        <span data-testid="pdc-done">✔ {crew.done}</span>
        <span data-testid="pdc-missed">✖ {crew.missed}</span>
        {crew.stopped && <b className="pdc-stopped">🛑 ferma</b>}
      </div>
      <p className="pdc-last" data-testid="pdc-last">{last ?? "…"}</p>
    </section>
  );
}

/** Suoni: ordine eseguito, danno, evento, salto, arrivo. */
function useCrewSounds(v: ScreenView, theme: ViewProps["theme"]) {
  const sfx = useSfx(theme);
  const done = v.crews.reduce((n, c) => n + c.done, 0);
  const missed = v.crews.reduce((n, c) => n + c.missed, 0);
  const event = v.crews.some((c) => c.event);
  const prev = useRef({ done, missed, event, phase: v.phase, sector: v.sector });
  useEffect(() => {
    const p = prev.current;
    if (v.phase === p.phase && v.sector === p.sector) {
      if (missed > p.missed) sfx("wrong", 0.5);
      else if (done > p.done) sfx("correct", 0.35);
      if (event && !p.event) sfx("notify");
    } else if (v.phase === "sector") sfx("start");
    else if (v.phase === "jump") sfx("reveal");
    else if (v.phase === "final") sfx("fanfare");
    prev.current = { done, missed, event, phase: v.phase, sector: v.sector };
  }, [v.phase, v.sector, done, missed, event, sfx]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function PlanciaScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenView;
  const nowMs = useServerNow(clock);
  useCrewSounds(v, theme);

  if (v.phase === "final" || v.phase === "done") {
    const rows = [...v.crews].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    return (
      <div className="pdc-screen" data-phase={v.phase}>
        <h2 className="question">Arrivo!</h2>
        <ol className="pdc-final" data-testid="pdc-final">
          {rows.map((c) => (
            <li key={c.id} style={teamStyle(c.color)}>
              <b>{c.rank}° {c.name}</b>
              <span>{c.distance} passi per membro · scafo {c.hull}%{c.stopped ? " · ferma" : ""}</span>
              <span>{c.points} punti</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  const event = v.crews.find((c) => c.event)?.event;
  return (
    <div className="pdc-screen" data-phase={v.phase} data-paused={v.pausedRemainingMs !== null || undefined}>
      <div className="pdc-topbar">
        <span className="pdc-sector" data-testid="pdc-sector">
          {v.phase === "ready" ? "Pronti al decollo" : `Settore ${Math.min(v.sector + (v.phase === "jump" ? 1 : 0), v.settings.sectors)}/${v.settings.sectors}`}
        </span>
        <Timer v={v} clock={clock} />
      </div>
      {v.phase === "jump" && <p className="big pdc-jump" data-testid="pdc-jump">🚀 Salto nel settore {v.sector + 1}: pannelli nuovi!</p>}
      {event && v.phase === "sector" && <EventBanner event={event} clock={clock} big />}
      <div className="pdc-lanes" data-count={v.crews.length}>
        {v.crews.map((c) => (
          <Lane key={c.id} crew={c} v={v} nowMs={nowMs} />
        ))}
      </div>
    </div>
  );
}

// ---- Telefono ----

function RulesDialog({ v, inactive, onClose }: { v: PhoneView; inactive: boolean; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco" data-testid="pdc-rules-dialog">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(v.settings, inactive).map((s) => (
          <section key={s.title} className={s.title === "Per te" ? "gf-rules-mine" : undefined}>
            <h3>{s.title}</h3>
            {s.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        ))}
      </div>
      <button className="primary gf-rules-close" onClick={onClose}>Ho capito</button>
    </div>
  );
}

type Send = ControllerProps["send"];

/** Pulsante: un tocco, subito (`onPointerDown`: conta la rapidità). */
function ButtonControl({ c, send, off }: { c: PhoneControl; send: Send; off: boolean }) {
  return (
    <button className="pdc-btn" data-testid="pdc-control" data-kind="button" disabled={off} onPointerDown={() => send({ type: "press", control: c.id })} onContextMenu={(e) => e.preventDefault()}>
      <span className="pdc-name">{c.name}</span>
    </button>
  );
}

function ToggleControl({ c, send, off }: { c: PhoneControl; send: Send; off: boolean }) {
  return (
    <button className="pdc-btn pdc-toggle" data-testid="pdc-control" data-kind="toggle" role="switch" aria-checked={c.value === 1} data-on={c.value === 1 || undefined} disabled={off} onPointerDown={() => send({ type: "set", control: c.id, value: 1 - c.value })} onContextMenu={(e) => e.preventDefault()}>
      <span className="pdc-name">{c.name}</span>
      <i className="pdc-switch" aria-hidden />
    </button>
  );
}

/** Cursore 0–5: il valore parte **solo al rilascio** (un trascinamento è un solo invio). */
function SliderControl({ c, send, off }: { c: PhoneControl; send: Send; off: boolean }) {
  const [local, setLocal] = useState(c.value);
  useEffect(() => setLocal(c.value), [c.value]);
  const commit = () => {
    if (local !== c.value) send({ type: "set", control: c.id, value: local });
  };
  return (
    <label className="pdc-slider" data-testid="pdc-control" data-kind="slider">
      <span className="pdc-name">{c.name}</span>
      <input type="range" min={0} max={5} step={1} value={local} disabled={off} aria-label={c.name} onChange={(e) => setLocal(Number(e.target.value))} onPointerUp={commit} onTouchEnd={commit} onKeyUp={commit} />
      <span className="pdc-scale" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <b key={n} data-on={n === local || undefined}>{n}</b>
        ))}
      </span>
    </label>
  );
}

function SelectorControl({ c, send, off }: { c: PhoneControl; send: Send; off: boolean }) {
  return (
    <div className="pdc-selector" data-testid="pdc-control" data-kind="selector" role="radiogroup" aria-label={c.name}>
      <span className="pdc-name">{c.name}</span>
      <span className="pdc-options">
        {c.options.map((o, i) => (
          <button key={o} role="radio" aria-checked={i === c.value} data-on={i === c.value || undefined} disabled={off} onPointerDown={() => i !== c.value && send({ type: "set", control: c.id, value: i })} onContextMenu={(e) => e.preventDefault()}>
            {o}
          </button>
        ))}
      </span>
    </div>
  );
}

function OrderCard({ order, clock }: { order: NonNullable<NonNullable<PhoneView["me"]>["order"]>; clock: ControllerProps["clock"] }) {
  const left = useRemaining(order.deadline, clock);
  const total = Math.max(1, order.deadline - order.issuedAt);
  const ratio = Math.min(1, left / total);
  return (
    <div className="pdc-order" data-testid="pdc-order" data-urgent={ratio < 0.3 || undefined}>
      <p data-testid="pdc-order-text">{order.text}</p>
      <div className="pdc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
        <i style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function PlanciaController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const me = v.me;
  const sfx = useSfx(theme);
  const [rules, setRules] = useState(false);
  const orderId = me?.order?.issuedAt ?? 0;
  const hull = v.crew?.hull ?? 100;
  const prev = useRef({ orderId, hull });

  // vibrazione (dove c'è) per un ordine nuovo e per i danni
  useEffect(() => {
    const p = prev.current;
    if (me?.order && orderId !== p.orderId) navigator.vibrate?.(40);
    if (hull < p.hull) navigator.vibrate?.([80, 40, 80]);
    prev.current = { orderId, hull };
  }, [orderId, hull, me?.order]);
  useEffect(() => {
    if (v.crew?.event?.kind === "alarm") sfx("notify");
  }, [v.crew?.event?.kind, sfx]);

  if (!me || !v.crew) return <p className="big">Non sei in questa partita.</p>;
  const off = v.phase !== "sector" || v.pausedRemainingMs !== null || v.crew.stopped || me.inactive;
  const event = v.crew.event;

  let body;
  if (v.phase === "final" || v.phase === "done") {
    body = (
      <p className="big" data-testid="pdc-result">
        {me.rank}° posto · {me.points} punti
      </p>
    );
  } else if (v.phase === "ready") {
    body = (
      <p className="pdc-status" data-testid="pdc-status">
        Pronti al decollo! Sei nell'equipaggio <b>{v.crew.name}</b>: leggi gli ordini ad alta voce e usa i tuoi comandi per eseguire quelli dei compagni.
      </p>
    );
  } else if (v.phase === "jump") {
    body = (
      <p className="pdc-status" data-testid="pdc-status">
        🚀 Salto nel settore {v.sector + 1}: pannelli nuovi in arrivo…
      </p>
    );
  } else if (me.inactive) {
    body = <p className="pdc-status" data-testid="pdc-status">Il tuo telefono è fuori uso per la regia: non hai comandi né ordini. Aiuta i compagni a voce!</p>;
  } else if (v.crew.stopped) {
    body = <p className="pdc-status" data-testid="pdc-status">🛑 L'astronave è ferma: lo scafo è a zero. Aspetta la fine del round.</p>;
  } else {
    body = (
      <>
        {me.order && <OrderCard order={me.order} clock={clock} />}
        {event?.kind === "alarm" && (
          <button className="pdc-alarm" data-testid="pdc-alarm" disabled={me.alarmPressed} onPointerDown={() => send({ type: "alarm" })}>
            {me.alarmPressed ? "✓ Allarme premuto" : "🚨 ALLARME!"}
          </button>
        )}
        <div className="pdc-panel" data-testid="pdc-panel" data-count={me.controls.length}>
          {me.controls.map((c) =>
            c.kind === "button" ? <ButtonControl key={c.id} c={c} send={send} off={off} /> : c.kind === "toggle" ? <ToggleControl key={c.id} c={c} send={send} off={off} /> : c.kind === "slider" ? <SliderControl key={c.id} c={c} send={send} off={off} /> : <SelectorControl key={c.id} c={c} send={send} off={off} />,
          )}
        </div>
      </>
    );
  }

  return (
    <div className="pdc-ctrl" data-phase={v.phase} data-event={event?.kind} data-paused={v.pausedRemainingMs !== null || undefined} style={teamStyle(v.crew.color)}>
      <div className="pdc-head">
        <span className="pdc-me">
          <b className="pdc-tag">{v.crew.name}</b> settore {Math.max(1, v.sector)}/{v.settings.sectors}
        </span>
        <span className="pdc-hullnum" data-testid="pdc-my-hull" data-low={hull <= 30 || undefined}>🛡 {hull}%</span>
        <Timer v={v} clock={clock} />
        <button className="gf-info" data-testid="pdc-rules" onClick={() => setRules(true)} aria-label="Regole">ℹ️</button>
      </div>
      {event?.kind === "blackout" && <EventBanner event={event} clock={clock} />}
      {body}
      {rules && <RulesDialog v={v} inactive={me.inactive} onClose={() => setRules(false)} />}
    </div>
  );
}
