import { useCallback, useEffect, useState } from "react";
import type { ClockSync } from "@gioco/shared";
import { useSfx } from "../../audio/useAudio";
import { useRemaining } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";
import { type Assignment, DragGhost, useDragPair } from "./useDragPair";
import { type LogEvent, useLogEvents } from "./useLogEvents";
import { ROLE_ICON, ROLE_LABEL, TOKENS, clockText, tokenAvailable, tokenInfo } from "./tokens";
import { rulesSections } from "./rulesText";
import type { LogEntry, Me, PhoneView, PublicView, Summary, Token } from "./types";
import "./parole.css";

// ---- Pezzi comuni ----

function Timer({ v, clock }: { v: Pick<PublicView, "phaseEndsAt" | "pausedRemainingMs">; clock: ClockSync }) {
  const left = useRemaining(v.phaseEndsAt ?? 0, clock);
  if (v.pausedRemainingMs !== null) return <span className="pm-timer" data-paused="true">⏸ {clockText(v.pausedRemainingMs)}</span>;
  if (v.phaseEndsAt === null) return null;
  return <span className="pm-timer">⏱ {clockText(left)}</span>;
}

function Reserves({ v }: { v: PublicView }) {
  const r = v.reserves;
  return (
    <div className="pm-reserves" data-testid="pm-reserves">
      <span data-reserve="yesNo">Sì/No: <b>{r.yesNo}</b></span>
      <span data-reserve="maybe">Forse: <b>{r.maybe ?? "∞"}</b></span>
      {v.rules.closeTokens > 0 && <span data-reserve="close">🟡 {r.close > 0 ? "libero" : "usato"}</span>}
      {v.rules.farTokens > 0 && <span data-reserve="far">🔴 {r.far > 0 ? "libero" : "usato"}</span>}
    </div>
  );
}

/** Conteggi di un giocatore: un gettone per tipo, solo quelli ricevuti. */
function Counts({ s }: { s: Summary }) {
  return (
    <span className="pm-counts">
      {s.yes > 0 && <span data-token="yes">✅ {s.yes}</span>}
      {s.no > 0 && <span data-token="no">❌ {s.no}</span>}
      {s.maybe > 0 && <span data-token="maybe">❓ {s.maybe}</span>}
      {s.close > 0 && <span data-token="close">🟡</span>}
      {s.far > 0 && <span data-token="far">🔴</span>}
    </span>
  );
}

const entryText = (e: LogEntry) => `${tokenInfo(e.token).icon} ${tokenInfo(e.token).label} → ${e.nickname}`;

function History({ log }: { log: LogEntry[] }) {
  const last = log.slice(-4).reverse();
  if (last.length === 0) return null;
  return (
    <ul className="pm-history" data-testid="pm-history">
      {last.map((e) => (
        <li key={e.seq} data-undone={e.undone}>{entryText(e)}</li>
      ))}
    </ul>
  );
}

function VoteInfo({ v }: { v: PublicView }) {
  return (
    <p className="muted" data-testid="pm-voted">
      Hanno votato {v.voted} su {v.voters}
    </p>
  );
}

function Outcome({ v }: { v: PublicView }) {
  if (!v.outcome) return null;
  const village = v.outcome.winner === "village";
  return (
    <>
      <h2 className="question" data-winner={v.outcome.winner}>{village ? "Vince il VILLAGGIO! 🏘️" : "Vincono i LUPI! 🐺"}</h2>
      <p className="big">{v.outcome.reason}</p>
      {v.word && <p className="muted">La parola era <b>{v.word}</b></p>}
      <ul className="pm-roles">
        {(v.roles ?? []).map((p) => (
          <li key={p.id} className={`pm-role-row pm-role-${p.role}`} data-role={p.role}>
            {ROLE_ICON[p.role]} {p.nickname} <small>{ROLE_LABEL[p.role]}{p.id === v.mayor.id ? " · Sindaco" : ""}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---- Schermo condiviso ----

function TokenBoard({ v, event }: { v: PublicView; event: LogEvent | null }) {
  return (
    <ul className="pm-board" data-testid="pm-board" data-count={v.players.length}>
      {v.players.map((p) => {
        const hit = event && event.entry.playerId === p.id ? event : null;
        return (
          <li
            key={p.id}
            className="pm-board-row"
            data-player={p.id}
            data-mayor={p.id === v.mayor.id}
            data-flash={hit ? hit.kind : undefined}
            // la chiave cambia a ogni evento, così l'animazione riparte
            {...(hit ? { "data-event": hit.id } : {})}
          >
            <span className="pm-name">{p.nickname}{p.id === v.mayor.id && " 🏛️"}</span>
            {p.id === v.mayor.id ? <small>Sindaco</small> : <Counts s={p.summary} />}
          </li>
        );
      })}
    </ul>
  );
}

export function ParoleScreen({ view, clock, theme }: ViewProps) {
  const v = view as PublicView;
  const sfx = useSfx(theme);
  const event = useLogEvents(v.log, 2000);
  const phase = v.phase;

  useEffect(() => {
    if (phase === "questions") sfx("start", 0.4);
    if (phase === "correct-grace") sfx("correct");
    if (phase === "seer-hunt" || phase === "werewolf-vote") sfx("reveal");
    if (phase === "reveal") sfx("fanfare");
  }, [phase, sfx]);
  useEffect(() => {
    if (event?.kind === "given") sfx(event.entry.token === "no" ? "wrong" : "notify", 0.4);
  }, [event?.id, event?.kind, event?.entry.token, sfx]);

  if (phase === "deal") {
    return (
      <div className="pm-screen" data-phase={phase}>
        <h2 className="question">🐺 Parole Mannare</h2>
        <p className="big">Il Sindaco è <b>{v.mayor.nickname}</b></p>
        <p className="muted">
          {v.rules.players} giocatori · {v.rules.werewolves} {v.rules.werewolves === 1 ? "Lupo" : "Lupi"} e un Veggente si nascondono tra voi
        </p>
      </div>
    );
  }
  if (phase === "word") {
    return (
      <div className="pm-screen" data-phase={phase}>
        <h2 className="question">{v.mayor.nickname} sceglie la parola…</h2>
        <Timer v={v} clock={clock} />
        <p className="muted">Guardate il vostro telefono solo quando vi viene detto.</p>
      </div>
    );
  }
  if (phase === "night") {
    return (
      <div className="pm-screen" data-phase={phase}>
        <h2 className="question">È notte…</h2>
        <p className="big">Tenete premuto il pulsante sul telefono per scoprire il vostro ruolo</p>
        <Timer v={v} clock={clock} />
      </div>
    );
  }
  if (phase === "questions") {
    return (
      <div className="pm-screen" data-phase={phase}>
        <div className="pm-topbar">
          <Timer v={v} clock={clock} />
          <Reserves v={v} />
        </div>
        <p className="muted">Fate le vostre domande ad alta voce a <b>{v.mayor.nickname}</b></p>
        <TokenBoard v={v} event={event} />
      </div>
    );
  }
  if (phase === "correct-grace") {
    return (
      <div className="pm-screen" data-phase={phase}>
        <h2 className="question">🎯 Parola indovinata!</h2>
        <p className="big">{v.correctBy} ha indovinato</p>
        <TokenBoard v={v} event={null} />
      </div>
    );
  }
  if (phase === "seer-hunt") {
    return (
      <div className="pm-screen" data-phase={phase}>
        <h2 className="question">I Lupi si rivelano!</h2>
        <p className="big">🐺 {(v.wolves ?? []).join(" · ")}</p>
        <p className="muted">{v.runoff ? "Ballottaggio! I Lupi scelgono tra:" : "Cercano il Veggente…"}</p>
        {v.runoff && <Candidates v={v} />}
        <Timer v={v} clock={clock} />
        <VoteInfo v={v} />
      </div>
    );
  }
  if (phase === "werewolf-vote") {
    return (
      <div className="pm-screen" data-phase={phase}>
        <h2 className="question">{v.runoff ? "Ballottaggio!" : "Chi è il Lupo?"}</h2>
        {v.word && <p className="big">La parola era <b>{v.word}</b></p>}
        {v.runoff && <Candidates v={v} />}
        <Timer v={v} clock={clock} />
        <VoteInfo v={v} />
      </div>
    );
  }
  return (
    <div className="pm-screen" data-phase={phase}>
      <Outcome v={v} />
    </div>
  );
}

function Candidates({ v }: { v: PublicView }) {
  return (
    <ul className="pm-candidates" data-testid="pm-runoff">
      {(v.runoff ?? []).map((c) => (
        <li key={c.id}>{c.nickname}</li>
      ))}
    </ul>
  );
}

// ---- Telefono ----

/** Ruolo e parola si vedono solo tenendo premuto: il vicino non sbircia e uno scatto accidentale non resta a schermo. */
function RoleBox({ me, word }: { me: Me; word: string | null }) {
  const [held, setHeld] = useState(false);
  if (!me.role) return null;
  return (
    <button
      className="pm-hold"
      data-testid="pm-hold"
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {held ? (
        <span className="pm-secret" data-testid="pm-secret" data-role={me.role}>
          <b>{ROLE_ICON[me.role]} {ROLE_LABEL[me.role]}{me.isMayor ? " · Sindaco" : ""}</b>
          {word && <span>Parola: <b>{word}</b></span>}
          {me.mates.length > 0 && <small>Lupi con te: {me.mates.join(", ")}</small>}
        </span>
      ) : (
        "👁 Tieni premuto: ruolo"
      )}
    </button>
  );
}

function RulesDialog({ v, me, onClose }: { v: PhoneView; me: Me; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(me.role, me.isMayor, v.rules).map((s) => (
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

/** Avviso del gettone in alto: per tutti «→ Nome», per chi lo riceve «a te». */
function Notice({ event, myId }: { event: LogEvent | null; myId: string }) {
  useEffect(() => {
    if (event?.kind === "given" && event.entry.playerId === myId) {
      try {
        navigator.vibrate?.(120);
      } catch {
        /* non su iOS Safari */
      }
    }
  }, [event?.id, event?.kind, event?.entry.playerId, myId]);
  if (!event) return <div className="pm-notice pm-notice-empty" aria-hidden="true" />;
  const t = tokenInfo(event.entry.token);
  const mine = event.entry.playerId === myId;
  if (event.kind === "undone") {
    return (
      <div key={event.id} className="pm-notice" data-kind="undone" data-testid="pm-notice" role="status">
        ↶ Annullato: {t.label} a {mine ? "te" : event.entry.nickname}
      </div>
    );
  }
  if (event.entry.token === "correct") {
    return (
      <div key={event.id} className="pm-notice" data-kind="correct" data-mine={mine} data-testid="pm-notice" role="status">
        🎯 {mine ? "Hai indovinato!" : `${event.entry.nickname} ha indovinato!`}
      </div>
    );
  }
  return (
    <div key={event.id} className="pm-notice" data-kind="given" data-mine={mine} data-testid="pm-notice" role="status">
      {mine ? <>{t.icon} {t.label} <b>a te</b>!</> : <>{entryText(event.entry)}</>}
    </div>
  );
}

/** Telefono del Sindaco durante le domande: nomi e gettoni si abbinano trascinando o toccando. */
function MayorBoard({ v, me, send }: { v: PhoneView; me: Me; send: ControllerProps["send"] }) {
  const [pending, setPending] = useState<Assignment | null>(null);
  const assign = useCallback((a: Assignment) => {
    if (a.token === "correct") setPending(a);
    else send({ type: "give", playerId: a.playerId, token: a.token });
  }, [send]);
  const { bind, selected, drag } = useDragPair(assign);
  const others = v.players.filter((p) => p.id !== v.mayor.id);
  const dragLabel = drag ? (drag.item.kind === "player" ? (others.find((p) => p.id === drag.item.id)?.nickname ?? "") : `${tokenInfo(drag.item.id as Token).icon} ${tokenInfo(drag.item.id as Token).label}`) : "";
  const askName = pending ? (others.find((p) => p.id === pending.playerId)?.nickname ?? "") : "";

  return (
    <div className="pm-mayor" data-testid="pm-mayor">
      <div className="pm-names" data-count={others.length}>
        {others.map((p) => (
          <div key={p.id} className="pm-chip pm-name-chip" {...bind({ kind: "player", id: p.id }, false)}>
            <span>{p.nickname}</span>
            <Counts s={p.summary} />
          </div>
        ))}
      </div>
      <div className="pm-tokens">
        {TOKENS.map((t) => (
          <div key={t.id} className="pm-chip pm-token-chip" {...bind({ kind: "token", id: t.id }, !tokenAvailable(t.id, v.reserves))}>
            <span className="pm-token-icon">{t.icon}</span>
            <span>{t.label}</span>
          </div>
        ))}
      </div>
      {selected && <p className="muted pm-hint">Ora tocca {selected.kind === "player" ? "un gettone" : "un nome"}</p>}
      <button className="pm-undo" data-testid="pm-undo" disabled={!me.canUndo} onClick={() => send({ type: "undo" })}>
        ↶ Annulla{me.lastToken ? `: «${tokenInfo(me.lastToken.token).label} a ${me.lastToken.nickname}»` : ""}
      </button>
      <DragGhost drag={drag} label={dragLabel} />
      {pending && (
        <div className="pm-confirm" role="dialog" aria-label="Conferma Esatto" data-testid="pm-confirm">
          <p className="big">{askName} ha indovinato?</p>
          <div className="row">
            <button className="primary" onClick={() => { send({ type: "give", playerId: pending.playerId, token: "correct" }); setPending(null); }}>Sì</button>
            <button onClick={() => setPending(null)}>No</button>
          </div>
        </div>
      )}
    </div>
  );
}

function VoteButtons({ v, me, send, title }: { v: PhoneView; me: Me; send: ControllerProps["send"]; title: string }) {
  return (
    <div className="pm-vote" data-testid="pm-vote">
      <h3>{v.runoff ? `Ballottaggio: ${title}` : title}</h3>
      <div className="pm-vote-grid">
        {me.targets.map((t) => (
          <button key={t.id} className={me.myVote === t.id ? "primary" : ""} data-chosen={me.myVote === t.id} onClick={() => send({ type: "vote", targetId: t.id })}>
            {t.nickname}
          </button>
        ))}
      </div>
      <VoteInfo v={v} />
    </div>
  );
}

export function ParoleController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const me = v.me;
  const sfx = useSfx(theme);
  const event = useLogEvents(v.log);
  const [rules, setRules] = useState(false);
  const phase = v.phase;

  useEffect(() => {
    if (phase === "night") sfx("notify");
    if (phase === "seer-hunt" || phase === "werewolf-vote") sfx("reveal");
    if (phase === "reveal") sfx("fanfare");
  }, [phase, sfx]);

  if (!me) return <p className="big">Non sei in questa partita.</p>;
  const iAmMayor = me.isMayor;

  let body;
  if (phase === "deal") {
    body = <p className="big">{iAmMayor ? "Sei il Sindaco!" : `Il Sindaco è ${v.mayor.nickname}`}<br /><small className="muted">Si comincia a breve…</small></p>;
  } else if (phase === "word") {
    body = iAmMayor && me.wordOptions ? (
      <div className="pm-words" data-testid="pm-words">
        <h3>Scegli la parola segreta</h3>
        <Timer v={v} clock={clock} />
        {me.wordOptions.map((w, i) => (
          <button key={w} className="primary pm-word" onClick={() => send({ type: "pick-word", index: i })}>{w}</button>
        ))}
      </div>
    ) : (
      <p className="big">Il Sindaco sta scegliendo la parola…</p>
    );
  } else if (phase === "night") {
    body = (
      <div className="pm-night">
        <p className="big">È notte: guarda il tuo ruolo</p>
        <Timer v={v} clock={clock} />
        <button disabled={me.seen} onClick={() => send({ type: "seen" })}>{me.seen ? "Aspetto gli altri…" : "Ho visto"}</button>
      </div>
    );
  } else if (phase === "questions") {
    body = iAmMayor ? (
      <>
        <div className="pm-topbar"><Timer v={v} clock={clock} /><Reserves v={v} /></div>
        <MayorBoard v={v} me={me} send={send} />
      </>
    ) : (
      <>
        <div className="pm-topbar"><Timer v={v} clock={clock} /><Reserves v={v} /></div>
        <p className="muted">Fai le tue domande ad alta voce a <b>{v.mayor.nickname}</b></p>
        <History log={v.log} />
      </>
    );
  } else if (phase === "correct-grace") {
    body = (
      <div className="pm-correct">
        <h3>🎯 {v.correctBy} ha indovinato!</h3>
        {iAmMayor && <button data-testid="pm-undo" onClick={() => send({ type: "undo" })}>↶ Annulla l'Esatto</button>}
      </div>
    );
  } else if (phase === "seer-hunt") {
    body = me.canVote ? (
      <VoteButtons v={v} me={me} send={send} title="Chi è il Veggente?" />
    ) : (
      <p className="big">I Lupi cercano il Veggente…<br /><small className="muted">🐺 {(v.wolves ?? []).join(" · ")}</small></p>
    );
  } else if (phase === "werewolf-vote") {
    body = me.canVote ? (
      <VoteButtons v={v} me={me} send={send} title="Chi è il Lupo?" />
    ) : (
      <p className="big">Il ballottaggio è tra {(v.runoff ?? []).map((c) => c.nickname).join(" e ")}…</p>
    );
  } else {
    body = <Outcome v={v} />;
  }

  return (
    <div className="pm-ctrl" data-phase={phase} data-role={me.role ?? undefined} data-mayor={iAmMayor}>
      <div className="pm-head">
        <RoleBox me={me} word={me.word} />
        <button className="gf-info" data-testid="pm-rules" onClick={() => setRules(true)} aria-label="Regole">ℹ️</button>
      </div>
      {!iAmMayor && <Notice event={event} myId={me.id} />}
      {body}
      {rules && <RulesDialog v={v} me={me} onClose={() => setRules(false)} />}
    </div>
  );
}
