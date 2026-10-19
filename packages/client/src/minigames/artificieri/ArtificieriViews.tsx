import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSfx } from "../../audio/useAudio";
import type { ControllerProps, ViewProps } from "../types";
import { DefuserControls } from "./Controls";
import { Manual } from "./Manual";
import { BombTimer, EdgeworkBar, ModuleTv, Strikes } from "./parts";
import { rulesSections } from "./rulesText";
import type { Bet, CloseReason, HistoryEntry, Me, PhoneView, PublicView, ScreenView } from "./types";
import "./artificieri.css";

const REASON_TEXT: Record<CloseReason | "skipped", string> = {
  "all-solved": "tutti i moduli disinnescati",
  strikes: "troppi errori",
  time: "tempo scaduto",
  host: "fermata dalla regia",
  skipped: "turno saltato",
};

const teamVars = (v: PublicView): CSSProperties => ({ "--art-team": v.turn?.teamColor ?? "var(--accent)" }) as CSSProperties;
const lastResult = (v: PublicView): HistoryEntry | null => v.history.at(-1) ?? null;

// ---- Pezzi comuni ----

function Outcome({ v }: { v: PublicView }) {
  const e = lastResult(v);
  if (!e || e.outcome === "skipped") return <p className="big" data-testid="art-outcome">Turno saltato</p>;
  const won = e.outcome === "defused";
  return (
    <div className="art-outcome" data-testid="art-outcome" data-result={e.outcome}>
      <h2 className="question">{won ? "Bomba disinnescata!" : "BOOM! La bomba è esplosa"}</h2>
      <p className="big">
        {REASON_TEXT[e.reason]}
        {won && e.reason === "all-solved" ? ` · ${e.secondsLeft} s di anticipo` : ""}
      </p>
      <p>
        Moduli disinnescati: <b>{e.solved}</b> / {e.moduleCount} · errori <b>{e.strikes}</b> · <b>+{e.points}</b> punti alla squadra
      </p>
    </div>
  );
}

function BetResult({ v }: { v: PublicView }) {
  const e = lastResult(v);
  if (!e || e.outcome === "skipped" || e.betsDefused + e.betsExploded === 0) return null;
  return (
    <p className="art-bets" data-testid="art-bet-result">
      Scommesse: {e.betsDefused} «disinnescata» · {e.betsExploded} «esplode» ·{" "}
      {e.betWinners.length === 0 ? "nessuno ha indovinato" : <>hanno indovinato <b>{e.betWinners.map((p) => p.nickname).join(", ")}</b></>}
    </p>
  );
}

function Final({ v }: { v: PublicView }) {
  const rows = v.teams.map((t) => ({ t, entries: v.history.filter((h) => h.teamId === t.id) })).filter((r) => r.entries.length > 0);
  return (
    <div className="art-final" data-testid="art-final">
      <h2 className="question">Fine del round</h2>
      <ul>
        {rows.map(({ t, entries }) => (
          <li key={t.id} style={{ "--art-team": t.color } as CSSProperties}>
            <b>{t.name}</b>
            <span>{entries.map((e) => (e.outcome === "defused" ? "💚" : e.outcome === "exploded" ? "💥" : "⏭")).join(" ")}</span>
            <span>
              {entries.reduce((n, e) => n + e.solved, 0)} moduli · <b>{entries.reduce((n, e) => n + e.points, 0)}</b> punti
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Suoni: errore, modulo disinnescato, esito. */
function useBombSounds(v: PublicView, theme: ViewProps["theme"]) {
  const sfx = useSfx(theme);
  const strikes = v.status?.strikes ?? 0;
  const solved = v.status?.solved ?? 0;
  const prev = useRef({ strikes, solved, phase: v.phase });
  useEffect(() => {
    const p = prev.current;
    if (v.phase === p.phase) {
      if (strikes > p.strikes) sfx("wrong");
      else if (solved > p.solved) sfx("correct");
    } else if (v.phase === "outcome") sfx(lastResult(v)?.outcome === "defused" ? "fanfare" : "wrong");
    else if (v.phase === "bet" || v.phase === "defuse") sfx("start", 0.5);
    prev.current = { strikes, solved, phase: v.phase };
  }, [v.phase, strikes, solved, sfx]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---- Schermo condiviso ----

function TeamIntro({ v }: { v: PublicView }) {
  const t = v.turn!;
  return (
    <div className="art-intro" data-testid="art-intro">
      <p className="muted">
        Bomba {t.position + 1} di {t.total}
      </p>
      <h2 className="question">Squadra {t.teamName}</h2>
      <p className="big">
        🧨 Artificiere: <b data-testid="art-defuser">{t.defuser.nickname}</b>
      </p>
      <p>
        Esperti: {t.experts.length === 0 ? "—" : t.experts.map((p) => p.nickname).join(", ")}
      </p>
    </div>
  );
}

export function ArtificieriScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenView;
  useBombSounds(v, theme);
  const t = v.turn;
  const bomb = v.bomb;

  let body;
  if (v.phase === "final" || v.phase === "done") body = <Final v={v} />;
  else if (!t) body = <p className="big">Nessuna squadra in gioco</p>;
  else if (v.phase === "bet") {
    body = (
      <>
        <TeamIntro v={v} />
        <p className="big" data-testid="art-bet-wait">
          Scommettete dal telefono: la bomba sarà disinnescata? ({t.betsPlaced} / {t.bettors})
        </p>
      </>
    );
  } else if (v.phase === "briefing") {
    body = (
      <>
        <TeamIntro v={v} />
        <p className="art-warning big" data-testid="art-turn-back">🙈 Esperti: di spalle alla TV!</p>
        <p className="muted">{t.defuser.nickname} preme «Inizia» dal telefono quando siete pronti.</p>
      </>
    );
  } else {
    body = (
      <>
        <div className="art-topbar">
          <span className="art-team">
            Squadra <b>{t.teamName}</b> · artificiere <b>{t.defuser.nickname}</b>
          </span>
          {v.status && <BombTimer status={v.status} clock={clock} />}
          {v.status && <Strikes status={v.status} />}
        </div>
        {v.phase === "outcome" && <Outcome v={v} />}
        {bomb && (
          <div className="art-bomb" data-testid="art-bomb">
            <div className="art-modules" data-count={bomb.modules.length} style={{ "--n": bomb.modules.length } as CSSProperties}>
              {bomb.modules.map((m) => (
                <ModuleTv key={m.id} m={m} selected={bomb.selected === m.id} />
              ))}
            </div>
            <EdgeworkBar e={bomb.edgework} />
          </div>
        )}
        {v.phase === "outcome" ? <BetResult v={v} /> : <p className="art-warning" data-testid="art-turn-back">🙈 Esperti: di spalle alla TV!</p>}
      </>
    );
  }

  const result = v.phase === "outcome" ? (lastResult(v)?.outcome ?? undefined) : undefined;
  return (
    <div className="art-screen" data-phase={v.phase} data-outcome={result} data-paused={v.pausedRemainingMs !== null || undefined} style={teamVars(v)}>
      {body}
    </div>
  );
}

// ---- Telefono ----

function RulesDialog({ v, me, onClose }: { v: PhoneView; me: Me; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco" data-testid="art-rules-dialog">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(me.role, v.settings).map((s) => (
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

function Header({ v, me, clock, onRules }: { v: PhoneView; me: Me; clock: ControllerProps["clock"]; onRules: () => void }) {
  const role = me.role === "defuser" ? "Artificiere" : me.role === "expert" ? "Esperto" : "Scommettitore";
  return (
    <div className="art-head">
      <span className="art-me">
        {v.turn && me.role !== "bettor" && <b className="art-tag">{v.turn.teamName}</b>} {role}
      </span>
      {v.status && <BombTimer status={v.status} clock={clock} />}
      {v.status && <Strikes status={v.status} />}
      <button className="gf-info" data-testid="art-rules" onClick={onRules} aria-label="Regole">
        ℹ️
      </button>
    </div>
  );
}

function BetButtons({ me, send }: { me: Extract<Me, { role: "bettor" }>; send: ControllerProps["send"] }) {
  const opts: { id: Bet; label: string; icon: string }[] = [
    { id: "defused", label: "Disinnescata", icon: "💚" },
    { id: "exploded", label: "Esplode", icon: "💥" },
  ];
  return (
    <div className="art-bet" data-testid="art-bet">
      {opts.map((o) => (
        <button key={o.id} data-testid={`art-bet-${o.id}`} className={me.myBet === o.id ? "primary" : ""} aria-pressed={me.myBet === o.id} disabled={!me.canBet} onClick={() => send({ type: "bet", outcome: o.id })}>
          <span aria-hidden>{o.icon}</span> {o.label}
        </button>
      ))}
    </div>
  );
}

export function ArtificieriController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const me = v.me;
  const sfx = useSfx(theme);
  const [rules, setRules] = useState(false);
  useBombSounds(v, theme);
  useEffect(() => {
    if (me?.role === "defuser" && v.phase === "briefing") sfx("notify");
  }, [me?.role, v.phase, sfx]);

  if (!me) {
    return v.phase === "final" || v.phase === "done" ? (
      <div className="art-ctrl" data-phase={v.phase}>
        <Final v={v} />
      </div>
    ) : (
      <p className="big">Non sei in questa partita.</p>
    );
  }
  const t = v.turn;
  const result = v.phase === "outcome";

  let body;
  if (result) {
    body = (
      <>
        <Outcome v={v} />
        {me.role === "bettor" && me.myBet && (
          <p className="art-bets" data-testid="art-my-bet">
            Tu avevi scommesso «{me.myBet === "defused" ? "disinnescata" : "esplode"}»: {lastResult(v)?.outcome === me.myBet ? "indovinato! 🎉" : "peccato"}
          </p>
        )}
        <p className="muted">Aspetta la prossima squadra…</p>
      </>
    );
  } else if (me.role === "bettor") {
    body = (
      <>
        <p className="art-status" data-testid="art-status">
          {v.phase === "bet" ? `Tocca alla squadra ${t?.teamName}: scommetti sull'esito!` : v.phase === "briefing" ? `La squadra ${t?.teamName} si prepara…` : `La squadra ${t?.teamName} sta disinnescando: ${v.status?.solved ?? 0} / ${v.status?.moduleCount ?? 0} moduli`}
        </p>
        {v.phase === "bet" && <BetButtons me={me} send={send} />}
        {v.phase !== "bet" && me.myBet && <p className="muted">La tua scommessa: «{me.myBet === "defused" ? "disinnescata" : "esplode"}»</p>}
      </>
    );
  } else if (me.role === "defuser") {
    body =
      v.phase === "bet" ? (
        <p className="art-status" data-testid="art-status">Tocca a te! Gli altri stanno scommettendo sull'esito…</p>
      ) : v.phase === "briefing" ? (
        <div className="art-brief" data-testid="art-brief">
          <p className="big">Sei l'artificiere 🧨</p>
          <p>Guarda la TV e descrivi ai tuoi esperti ciò che vedi. Loro hanno il manuale e sono girati di spalle.</p>
          <button className="primary art-start" data-testid="art-start" disabled={!me.canStart} onClick={() => send({ type: "start" })}>
            Inizia!
          </button>
        </div>
      ) : (
        <DefuserControls controls={me.controls ?? []} selected={me.selected} send={send} />
      );
  } else {
    body =
      v.phase === "bet" ? (
        <p className="art-status" data-testid="art-status">Tra poco tocca a voi: {t?.defuser.nickname} sarà l'artificiere.</p>
      ) : (
        <>
          <p className="art-warning" data-testid="art-turn-back">🙈 Non guardare la TV! Parla con l'artificiere.</p>
          <Manual pages={me.manual} index={me.index} />
        </>
      );
  }

  return (
    <div className="art-ctrl" data-phase={v.phase} data-role={me.role} style={teamVars(v)}>
      <Header v={v} me={me} clock={clock} onRules={() => setRules(true)} />
      {body}
      {rules && <RulesDialog v={v} me={me} onClose={() => setRules(false)} />}
    </div>
  );
}
