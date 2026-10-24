import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSfx } from "../../audio/useAudio";
import { useRemaining } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";
import { Board } from "./Board";
import { KINDS, KIND_ICON, KIND_NAME, SEEN, TOKENS, cap, centerAngle, clockText, cometSectors, edgeAngle, isVisible, labelName, labelText, polar, ring, surveyCost, tokensTotal } from "./names";
import { rulesSections } from "./rulesText";
import type { Action, Guess, Kind, Mark, PhoneView, PublicView, ScreenView, Seen, TeamView, Token } from "./types";
import "./pianeta.css";

const teamStyle = (color: string): CSSProperties => ({ ["--px-team" as string]: color });

const PHASE_TITLE: Record<PublicView["phase"], string> = {
  briefing: "Si comincia",
  turn: "Turno",
  resolve: "Azioni scelte",
  conference: "Conferenza",
  theory: "Fase teoria",
  review: "Revisione delle teorie",
  lastCall: "Ultima opportunità",
  finalGuess: "Ipotesi finale",
  reveal: "Rivelazione",
  final: "Punteggio",
  done: "Finito",
};

function Timer({ v, clock }: { v: Pick<PublicView, "phaseEndsAt" | "pausedRemainingMs">; clock: ViewProps["clock"] }) {
  const left = useRemaining(v.phaseEndsAt ?? 0, clock);
  if (v.pausedRemainingMs !== null) return <span className="px-timer" data-paused="true" data-testid="px-timer">⏸ {clockText(v.pausedRemainingMs)}</span>;
  if (v.phaseEndsAt === null) return null;
  return <span className="px-timer" data-testid="px-timer">⏱ {clockText(left)}</span>;
}

const obsName = (v: PublicView, id: string) => v.observatories.find((o) => o.id === id)?.name ?? "";

// ---- Schermo condiviso ----

function usePhaseSounds(v: PublicView, theme: ViewProps["theme"]) {
  const sfx = useSfx(theme);
  const prev = useRef({ phase: v.phase, confirmed: Object.keys(v.confirmed).length, log: v.publicLog.length });
  useEffect(() => {
    const p = prev.current;
    const confirmed = Object.keys(v.confirmed).length;
    if (v.phase !== p.phase) {
      if (v.phase === "turn") sfx("start", 0.5);
      else if (v.phase === "conference") sfx("notify");
      else if (v.phase === "theory" || v.phase === "lastCall" || v.phase === "finalGuess") sfx("start", 0.5);
      else if (v.phase === "reveal") sfx("reveal");
      else if (v.phase === "final") sfx("fanfare");
    } else if (confirmed > p.confirmed) sfx("correct");
    else if (v.publicLog.length > p.log && v.publicLog.at(-1)?.ok === false) sfx("wrong", 0.5);
    prev.current = { phase: v.phase, confirmed, log: v.publicLog.length };
  }, [v.phase, v.confirmed, v.publicLog, sfx]); // eslint-disable-line react-hooks/exhaustive-deps
}

function SidePanels({ v }: { v: PublicView }) {
  const recent = [...v.publicLog].reverse().slice(0, 9);
  return (
    <aside className="px-side">
      <section className="px-panel" data-testid="px-log">
        <h3>Cronaca</h3>
        <ol>
          {recent.map((e) => (
            <li key={e.id} data-ok={e.ok === undefined ? undefined : String(e.ok)}>
              <b style={e.obsId ? teamStyle(v.observatories.find((o) => o.id === e.obsId)?.color ?? "var(--fg)") : undefined} className={e.obsId ? "px-who" : undefined}>{obsName(v, e.obsId)}</b> {e.text} <small>({e.time})</small>
            </li>
          ))}
          {recent.length === 0 && <li className="muted">Ancora nulla.</li>}
        </ol>
      </section>
      <section className="px-panel" data-testid="px-topics">
        <h3>Argomenti</h3>
        <ul className="px-topics">
          {v.topics.map((t) => (
            <li key={t.id} data-read={t.readBy.length > 0 || undefined}>
              <b>{t.id}</b> <span title={labelName(t.label)}>{labelText(t.label)}</span>
              <small>{t.readBy.length > 0 ? ` letto da ${t.readBy.map((id) => obsName(v, id)).join(", ")}` : " —"}</small>
            </li>
          ))}
        </ul>
        {v.conferences.map((c) => (
          <p key={c.id} className="px-conf" data-testid="px-conference" data-held={c.held || undefined}>
            <b>{c.id}</b> <span>{labelText(c.label)}</span> {c.text ? <>«{c.text}»</> : <small>— non ancora</small>}
          </p>
        ))}
      </section>
    </aside>
  );
}

function PhaseBanner({ v, clock }: { v: ScreenView; clock: ViewProps["clock"] }) {
  const acting = v.actingIds.map((id) => obsName(v, id)).join(" e ");
  const conf = v.conferences.find((c) => c.id === v.conferenceNow);
  switch (v.phase) {
    case "briefing":
      return (
        <div className="px-banner" data-testid="px-banner">
          <h2 className="question">Il Pianeta Nascosto</h2>
          <p>Il Pianeta X si nasconde in un settore che agli strumenti sembra vuoto. Rilevate, puntate, leggete le ricerche e deducete dove sta. Chi è più indietro sul tracciato del tempo gioca per primo.</p>
        </div>
      );
    case "turn":
      return (
        <div className="px-banner" data-testid="px-banner">
          <h2 className="question">Tocca a {acting}</h2>
          <Timer v={v} clock={clock} />
        </div>
      );
    case "resolve":
      return <div className="px-banner" data-testid="px-banner"><h2 className="question">{PHASE_TITLE.resolve}</h2></div>;
    case "conference":
      return (
        <div className="px-banner px-conference-card" data-testid="px-banner">
          <h2 className="question">Conferenza {conf?.id}</h2>
          <p className="big" data-testid="px-conference-text">{conf?.text}</p>
        </div>
      );
    case "theory":
    case "lastCall":
    case "finalGuess":
      return (
        <div className="px-banner" data-testid="px-banner">
          <h2 className="question">{v.phase === "finalGuess" ? "Ipotesi finale: dov'è il Pianeta X?" : v.phase === "lastCall" ? `Ultima opportunità per ${v.lastCall?.map((id) => obsName(v, id)).join(" e ")}` : "Fase teoria: scegliete sui telefoni"}</h2>
          <Timer v={v} clock={clock} />
        </div>
      );
    case "review":
      return (
        <div className="px-banner" data-testid="px-banner">
          <h2 className="question">{PHASE_TITLE.review}</h2>
          <ul className="px-review" data-testid="px-review">
            {(v.review?.events ?? []).map((e, i) => (
              <li key={e.theoryId} data-correct={e.correct} style={{ animationDelay: `${i * 0.5}s` }}>
                {e.correct ? "✔" : "✖"} {obsName(v, e.ownerId)}: {KIND_ICON[e.object]} {KIND_NAME[e.object]} nel settore {e.sector}
                {!e.correct && " — avanza di 1"}
              </li>
            ))}
            {(v.review?.events ?? []).length === 0 && <li className="muted">Nessuna teoria da controllare.</li>}
          </ul>
        </div>
      );
    case "reveal": {
      const x = (v.sky ?? []).indexOf("planetX") + 1;
      return (
        <div className="px-banner" data-testid="px-banner">
          <h2 className="question">Il Pianeta X era nel settore {x}!</h2>
        </div>
      );
    }
    default:
      return null;
  }
}

function ScoreTable({ v }: { v: PublicView }) {
  const rows = [...(v.scores ?? [])].sort((a, b) => a.rank - b.rank);
  return (
    <table className="px-scores" data-testid="px-scores">
      <thead>
        <tr><th /><th>Squadra</th><th title="Priorità">1°</th>{TOKENS.map((t) => <th key={t}>{KIND_ICON[t]}</th>)}<th>✱ Pianeta X</th><th>Totale</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const o = v.observatories.find((x) => x.id === r.id);
          return (
            <tr key={r.id} data-testid="px-score-row" style={teamStyle(o?.color ?? "var(--fg)")}>
              <td>{r.rank}°</td>
              <td><b>{o?.name}</b>{o?.bot ? " 🤖" : ""}</td>
              <td>{r.breakdown.priority}</td>
              {TOKENS.map((t) => <td key={t}>{r.breakdown[t]}</td>)}
              <td>{r.breakdown.planetX}</td>
              <td><b>{r.breakdown.total * v.settings.pointScale}</b></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function PianetaScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenView;
  usePhaseSounds(v, theme);
  const sky = v.phase === "reveal" || v.phase === "final" || v.phase === "done" ? v.sky : undefined;
  const day = Math.min(...v.observatories.map((o) => o.time));
  return (
    <div className="px-screen" data-phase={v.phase} data-paused={v.pausedRemainingMs !== null || undefined} data-testid="px-screen">
      <div className="px-topbar">
        <span data-testid="px-day">Giorno {day}{v.settings.maxDays > 0 ? ` / ${v.settings.maxDays}` : ""}</span>
        <span className="px-phase" data-testid="px-phase">{PHASE_TITLE[v.phase]}</span>
        <span className="px-chips">
          {v.observatories.map((o) => (
            <i key={o.id} className="px-chip" data-acting={v.actingIds.includes(o.id) || undefined} style={teamStyle(o.color)}>{o.name}{o.bot ? " 🤖" : ""} · {o.time}</i>
          ))}
        </span>
      </div>
      <div className="px-main">
        <div className="px-boardbox"><Board v={v} sky={sky} /></div>
        <div className="px-right">
          <PhaseBanner v={v} clock={clock} />
          {(v.phase === "final" || v.phase === "done") && <ScoreTable v={v} />}
          <SidePanels v={v} />
        </div>
      </div>
    </div>
  );
}

// ---- Telefono ----

const markKey = (sector: number, kind: string) => `${sector}:${kind}`;
const nextMark = (m: Mark | undefined): Mark | null => (m === undefined ? "excluded" : m === "excluded" ? "supposed" : m === "supposed" ? "confirmed" : null);
const MARK_GLYPH: Record<Mark, string> = { excluded: "✗", supposed: "○", confirmed: "◉" };

function RulesDialog({ v, onClose }: { v: PublicView; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco" data-testid="px-rules-dialog">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(v.settings).map((s) => (
          <section key={s.title}>
            <h3>{s.title}</h3>
            {s.lines.map((line) => <p key={line}>{line}</p>)}
          </section>
        ))}
      </div>
      <button className="primary gf-rules-close" onClick={onClose}>Ho capito</button>
    </div>
  );
}

/** La ruota dei settori: panoramica del foglio. Il cielo visibile è evidenziato; un tocco sceglie il settore da modificare. */
function Wheel({ v, mine, selected, onSelect }: { v: PhoneView; mine: TeamView; selected: number; onSelect: (s: number) => void }) {
  const n = v.settings.sectors;
  const mark = (s: number, k: string) => mine.fixed[markKey(s, k)] ?? mine.notes[markKey(s, k)];
  return (
    <svg className="px-wheel" viewBox="0 0 400 400" role="group" aria-label="Ruota dei settori" data-testid="px-wheel">
      {Array.from({ length: n }, (_, i) => i + 1).map((s) => {
        const a1 = edgeAngle(s, n) + 0.8;
        const a2 = edgeAngle(s, n) + 360 / n - 0.8;
        const left = KINDS.filter((k) => mark(s, k) !== "excluded").length;
        const sure = KINDS.find((k) => mark(s, k) === "confirmed");
        const [x, y] = polar(sure || left <= 2 ? 150 : 158, centerAngle(s, n));
        const [nx, ny] = polar(185, centerAngle(s, n));
        const visible = isVisible(s, v.earthSector, n);
        return (
          <g key={s} className="px-wslice" data-testid="px-wslice" data-sector={s} data-visible={visible || undefined} data-selected={s === selected || undefined} data-confirmed={v.confirmed[s] ? "true" : undefined} role="button" tabIndex={0} aria-label={`Settore ${s}`} onClick={() => onSelect(s)} onKeyDown={(e) => e.key === "Enter" && onSelect(s)}>
            <path d={ring(70, 172, a1, a2)} />
            <text className="px-wnum" x={nx} y={ny} textAnchor="middle" dominantBaseline="central">{s}</text>
            <text className="px-wsum" x={x} y={y} textAnchor="middle" dominantBaseline="central">{sure ? KIND_ICON[sure] : left}</text>
          </g>
        );
      })}
      <circle className="px-sun" cx={200} cy={200} r={44} />
      <text className="px-sun-label" x={200} y={200} textAnchor="middle" dominantBaseline="central">☀</text>
    </svg>
  );
}

function SectorEditor({ v, mine, sector, send }: { v: PhoneView; mine: TeamView; sector: number; send: ControllerProps["send"] }) {
  const comets = cometSectors(v.settings).includes(sector);
  return (
    <section className="px-editor" data-testid="px-editor" data-sector={sector}>
      <h3>Settore {sector}{isVisible(sector, v.earthSector, v.settings.sectors) ? " · visibile" : ""}</h3>
      <div className="px-marks">
        {KINDS.filter((k) => k !== "comet" || comets).map((k) => {
          const fixed = mine.fixed[markKey(sector, k)];
          const m = fixed ?? mine.notes[markKey(sector, k)];
          return (
            <button key={k} className="px-mark" data-testid="px-mark" data-kind={k} data-mark={m} data-fixed={fixed ? "true" : undefined} disabled={!!fixed} aria-label={`${cap(KIND_NAME[k])} nel settore ${sector}: ${m ?? "nessun segno"}`} onClick={() => send({ type: "note", sector, object: k, mark: nextMark(m) })}>
              <b>{KIND_ICON[k]}</b>
              <small>{m ? (fixed === "excluded" ? "■" : MARK_GLYPH[m]) : "·"}</small>
            </button>
          );
        })}
      </div>
      <div className="px-shortcuts">
        <button onClick={() => send({ type: "noteSector", sector, mark: "looksEmpty" })}>Appare vuoto</button>
        <button onClick={() => send({ type: "noteSector", sector, mark: "excludeRest" })}>Escludi il resto</button>
        <button onClick={() => send({ type: "noteSector", sector, mark: "clear" })}>Pulisci</button>
      </div>
    </section>
  );
}

function ListView({ v, mine, send }: { v: PhoneView; mine: TeamView; send: ControllerProps["send"] }) {
  const n = v.settings.sectors;
  return (
    <ul className="px-list" data-testid="px-list">
      {Array.from({ length: n }, (_, i) => i + 1).map((s) => (
        <li key={s} data-visible={isVisible(s, v.earthSector, n) || undefined}>
          <b>{s}</b>
          {KINDS.map((k) => {
            const allowed = k !== "comet" || cometSectors(v.settings).includes(s);
            const fixed = mine.fixed[markKey(s, k)];
            const m = fixed ?? mine.notes[markKey(s, k)];
            return (
              <button key={k} className="px-mark" data-kind={k} data-mark={m} disabled={!!fixed || !allowed} aria-label={`${cap(KIND_NAME[k])} nel settore ${s}`} onClick={() => send({ type: "note", sector: s, object: k, mark: nextMark(m) })}>
                <b>{KIND_ICON[k]}</b>
                <small>{allowed ? (m ? (fixed === "excluded" ? "■" : MARK_GLYPH[m]) : "·") : ""}</small>
              </button>
            );
          })}
        </li>
      ))}
    </ul>
  );
}

function WheelTab({ v, mine, send }: { v: PhoneView; mine: TeamView; send: ControllerProps["send"] }) {
  const [selected, setSelected] = useState(1);
  const [list, setList] = useState(false);
  return (
    <div className="px-tab">
      <div className="row">
        <button data-active={!list || undefined} onClick={() => setList(false)}>Ruota</button>
        <button data-testid="px-list-toggle" data-active={list || undefined} onClick={() => setList(true)}>Elenco</button>
      </div>
      {list ? (
        <ListView v={v} mine={mine} send={send} />
      ) : (
        <>
          <Wheel v={v} mine={mine} selected={selected} onSelect={setSelected} />
          <SectorEditor v={v} mine={mine} sector={selected} send={send} />
        </>
      )}
      {mine.facts.length > 0 && <p className="muted px-facts">Informazioni iniziali: {mine.facts.map((f) => `${f.sector} senza ${KIND_ICON[f.absent]}`).join(" · ")}</p>}
    </div>
  );
}

// ---- Azione ----

function SectorPicker({ sectors, value, onPick, label }: { sectors: number[]; value: number | null; onPick: (s: number) => void; label: string }) {
  return (
    <div className="px-picker" role="group" aria-label={label}>
      {sectors.map((s) => (
        <button key={s} data-active={s === value || undefined} onClick={() => onPick(s)} aria-label={`Settore ${s}`}>{s}</button>
      ))}
    </div>
  );
}

function KindPicker({ options, value, onPick, label }: { options: Kind[]; value: Kind | null; onPick: (k: Seen) => void; label: string }) {
  return (
    <div className="px-picker" role="group" aria-label={label}>
      {options.map((k) => (
        <button key={k} data-kind={k} data-active={k === value || undefined} onClick={() => onPick(k as Seen)} aria-label={cap(KIND_NAME[k])}>
          <b>{KIND_ICON[k]}</b> <small>{KIND_NAME[k]}</small>
        </button>
      ))}
    </div>
  );
}

function ActionBuilder({ v, mine, send }: { v: PhoneView; mine: TeamView; send: ControllerProps["send"] }) {
  const [kind, setKind] = useState<"survey" | "target" | "research" | "locate">("survey");
  const [object, setObject] = useState<Seen>("asteroid");
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [sector, setSector] = useState<number | null>(null);
  const [left, setLeft] = useState<Seen | null>(null);
  const [right, setRight] = useState<Seen | null>(null);
  const n = v.settings.sectors;
  const all = Array.from({ length: n }, (_, i) => i + 1);
  const vis = mine.visible;
  const pickArc = (s: number) => {
    const i = vis.indexOf(s);
    const fi = from === null ? -1 : vis.indexOf(from);
    if (from === null || i <= fi) {
      setFrom(s);
      setTo(s);
    } else setTo(s);
  };
  const length = from !== null && to !== null ? vis.indexOf(to) - vis.indexOf(from) + 1 : 0;
  const comets = cometSectors(v.settings);
  let action: Action | null = null;
  let why: string | null = null;
  if (kind === "survey") {
    if (from === null || to === null) why = "Scegli l'inizio e la fine dell'arco";
    else if (object === "comet" && !(comets.includes(from) && comets.includes(to))) why = "Per le comete l'arco deve iniziare e finire su un settore da cometa";
    else action = { type: "survey", object, from, to };
  } else if (kind === "target") {
    if (mine.targetsLeft <= 0) why = "Gettoni di puntamento finiti";
    else if (sector === null || !vis.includes(sector)) why = "Scegli un settore del cielo visibile";
    else action = { type: "target", sector };
  } else if (kind === "locate") {
    if (sector === null || left === null || right === null) why = "Indica il settore e gli oggetti nei due settori vicini";
    else action = { type: "locate", sector, left, right };
  }
  const cost = kind === "survey" ? (length > 0 ? surveyCost(length) : 4) : kind === "target" ? 4 : kind === "research" ? 1 : 5;
  const propose = (a: Action) => send({ type: "propose", action: a });
  const nb = (s: number | null) => (s === null ? [null, null] : [((s + n - 2) % n) + 1, (s % n) + 1]);
  const [ln, rn] = nb(sector);

  return (
    <section className="px-builder" data-testid="px-builder">
      <div className="px-kinds" role="group" aria-label="Azione">
        {([["survey", "Rileva"], ["target", "Punta"], ["research", "Ricerca"], ["locate", "Localizza"]] as const).map(([k, label]) => (
          <button key={k} data-testid={`px-kind-${k}`} data-active={kind === k || undefined} onClick={() => setKind(k)}>{label}</button>
        ))}
      </div>
      {kind === "survey" && (
        <>
          <KindPicker options={SEEN} value={object} onPick={setObject} label="Oggetto da rilevare" />
          <p className="muted">Arco nel cielo visibile (da … a …):</p>
          <SectorPicker sectors={vis} value={null} onPick={pickArc} label="Arco" />
          <p data-testid="px-arc">{from !== null && to !== null ? `Settori ${from}${length > 1 ? `–${to}` : ""} · ${length} · costa ${cost}` : "Nessun arco"}</p>
        </>
      )}
      {kind === "target" && (
        <>
          <p className="muted">Gettoni di puntamento: {mine.targetsLeft}</p>
          <SectorPicker sectors={vis} value={sector} onPick={setSector} label="Settore da puntare" />
        </>
      )}
      {kind === "research" && (
        <div className="px-picker" role="group" aria-label="Ricerca">
          {v.topics.map((t) => {
            const read = mine.research.some((r) => r.topic === t.id);
            return (
              <button key={t.id} data-testid="px-topic" disabled={read || mine.lastWasResearch} onClick={() => propose({ type: "research", topic: t.id })} title={labelName(t.label)}>
                <b>{t.id}</b> <small>{labelText(t.label)}</small>
              </button>
            );
          })}
          {mine.lastWasResearch && <p className="muted">Ricerca appena fatta: non due volte di fila.</p>}
        </div>
      )}
      {kind === "locate" && (
        <>
          <SectorPicker sectors={all} value={sector} onPick={setSector} label="Settore del Pianeta X" />
          {sector !== null && (
            <>
              <p className="muted">Che cosa c'è nel settore {ln}?</p>
              <KindPicker options={SEEN} value={left} onPick={setLeft} label="Settore precedente" />
              <p className="muted">E nel settore {rn}?</p>
              <KindPicker options={SEEN} value={right} onPick={setRight} label="Settore successivo" />
            </>
          )}
        </>
      )}
      {kind !== "research" && (
        <button className="primary" data-testid="px-propose" disabled={!action} onClick={() => action && propose(action)}>
          Proponi · {cost} {cost === 1 ? "giorno" : "giorni"}
        </button>
      )}
      {why && kind !== "research" && <p className="muted" data-testid="px-why">{why}</p>}
    </section>
  );
}

function ActionTab({ v, mine, send, me }: { v: PhoneView; mine: TeamView; send: ControllerProps["send"]; me: string }) {
  if (v.phase !== "turn") return <p className="px-status" data-testid="px-status">{v.phase === "briefing" ? "La partita sta per iniziare." : v.phase === "resolve" ? "Le azioni sono state scelte." : "Non è il momento di agire."}</p>;
  if (!mine.acting || !mine.turn) {
    const who = v.actingIds.map((id) => obsName(v, id)).join(" e ");
    return <p className="px-status" data-testid="px-status">Tocca a {who}. Intanto ragionate sul foglio.</p>;
  }
  const t = mine.turn;
  const votes = (id: string) => (t.vote.mine.includes(id) ? 1 : 0) + t.vote.mates.filter((m) => m.picks.includes(id)).length;
  return (
    <div className="px-tab">
      <p className="px-status" data-testid="px-status"><b>Tocca alla vostra squadra!</b> {v.settings.decision === "captain" ? "Decide il capitano." : "Proponete e votate."}</p>
      <ActionBuilder v={v} mine={mine} send={send} />
      <section className="px-proposals" data-testid="px-proposals">
        <h3>Proposte</h3>
        {t.proposals.length === 0 && <p className="muted">Nessuna proposta.</p>}
        {t.proposals.map((p) => (
          <div key={p.id} className="px-proposal" data-testid="px-proposal" data-mine={t.vote.mine.includes(p.id) || undefined}>
            <span>{p.text} <small>({p.cost} g{p.by === me ? ", tua" : ""})</small></span>
            <span className="px-votes">
              {v.settings.decision === "vote" && <button onClick={() => send({ type: "vote", proposalId: p.id })} aria-pressed={t.vote.mine.includes(p.id)}>👍 {votes(p.id)}</button>}
              {mine.isCaptain && <button data-testid="px-decide" onClick={() => send({ type: "decide", proposalId: p.id })}>Decidi</button>}
            </span>
          </div>
        ))}
        {v.settings.decision === "vote" && (
          <button className="primary" data-testid="px-ready" disabled={t.vote.confirmed} onClick={() => send({ type: "ready" })}>
            {t.vote.confirmed ? "Confermato: aspettiamo i compagni" : "Confermo il mio voto"}
          </button>
        )}
      </section>
    </div>
  );
}

// ---- Registro e teorie ----

function LogTab({ v, mine }: { v: PhoneView; mine: TeamView }) {
  return (
    <div className="px-tab">
      <ol className="px-logbook" data-testid="px-logbook">
        {mine.log.map((l, i) => <li key={i}><b>{l.time}</b> {l.text}</li>)}
        {mine.log.length === 0 && <li className="muted">Nessuna azione ancora.</li>}
      </ol>
      {v.conferences.filter((c) => c.held).map((c) => <p key={c.id} className="px-conf"><b>{c.id}</b> «{c.text}»</p>)}
      <h3>Argomenti</h3>
      <ul className="px-topics">
        {v.topics.map((t) => {
          const read = mine.research.find((r) => r.topic === t.id);
          return <li key={t.id} data-read={!!read || undefined}><b>{t.id}</b> {labelText(t.label)} {read ? <>«{read.text}»</> : <small>— da leggere</small>}</li>;
        })}
      </ul>
      <h3>Cronaca</h3>
      <ol className="px-logbook">
        {[...v.publicLog].reverse().slice(0, 12).map((e) => <li key={e.id}><b>{obsName(v, e.obsId)}</b> {e.text}</li>)}
      </ol>
    </div>
  );
}

function TheoryTab({ v, mine, send }: { v: PhoneView; mine: TeamView; send: ControllerProps["send"] }) {
  const [sector, setSector] = useState<number | null>(null);
  const [gSector, setGSector] = useState<number | null>(null);
  const [left, setLeft] = useState<Seen | null>(null);
  const [right, setRight] = useState<Seen | null>(null);
  const n = v.settings.sectors;
  const all = Array.from({ length: n }, (_, i) => i + 1);
  const c = mine.collect;
  const draftCount = (k: Token) => c?.draft.filter((d) => d.object === k).length ?? 0;
  const comets = cometSectors(v.settings);
  const [ln, rn] = gSector === null ? [null, null] : [((gSector + n - 2) % n) + 1, (gSector % n) + 1];
  return (
    <div className="px-tab">
      <ul className="px-tokens" data-testid="px-tokens">
        {TOKENS.map((k) => (
          <li key={k} data-empty={mine.tokens[k] === 0 || undefined}>{KIND_ICON[k]} {mine.tokens[k]}/{v.settings.tokens[k]}</li>
        ))}
      </ul>
      {mine.myTheories.length > 0 && (
        <ul className="px-placed" data-testid="px-placed">
          {mine.myTheories.map((t) => <li key={t.id}>{KIND_ICON[t.object]} settore {t.sector} · {t.faceUp ? "giusta ✔" : `spazio ${Math.min(3, t.space) + 1}/4`}</li>)}
        </ul>
      )}
      {c && (
        <section className="px-submit" data-testid="px-submit">
          <h3>{v.phase === "finalGuess" ? "Ipotesi finale" : v.phase === "lastCall" ? `Ultima opportunità (indietro di ${c.lag})` : "Invia le teorie"}</h3>
          {v.phase !== "finalGuess" && c.limit > 0 && (
            <>
              <p className="muted">Fino a {c.limit} {c.limit === 1 ? "teoria" : "teorie"}: {c.draft.length}/{c.limit}. Un gettone sbagliato è perso e costa un giorno.</p>
              <SectorPicker sectors={all.filter((s) => v.confirmed[s] === undefined)} value={sector} onPick={setSector} label="Settore della teoria" />
              <div className="px-picker" role="group" aria-label="Oggetto della teoria">
                {TOKENS.map((k) => (
                  <button key={k} data-kind={k} data-testid={`px-theory-${k}`} disabled={sector === null || mine.tokens[k] - draftCount(k) <= 0 || (k === "comet" && sector !== null && !comets.includes(sector)) || c.draft.length >= c.limit && !c.draft.some((d) => d.sector === sector)} onClick={() => sector !== null && send({ type: "theory", sector, object: k })}>
                    <b>{KIND_ICON[k]}</b> <small>{mine.tokens[k] - draftCount(k)} rimasti</small>
                  </button>
                ))}
              </div>
              <ul className="px-draft" data-testid="px-draft">
                {c.draft.map((d) => (
                  <li key={d.sector}>{KIND_ICON[d.object]} {KIND_NAME[d.object]} nel settore {d.sector} <button onClick={() => send({ type: "withdraw", sector: d.sector })}>Ritira</button></li>
                ))}
              </ul>
            </>
          )}
          {c.canGuess && (
            <>
              <h4>{v.phase === "finalGuess" ? "Dov'è il Pianeta X?" : "Oppure localizza il Pianeta X"}</h4>
              <SectorPicker sectors={all} value={gSector} onPick={setGSector} label="Settore del Pianeta X" />
              {gSector !== null && (
                <>
                  <p className="muted">Settore {ln}:</p>
                  <KindPicker options={SEEN} value={left} onPick={setLeft} label="Settore precedente" />
                  <p className="muted">Settore {rn}:</p>
                  <KindPicker options={SEEN} value={right} onPick={setRight} label="Settore successivo" />
                  <button disabled={left === null || right === null} data-testid="px-guess" onClick={() => left && right && send({ type: "guess", sector: gSector, left, right } satisfies Guess & { type: string })}>Indica il Pianeta X nel settore {gSector}</button>
                </>
              )}
              {c.guess && <p data-testid="px-guess-set">Scelta: Pianeta X nel settore {c.guess.sector} ({KIND_ICON[c.guess.left]} {KIND_ICON[c.guess.right]})</p>}
            </>
          )}
          <button className="primary" data-testid="px-theory-ready" aria-pressed={c.ready} onClick={() => send({ type: "ready" })}>
            {c.ready ? "Annulla la conferma" : "Confermo"} <small>({c.readyBy}/{mine.captainId ? "capitano o tutti" : "tutti"})</small>
          </button>
        </section>
      )}
    </div>
  );
}

type Tab = "wheel" | "action" | "log" | "theory";

export function PianetaController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const mine = v.mine;
  const sfx = useSfx(theme);
  const acting = !!mine?.acting && v.phase === "turn";
  const collecting = !!mine?.collect;
  const [tab, setTab] = useState<Tab>(acting ? "action" : collecting ? "theory" : "wheel");
  const [rules, setRules] = useState(false);
  const prev = useRef({ acting, collecting });

  // Quando tocca alla squadra, o si apre una fase di scelta, il telefono passa alla scheda giusta e vibra.
  useEffect(() => {
    const p = prev.current;
    if (acting && !p.acting) {
      setTab("action");
      navigator.vibrate?.(60);
      sfx("notify");
    }
    if (collecting && !p.collecting) {
      setTab("theory");
      navigator.vibrate?.(60);
    }
    prev.current = { acting, collecting };
  }, [acting, collecting, sfx]);

  if (!mine) return <p className="big">Non sei in questa partita.</p>;

  if (v.phase === "final" || v.phase === "done") {
    const row = v.scores?.find((r) => r.id === mine.id);
    return (
      <div className="px-ctrl" data-phase={v.phase} style={teamStyle(mine.color)}>
        <p className="big" data-testid="px-result">{row?.rank}° posto · {(row?.breakdown.total ?? 0) * v.settings.pointScale} punti</p>
        {row && (
          <ul className="px-sheet" data-testid="px-sheet">
            <li>Priorità <b>{row.breakdown.priority}</b></li>
            {TOKENS.map((k) => <li key={k}>{KIND_ICON[k]} <b>{row.breakdown[k]}</b></li>)}
            <li>Pianeta X <b>{row.breakdown.planetX}</b></li>
          </ul>
        )}
      </div>
    );
  }

  const tabs: [Tab, string][] = [["wheel", "Ruota"], ["action", "Azione"], ["log", "Registro"], ["theory", "Teorie"]];
  return (
    <div className="px-ctrl" data-phase={v.phase} data-paused={v.pausedRemainingMs !== null || undefined} style={teamStyle(mine.color)} data-testid="px-ctrl">
      <div className="px-head">
        <span><b className="px-tag">{mine.name}</b> giorno {v.observatories.find((o) => o.id === mine.id)?.time ?? 0}</span>
        <Timer v={v} clock={clock} />
        <button className="gf-info" data-testid="px-rules" onClick={() => setRules(true)} aria-label="Regole">ℹ️</button>
      </div>
      <nav className="px-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} data-testid={`px-tab-${id}`} data-alert={(id === "action" && acting) || (id === "theory" && collecting) || undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {tab === "wheel" && <WheelTab v={v} mine={mine} send={send} />}
      {tab === "action" && <ActionTab v={v} mine={mine} send={send} me={mine.playerId} />}
      {tab === "log" && <LogTab v={v} mine={mine} />}
      {tab === "theory" && <TheoryTab v={v} mine={mine} send={send} />}
      <p className="muted px-total">Gettoni teoria: {tokensTotal(mine.tokens)}</p>
      {rules && <RulesDialog v={v} onClose={() => setRules(false)} />}
    </div>
  );
}

