import { useEffect, useRef, useState } from "react";
import type { ClockSync } from "@gioco/shared";
import { useSfx } from "../../audio/useAudio";
import { useRemaining } from "../Countdown";
import { clockText } from "../parole-mannare/tokens";
import type { ControllerProps, ViewProps } from "../types";
import { Dial, type DialDot, clusterDots } from "./Dial";
import { rulesSections } from "./rulesText";
import type { Me, PhoneView, PublicView, TurnResult } from "./types";
import "./onda.css";

// ---- Pezzi comuni ----

const initials = (nickname: string) => nickname.slice(0, 2);
const nameOf = (v: PublicView, id: string) => v.standings.find((p) => p.id === id)?.nickname ?? "?";
const teamOf = (v: PublicView, id: string | null) => v.teams.find((t) => t.id === id);
const clamp = (p: number) => Math.min(100, Math.max(0, Math.round(p * 2) / 2));
const ZONE_TEXT = { 0: "fuori", 2: "2 punti", 3: "3 punti", 4: "centro!" } as const;

function Timer({ v, clock }: { v: Pick<PublicView, "phaseEndsAt" | "pausedRemainingMs">; clock: ClockSync }) {
  const left = useRemaining(v.phaseEndsAt ?? 0, clock);
  if (v.pausedRemainingMs !== null) return <span className="lo-timer" data-paused="true">⏸ {clockText(v.pausedRemainingMs)}</span>;
  if (v.phaseEndsAt === null) return null;
  return <span className="lo-timer">⏱ {clockText(left)}</span>;
}

/** Turno, punteggio delle squadre e tempo. */
function TopBar({ v, clock }: { v: PublicView; clock: ClockSync }) {
  return (
    <div className="lo-topbar">
      <span className="lo-turn">
        Turno {Math.min(v.turn.number, v.maxTurns)} di {v.maxTurns}
        {v.turn.catchUp && <b> · recupero</b>}
      </span>
      {v.mode === "squadre" && (
        <span className="lo-scores" data-testid="lo-scores">
          {v.teams.map((t) => (
            <span key={t.id} className="lo-score" data-team={t.id} data-active={t.id === v.turn.teamId} style={{ borderColor: t.color }}>
              {t.name} <b>{t.score}</b>
            </span>
          ))}
        </span>
      )}
      <Timer v={v} clock={clock} />
    </div>
  );
}

/** «Tocca a Carla (Rossi)». */
function Psychic({ v }: { v: PublicView }) {
  const team = teamOf(v, v.turn.teamId);
  return (
    <>
      <b>{v.turn.psychic.nickname}</b>
      {team && <span className="lo-team-tag" style={{ background: team.color }}>{team.name}</span>}
    </>
  );
}

/** Pallini della squadra di turno (a squadre), con il colore della squadra. */
function teamDots(v: PublicView, myId?: string): DialDot[] {
  const color = teamOf(v, v.turn.teamId)?.color;
  return (v.teamDials ?? [])
    .filter((d) => d.playerId !== myId)
    .map((d) => ({ id: d.playerId, label: initials(d.nickname), pos: d.pos, color, confirmed: d.confirmed }));
}

/** Pallini della rivelazione: tutti contro tutti le posizioni di ognuno (raggruppate), a squadre quelle della squadra. */
function resultDots(v: PublicView, r: TurnResult, myId?: string): DialDot[] {
  const color = teamOf(v, r.teamId)?.color;
  return clusterDots(r.guesses.map((g) => ({ id: g.playerId, label: initials(nameOf(v, g.playerId)), pos: g.pos, color, mine: g.playerId === myId })));
}

function Clue({ v }: { v: PublicView }) {
  if (!v.turn.clue) return null;
  return (
    <p className="lo-clue" data-testid="lo-clue">
      «{v.turn.clue}»
    </p>
  );
}

// ---- Schermo condiviso ----

function ScreenResult({ v, r }: { v: PublicView; r: TurnResult }) {
  if (v.mode === "squadre") {
    const team = teamOf(v, r.teamId);
    return (
      <div className="lo-results" data-testid="lo-results">
        <p className="lo-info">
          {team?.name}: {r.teamPos === null ? "nessuna posizione" : ZONE_TEXT[r.zone]} <b>+{r.zone}</b>
        </p>
        {r.counters.map((c) => (
          <p key={c.teamId} className="lo-counter-row" data-correct={c.correct}>
            {teamOf(v, c.teamId)?.name}: {c.dir === null ? "nessuna scommessa" : c.dir === "left" ? "⬅ più a sinistra" : "più a destra ➡"} {c.dir !== null && (c.correct ? `✓ +${c.points}` : "✗")}
          </p>
        ))}
      </div>
    );
  }
  const best = [...r.guesses].sort((a, b) => b.points - a.points || Math.abs(a.pos - r.target) - Math.abs(b.pos - r.target)).slice(0, 3);
  return (
    <div className="lo-results" data-testid="lo-results">
      <ol className="lo-best">
        {best.map((g) => (
          <li key={g.playerId} data-zone={g.zone}>
            {nameOf(v, g.playerId)} <b>+{g.points}</b>
          </li>
        ))}
        {best.length === 0 && <li className="muted">Nessuno ha giocato.</li>}
      </ol>
      <p className="muted">
        Sensitivo {nameOf(v, r.psychicId)}: <b>+{r.psychicPoints}</b>
      </p>
    </div>
  );
}

function FinalBoard({ v }: { v: PublicView }) {
  if (v.mode === "squadre") {
    const teams = [...v.teams].sort((a, b) => b.score - a.score);
    const tie = teams.length > 1 && teams[0]!.score === teams[1]!.score;
    return (
      <div className="lo-final" data-testid="lo-final">
        <h2 className="question">{tie ? "Pareggio!" : `Vince la squadra ${teams[0]?.name}!`}</h2>
        <ol className="lo-standings">
          {teams.map((t) => (
            <li key={t.id} style={{ borderColor: t.color }}>
              {t.name} <b>{t.score}</b>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return (
    <div className="lo-final" data-testid="lo-final">
      <h2 className="question">Classifica di Lunghezza d'Onda</h2>
      <ol className="lo-standings">
        {v.standings.slice(0, 10).map((p) => (
          <li key={p.id}>
            {p.nickname} <b>{p.points}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function OndaScreen({ view, clock, theme }: ViewProps) {
  const v = view as PublicView;
  const sfx = useSfx(theme);
  const phase = v.phase;
  const zw = v.rules.zoneWidth;

  useEffect(() => {
    if (phase === "pick") sfx("start", 0.4);
    if (phase === "reveal") sfx("reveal");
    if (phase === "final") sfx("fanfare");
  }, [phase, v.turn.number, sfx]);

  let body;
  if (phase === "pick") {
    body = (
      <>
        <h2 className="question">Tocca a <Psychic v={v} /></h2>
        <p className="big">Il Sensitivo sceglie lo spettro…</p>
      </>
    );
  } else if (phase === "clue") {
    body = (
      <>
        <p className="big">
          <Psychic v={v} /> pensa a un indizio…
        </p>
        <Dial spectrum={v.turn.spectrum} zoneWidth={zw} />
      </>
    );
  } else if (phase === "guess" || phase === "counter") {
    const team = v.mode === "squadre";
    body = (
      <>
        <Clue v={v} />
        <Dial spectrum={v.turn.spectrum} zoneWidth={zw} dots={team ? teamDots(v) : []} needle={team ? v.teamPos : null} />
        {phase === "guess" ? (
          <p className="muted" data-testid="lo-confirmed">
            {team && <>Indovina la squadra {teamOf(v, v.turn.teamId)?.name} · </>}Confermati {v.confirmed} / {v.guessers}
          </p>
        ) : (
          <p className="lo-info" data-testid="lo-counter-info">
            Le altre squadre scommettono: più a sinistra o più a destra? <small className="muted">({v.counterVoted} / {v.counterVoters})</small>
          </p>
        )}
      </>
    );
  } else if (phase === "reveal" && v.result) {
    const r = v.result;
    body = (
      <>
        <Clue v={v} />
        <Dial spectrum={r.spectrum} target={r.target} zoneWidth={zw} revealing dots={resultDots(v, r)} needle={r.teamPos} />
        <ScreenResult v={v} r={r} />
      </>
    );
  } else {
    body = <FinalBoard v={v} />;
  }

  return (
    <div className="lo-screen" data-phase={phase} data-mode={v.mode}>
      {phase !== "final" && phase !== "done" && <TopBar v={v} clock={clock} />}
      {body}
    </div>
  );
}

// ---- Telefono ----

function RulesDialog({ v, me, onClose }: { v: PhoneView; me: Me; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(me.role, v.rules).map((s) => (
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

/** Il quadrante con il bersaglio, solo per il Sensitivo: si copre con un tocco quando qualcuno si avvicina. */
function SecretDial({ v, me }: { v: PhoneView; me: Me }) {
  const [hidden, setHidden] = useState(false);
  const team = v.mode === "squadre";
  return (
    <div className="lo-secret">
      <Dial
        spectrum={v.turn.spectrum}
        target={hidden ? null : me.target}
        zoneWidth={v.rules.zoneWidth}
        dots={team && v.phase !== "clue" ? teamDots(v) : []}
        needle={team ? v.teamPos : null}
      />
      <button className="lo-hide" data-testid="lo-hide" onClick={() => setHidden((h) => !h)}>
        {hidden ? "👁 Mostra il bersaglio" : "🙈 Nascondi"}
      </button>
    </div>
  );
}

function ClueForm({ send }: { send: ControllerProps["send"] }) {
  const [text, setText] = useState("");
  const clean = text.trim();
  return (
    <form
      className="lo-clue-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) send({ type: "clue", text: clean });
      }}
    >
      <input aria-label="Il tuo indizio" data-testid="lo-clue-input" value={text} maxLength={60} placeholder="Il tuo indizio" onChange={(e) => setText(e.target.value)} />
      <button className="primary" type="submit" disabled={!clean}>Invia</button>
      <small className="muted">Niente numeri e niente sinonimi degli estremi.</small>
    </form>
  );
}

/**
 * Il mio quadrante. La lancetta si muove in locale; al server va:
 * - tutti contro tutti: un invio al rilascio del dito (gli altri non vedono la mia posizione);
 * - a squadre: anche durante il trascinamento, al massimo ogni 250 ms, perché i compagni la vedono dal vivo.
 * Ogni invio rimanda le viste a tutti i telefoni (vedi PIANO-LUNGHEZZA-ONDA.md §5.3).
 */
function GuessPanel({ v, me, send }: { v: PhoneView; me: Me; send: ControllerProps["send"] }) {
  const team = v.mode === "squadre";
  const [pos, setPos] = useState(me.myDial ?? 50);
  const lastSent = useRef(0);
  const nudgeTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);

  const release = (p: number) => {
    setPos(p);
    if (me.confirmed && p === me.myDial) return; // un tocco senza spostare non toglie la conferma
    lastSent.current = Date.now();
    send({ type: "dial", pos: p });
  };
  const move = (p: number) => {
    setPos(p);
    if (team && Date.now() - lastSent.current >= 250) {
      lastSent.current = Date.now();
      send({ type: "dial", pos: p });
    }
  };
  const nudge = (delta: number) => {
    const p = clamp(pos + delta);
    setPos(p);
    window.clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => release(p), 300);
  };

  return (
    <div className="lo-guess" data-testid="lo-guess">
      <Dial spectrum={v.turn.spectrum} zoneWidth={v.rules.zoneWidth} needle={pos} ghostNeedle={team ? v.teamPos : null} dots={team ? teamDots(v, me.id) : []} onMove={move} onRelease={release} />
      <div className="lo-nudge">
        <button aria-label="Più a sinistra" onClick={() => nudge(-0.5)}>‹</button>
        <span className="lo-pos" data-testid="lo-pos">{pos}</span>
        <button aria-label="Più a destra" onClick={() => nudge(0.5)}>›</button>
      </div>
      <button
        className={me.confirmed && pos === me.myDial ? "lo-confirm" : "primary lo-confirm"}
        data-testid="lo-confirm"
        data-confirmed={me.confirmed && pos === me.myDial}
        onClick={() => {
          window.clearTimeout(nudgeTimer.current);
          send({ type: "confirm", pos });
        }}
      >
        {me.confirmed && pos === me.myDial ? "✓ Confermato (puoi ancora cambiare)" : "Conferma"}
      </button>
      {team && <small className="muted">Conta la mediana della squadra (tratteggiata).</small>}
    </div>
  );
}

function CounterPanel({ v, me, send }: { v: PhoneView; me: Me; send: ControllerProps["send"] }) {
  return (
    <div className="lo-counter" data-testid="lo-counter">
      <Dial spectrum={v.turn.spectrum} zoneWidth={v.rules.zoneWidth} needle={v.teamPos} dots={teamDots(v)} />
      <p>Il bersaglio è…</p>
      <div className="lo-counter-buttons">
        {(["left", "right"] as const).map((dir) => (
          <button key={dir} className={me.myCounter === dir ? "primary" : ""} data-chosen={me.myCounter === dir} data-dir={dir} onClick={() => send({ type: "counter", dir })}>
            {dir === "left" ? "⬅ Più a sinistra" : "Più a destra ➡"}
          </button>
        ))}
      </div>
      {(me.teamCounter ?? []).length > 0 && (
        <small className="muted" data-testid="lo-team-counter">
          {(me.teamCounter ?? []).map((c) => `${c.nickname}: ${c.dir === "left" ? "⬅" : "➡"}`).join(" · ")}
        </small>
      )}
    </div>
  );
}

function PhoneResult({ v, me, r }: { v: PhoneView; me: Me; r: TurnResult }) {
  const mine = r.guesses.find((g) => g.playerId === me.id);
  let line: string;
  if (v.mode === "squadre") {
    const counter = r.counters.find((c) => c.teamId === me.teamId);
    line = me.teamId === r.teamId ? `La tua squadra: +${r.zone}` : counter?.dir ? (counter.correct ? `Scommessa giusta! +${counter.points}` : "Scommessa sbagliata") : "Nessuna scommessa";
  } else {
    line = r.psychicId === me.id ? `Da Sensitivo: +${r.psychicPoints}` : mine ? `${ZONE_TEXT[mine.zone]} · +${mine.points}` : "Non hai giocato questo turno";
  }
  return (
    <>
      <Dial spectrum={r.spectrum} target={r.target} zoneWidth={v.rules.zoneWidth} needle={v.mode === "squadre" ? r.teamPos : (mine?.pos ?? null)} dots={v.mode === "squadre" ? resultDots(v, r, me.id) : []} />
      <p className="big" data-testid="lo-my-result">{line}</p>
    </>
  );
}

export function OndaController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const me = v.me;
  const sfx = useSfx(theme);
  const [rules, setRules] = useState(false);
  const phase = v.phase;
  const role = me?.role;

  useEffect(() => {
    if (phase === "pick" && role === "psychic") sfx("notify");
    if (phase === "reveal") sfx("reveal");
  }, [phase, role, v.turn.number, sfx]);

  if (!me) return <p className="big">Non sei in questa partita.</p>;
  const psychic = me.role === "psychic";

  let body;
  if (phase === "pick") {
    body = psychic && me.options ? (
      <div className="lo-options" data-testid="lo-options">
        <h3>Sei il Sensitivo! Scegli lo spettro</h3>
        {me.options.map((o, i) => (
          <button key={`${o.left}|${o.right}`} className="primary lo-option" onClick={() => send({ type: "pick", index: i })}>
            {o.left} ↔ {o.right}
          </button>
        ))}
      </div>
    ) : (
      <p className="big">Tocca a <Psychic v={v} />: sceglie lo spettro…</p>
    );
  } else if (phase === "clue") {
    body = psychic ? (
      <>
        <SecretDial v={v} me={me} />
        <ClueForm send={send} />
      </>
    ) : (
      <p className="big"><Psychic v={v} /> pensa a un indizio…</p>
    );
  } else if (phase === "guess" || phase === "counter") {
    if (psychic) {
      body = (
        <>
          <Clue v={v} />
          <SecretDial v={v} me={me} />
          <p className="muted">Non fare facce! 😶</p>
        </>
      );
    } else if (phase === "guess" && me.role === "guesser") {
      body = (
        <>
          <Clue v={v} />
          <GuessPanel key={`${v.turn.number}-${v.turn.clue}`} v={v} me={me} send={send} />
        </>
      );
    } else if (phase === "counter" && me.role === "counter") {
      body = (
        <>
          <Clue v={v} />
          <CounterPanel v={v} me={me} send={send} />
        </>
      );
    } else {
      body = (
        <>
          <Clue v={v} />
          <Dial spectrum={v.turn.spectrum} zoneWidth={v.rules.zoneWidth} needle={v.teamPos} dots={teamDots(v)} />
          <p className="muted">{phase === "guess" ? `Indovina la squadra ${teamOf(v, v.turn.teamId)?.name ?? ""}…` : "Le altre squadre scommettono…"}</p>
        </>
      );
    }
  } else if (phase === "reveal" && v.result) {
    body = <PhoneResult v={v} me={me} r={v.result} />;
  } else {
    const rank = v.standings.findIndex((p) => p.id === me.id);
    const team = teamOf(v, me.teamId);
    body = (
      <p className="big" data-testid="lo-final-me">
        {v.mode === "squadre" && team ? `${team.name}: ${team.score} punti` : `${v.standings[rank]?.points ?? 0} punti · ${rank + 1}° posto`}
      </p>
    );
  }

  return (
    <div className="lo-ctrl" data-phase={phase} data-role={me.role} data-mode={v.mode}>
      <div className="lo-head">
        <span className="lo-turn">
          Turno {Math.min(v.turn.number, v.maxTurns)}/{v.maxTurns}
          {psychic && phase !== "final" && phase !== "done" && <b> · Sensitivo</b>}
        </span>
        <Timer v={v} clock={clock} />
        <button className="gf-info" data-testid="lo-rules" onClick={() => setRules(true)} aria-label="Regole">ℹ️</button>
      </div>
      {body}
      {rules && <RulesDialog v={v} me={me} onClose={() => setRules(false)} />}
    </div>
  );
}
