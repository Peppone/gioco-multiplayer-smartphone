import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { ClockSync } from "@gioco/shared";
import { useSfx } from "../../audio/useAudio";
import { useRemaining } from "../Countdown";
import { clockText } from "../parole-mannare/tokens";
import type { ControllerProps, ViewProps } from "../types";
import { cardTextVars } from "./cardText";
import { rulesSections } from "./rulesText";
import type { CardKind, ClueCount, Me, PhoneView, PublicCard, PublicView, Side, TurnEndReason } from "./types";
import "./agenti.css";

// ---- Pezzi comuni ----

const initials = (nickname: string) => nickname.slice(0, 2);
const countText = (c: ClueCount) => (c === "inf" ? "∞" : String(c));
const KIND_LABEL: Record<CardKind, string> = { red: "agente rosso", blue: "agente blu", civilian: "civile", assassin: "assassino" };

/** Colori delle due squadre come variabili CSS: le carte e i pallini li usano senza colori fissi nel CSS. */
const teamColors = (v: PublicView): CSSProperties => ({ "--as-red": v.teams.red.color, "--as-blue": v.teams.blue.color }) as CSSProperties;

const END_TEXT: Record<TurnEndReason, string> = {
  pass: "ha passato",
  tie: "voto pari: nessuna carta scoperta",
  "no-votes": "nessun voto: nessuna carta scoperta",
  wrong: "carta sbagliata",
  limit: "tentativi finiti",
  "clue-timeout": "tempo scaduto per l'indizio",
  rejected: "indizio non valido",
  host: "turno chiuso dalla regia",
  "no-agents": "nessun agente per votare",
};

function Timer({ v, clock }: { v: Pick<PublicView, "phaseEndsAt" | "pausedRemainingMs">; clock: ClockSync }) {
  const left = useRemaining(v.phaseEndsAt ?? 0, clock);
  if (v.pausedRemainingMs !== null) return <span className="as-timer" data-paused="true">⏸ {clockText(v.pausedRemainingMs)}</span>;
  if (v.phaseEndsAt === null) return null;
  return <span className="as-timer">⏱ {clockText(left)}</span>;
}

function TeamTag({ v, side }: { v: PublicView; side: Side }) {
  return (
    <span className="as-tag" data-side={side}>
      {v.teams[side].name}
    </span>
  );
}

/** Indizio attivo con i tentativi; nella fase `clue` chi sta pensando. */
function ClueLine({ v }: { v: PublicView }) {
  if (v.phase === "clue") {
    return (
      <p className="as-clue-line" data-testid="as-thinking">
        Il Capo-spia <TeamTag v={v} side={v.turn} /> <b>{v.teams[v.turn].spymaster.nickname}</b> pensa a un indizio…
      </p>
    );
  }
  if (v.phase !== "guess" || !v.clue) return null;
  return (
    <p className="as-clue-line" data-testid="as-clue">
      <TeamTag v={v} side={v.clue.side} /> <span className="as-clue-word">«{v.clue.word}»</span> <b className="as-clue-count">{countText(v.clue.count)}</b>
      <small className="muted"> · {v.guessesLeft === null ? "carte a volontà" : `ancora ${v.guessesLeft}`}</small>
    </p>
  );
}

function LastEnd({ v }: { v: PublicView }) {
  if (!v.lastEnd || (v.phase !== "clue" && v.phase !== "guess")) return null;
  return (
    <p className="as-last muted" data-testid="as-last-end">
      {v.teams[v.lastEnd.side].name}: {END_TEXT[v.lastEnd.reason]}
    </p>
  );
}

/** Il tipo visibile di una carta: il suo, se scoperta o a fine partita; altrimenti dalla mappa del Capo-spia. */
const kindOf = (card: PublicCard, map: CardKind[] | undefined, i: number): CardKind | undefined => card.kind ?? map?.[i];

/**
 * La griglia. Una carta coperta senza mappa non ha `data-kind` nel DOM: il colore delle carte coperte non arriva
 * ai telefoni degli agenti, e la pagina non deve neppure suggerirlo.
 */
function Grid({
  v,
  map,
  hidden,
  onPick,
  myPick,
  me,
}: {
  v: PublicView;
  map?: CardKind[];
  hidden?: boolean;
  onPick?: (option: string) => void;
  myPick?: string | null;
  me?: string;
}) {
  const cols = v.rules.gridSize === "4x4" ? 4 : 5;
  const votes = new Map(v.votes.map((x) => [x.option, x.voters]));
  return (
    <div className="as-grid" data-testid="as-grid" data-hidden={hidden || undefined} style={{ "--cols": cols } as CSSProperties}>
      {v.cards.map((card, i) => {
        const kind = hidden && !card.revealed ? undefined : kindOf(card, map, i);
        const voters = votes.get(String(i)) ?? [];
        const props = {
          className: "as-card",
          "data-testid": "as-card",
          "data-revealed": card.revealed,
          "data-kind": kind,
          "data-last": v.lastReveal === i || undefined,
          "data-mine": myPick === String(i) || undefined,
          style: cardTextVars(card.word),
          "aria-label": `${card.word}${kind && (card.revealed || map) ? `, ${KIND_LABEL[kind]}` : ""}${card.revealed ? " (scoperta)" : ""}`,
        };
        const body = (
          <>
            <span className="as-word">{card.word}</span>
            {voters.length > 0 && (
              <span className="as-dots" data-testid="as-dots">
                {voters.map((p) => (
                  <i key={p.id} data-side={v.turn} data-me={p.id === me || undefined}>
                    {initials(p.nickname)}
                  </i>
                ))}
              </span>
            )}
          </>
        );
        return onPick && !card.revealed ? (
          <button key={i} {...props} onClick={() => onPick(String(i))}>
            {body}
          </button>
        ) : (
          <div key={i} {...props}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

function Outcome({ v }: { v: PublicView }) {
  const o = v.outcome;
  if (!o) return null;
  const reason =
    o.reason === "assassin" ? `${v.teams[o.winner === "red" ? "blue" : "red"].name} ha scoperto l'assassino!` : o.reason === "agents" ? "Tutti gli agenti trovati!" : o.reason === "turns" ? "Turni finiti" : "Partita chiusa dalla regia";
  return (
    <div className="as-outcome" data-testid="as-outcome" data-winner={o.winner}>
      <h2 className="question">{o.winner === "draw" ? "Pareggio!" : <>Vince la squadra {v.teams[o.winner].name}!</>}</h2>
      <p className="big">{reason}</p>
    </div>
  );
}

// ---- Schermo condiviso ----

function ScoreBar({ v, clock }: { v: PublicView; clock: ClockSync }) {
  return (
    <div className="as-topbar">
      {(["red", "blue"] as const).map((side) => (
        <span key={side} className="as-side" data-side={side} data-active={v.phase !== "reveal" && v.phase !== "done" && v.turn === side} data-testid={`as-left-${side}`}>
          {v.teams[side].name}: <b>{v.teams[side].agentsLeft}</b> da trovare
        </span>
      ))}
      <Timer v={v} clock={clock} />
    </div>
  );
}

function History({ v }: { v: PublicView }) {
  if (v.clues.length === 0) return null;
  return (
    <ol className="as-history" data-testid="as-history" aria-label="Indizi dati">
      {v.clues.map((c) => (
        <li key={c.seq} data-side={c.side} data-rejected={c.rejected || undefined}>
          {c.word}·{countText(c.count)}
        </li>
      ))}
    </ol>
  );
}

function SetupTeams({ v }: { v: PublicView }) {
  return (
    <div className="as-setup" data-testid="as-setup">
      {(["red", "blue"] as const).map((side) => (
        <section key={side} className="as-setup-team" data-side={side}>
          <h3>{v.teams[side].name}</h3>
          <p>
            🕶 Capo-spia: <b>{v.teams[side].spymaster.nickname}</b>
          </p>
          <ul>
            {v.teams[side].members
              .filter((p) => p.id !== v.teams[side].spymaster.id)
              .map((p) => (
                <li key={p.id}>{p.nickname}</li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function AgentiScreen({ view, clock, theme }: ViewProps) {
  const v = view as PublicView;
  const sfx = useSfx(theme);
  const revealedCount = v.cards.filter((c) => c.revealed).length;
  const prev = useRef(revealedCount);

  useEffect(() => {
    if (revealedCount > prev.current) {
      const last = v.lastReveal !== null ? v.cards[v.lastReveal] : undefined;
      sfx(last?.kind === "assassin" ? "wrong" : last?.kind === v.turn ? "correct" : "reveal");
    }
    prev.current = revealedCount;
  }, [revealedCount, v.lastReveal, v.cards, v.turn, sfx]);
  useEffect(() => {
    if (v.phase === "clue") sfx("start", 0.4);
    if (v.phase === "reveal") sfx("fanfare");
  }, [v.phase, v.turnNumber, sfx]);

  const assassin = v.outcome?.reason === "assassin";
  return (
    <div className="as-screen" data-phase={v.phase} data-assassin={assassin || undefined} style={teamColors(v)}>
      {v.blindBroken && <p className="as-warning" data-testid="as-blind-broken">⚠ La regia vede la mappa</p>}
      {v.phase === "setup" ? (
        <>
          <h2 className="question">Agenti Segreti</h2>
          <SetupTeams v={v} />
          <p className="big">I Capi-spia stanno per ricevere la mappa…</p>
        </>
      ) : (
        <>
          {v.phase === "reveal" || v.phase === "done" ? <Outcome v={v} /> : <ScoreBar v={v} clock={clock} />}
          <ClueLine v={v} />
          <LastEnd v={v} />
          <Grid v={v} />
          {v.phase === "guess" && (
            <p className="muted" data-testid="as-confirmed">
              {v.canPass && <>Passa: {v.votes.find((x) => x.option === "pass")?.voters.length ?? 0} · </>}
              Confermati {v.confirmed} / {v.voters}
            </p>
          )}
          <History v={v} />
        </>
      )}
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

const COUNTS: ClueCount[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, "inf"];

function ClueForm({ v, me, send }: { v: PhoneView; me: Me; send: ControllerProps["send"] }) {
  const [word, setWord] = useState("");
  const [count, setCount] = useState<ClueCount | null>(null);
  const clean = word.trim();
  const counts = COUNTS.filter((c) => v.rules.allowZeroInfinity || (c !== 0 && c !== "inf"));
  return (
    <form
      className="as-clue-form"
      data-testid="as-clue-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean && count !== null) send({ type: "clue", word: clean, count });
      }}
    >
      <div className="as-clue-row">
        <input aria-label="Il tuo indizio" data-testid="as-clue-input" value={word} maxLength={30} placeholder="Una parola" autoComplete="off" onChange={(e) => setWord(e.target.value)} />
        <button className="primary" type="submit" data-testid="as-clue-send" disabled={!clean || count === null}>Invia</button>
      </div>
      <div className="as-counts" role="group" aria-label="Quante carte">
        {counts.map((c) => (
          <button key={String(c)} type="button" className={count === c ? "primary" : ""} data-chosen={count === c} aria-pressed={count === c} onClick={() => setCount(c)}>
            {countText(c)}
          </button>
        ))}
      </div>
      {me.clueError && <p className="error" role="alert" data-testid="as-clue-error">{me.clueError}</p>}
    </form>
  );
}

function VotePanel({ v, me, send }: { v: PhoneView; me: Me; send: ControllerProps["send"] }) {
  const pick = (option: string) => send({ type: "pick", option: option === "pass" ? "pass" : Number(option) });
  const passVoters = v.votes.find((x) => x.option === "pass")?.voters ?? [];
  return (
    <>
      <Grid v={v} onPick={pick} myPick={me.myPick} me={me.id} />
      <div className="as-vote-row">
        {v.canPass && (
          <button className={me.myPick === "pass" ? "primary as-pass" : "as-pass"} data-testid="as-pass" data-mine={me.myPick === "pass" || undefined} onClick={() => pick("pass")}>
            ✋ Passa{passVoters.length > 0 ? ` (${passVoters.length})` : ""}
          </button>
        )}
        <button
          className={me.confirmed ? "as-confirm" : "primary as-confirm"}
          data-testid="as-confirm"
          data-confirmed={me.confirmed}
          disabled={me.confirmed}
          onClick={() => send({ type: "confirm" })}
        >
          {me.confirmed ? "✓ Confermato" : me.myPick === null ? "Conferma (nessuna scelta)" : "Conferma"}
        </button>
      </div>
      <small className="muted">
        Confermati {v.confirmed} / {v.voters}
        {me.confirmed ? " · tocca un'altra carta per cambiare" : ""}
      </small>
    </>
  );
}

export function AgentiController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const me = v.me;
  const sfx = useSfx(theme);
  const [rules, setRules] = useState(false);
  /** «Nascondi» del Capo-spia: copre la mappa con un tocco, per quando qualcuno si avvicina. */
  const [hidden, setHidden] = useState(false);
  const myTurn = !!me && me.side === v.turn;

  useEffect(() => {
    if (me?.canClue) sfx("notify");
  }, [me?.canClue, v.turnNumber, sfx]);
  useEffect(() => {
    if (v.phase === "guess" && myTurn && me?.role === "agent") sfx("notify", 0.5);
  }, [v.phase, v.clue?.word, myTurn, me?.role, sfx]);

  if (!me) return <p className="big">Non sei in questa partita.</p>;
  const spymaster = me.role === "spymaster";
  const side = me.side;
  const over = v.phase === "reveal" || v.phase === "done";

  let body;
  if (v.phase === "setup") {
    body = (
      <div className="as-wait" data-testid="as-role">
        {side && <p className="big">Sei nella squadra <TeamTag v={v} side={side} /></p>}
        <p>
          {spymaster ? "🕶 Sei il CAPO-SPIA: quando la regia distribuisce le carte vedrai la mappa segreta." : `Il tuo Capo-spia è ${side ? v.teams[side].spymaster.nickname : "—"}.`}
        </p>
      </div>
    );
  } else if (over) {
    body = (
      <>
        <Outcome v={v} />
        <Grid v={v} me={me.id} />
      </>
    );
  } else if (spymaster) {
    body = (
      <>
        {!me.canClue && <ClueLine v={v} />}
        <Grid v={v} map={me.map} hidden={hidden} me={me.id} />
        {me.canClue ? (
          <ClueForm key={v.turnNumber} v={v} me={me} send={send} />
        ) : (
          <p className="as-status" data-testid="as-status">{myTurn ? "La tua squadra vota: non dire niente e non fare facce! 😶" : `Tocca ai ${v.teams[v.turn].name}…`}</p>
        )}
      </>
    );
  } else if (me.canVote) {
    body = (
      <>
        <ClueLine v={v} />
        <VotePanel v={v} me={me} send={send} />
      </>
    );
  } else {
    body = (
      <>
        <ClueLine v={v} />
        <Grid v={v} me={me.id} />
        <p className="as-status" data-testid="as-status">{myTurn ? (v.phase === "clue" ? "Il tuo Capo-spia pensa a un indizio…" : "Aspetta…") : `Tocca ai ${v.teams[v.turn].name}…`}</p>
      </>
    );
  }

  return (
    <div className="as-ctrl" data-phase={v.phase} data-role={me.role} data-side={side ?? undefined} style={teamColors(v)}>
      <div className="as-head">
        <span className="as-me">
          {side && <TeamTag v={v} side={side} />}
          {spymaster && <b> · Capo-spia</b>}
        </span>
        {v.phase !== "setup" && !over && (
          <span className="as-left" data-testid="as-agents-left">
            {side ? `${v.teams[side].agentsLeft} da trovare` : ""}
          </span>
        )}
        <Timer v={v} clock={clock} />
        {spymaster && me.map && !over && (
          <button className="as-hide" data-testid="as-hide" aria-pressed={hidden} onClick={() => setHidden((h) => !h)}>
            {hidden ? "👁 Mostra" : "🙈 Nascondi"}
          </button>
        )}
        <button className="gf-info" data-testid="as-rules" onClick={() => setRules(true)} aria-label="Regole">ℹ️</button>
      </div>
      {body}
      {rules && <RulesDialog v={v} me={me} onClose={() => setRules(false)} />}
    </div>
  );
}
