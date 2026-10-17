import { useEffect, useState } from "react";
import type { ClockSync } from "@gioco/shared";
import { useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
import { Countdown } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";
import { type Costs, rulesSections } from "./rulesText";
import "./shadow-tournament.css";

type Card = "attack" | "defense" | "trick";
type Status = "W" | "L" | "out";
type Action = "shield" | "trap" | "swap";
type BoutPhase = "extraLife" | "choose" | "react" | "counter" | "show" | "reward" | "risk" | "done";

interface SideView {
  id: string;
  nickname: string;
  status: Status;
  tokens: number;
  lives: number;
  extraLife: boolean;
  blocked: Card | null;
  picked: boolean;
  reacted: boolean;
}

interface BoutView {
  id: string;
  phase: BoutPhase;
  openedAt: number;
  deadline: number;
  exchanges: number;
  sides: [SideView, SideView];
  npcPlayer: string | null;
  reveal: { cards: Record<string, Card>; bets: Record<string, boolean>; winnerId: string | null } | null;
  waitingReact: number;
  swapBy: string | null;
  counterBy: string | null;
  last: { cards: Record<string, Card>; winnerId: string | null; loss: number; shielded: boolean; replay: boolean; actions: Record<string, Action | "counter"> } | null;
  winnerId: string | null;
  loserId: string | null;
  reward: { deck: "normal" | "legendary"; label: string; tokens: number; nextLives: number } | null;
  spotlight: boolean;
}

interface FighterView {
  id: string;
  nickname: string;
  status: Status;
  tokens: number;
  boutsWon: number;
}

interface PodiumRow {
  id: string;
  nickname: string;
  rank: number;
  points: number;
  boutsWon: number;
}

interface ScreenData {
  phase: "bye" | "bouts" | "pause" | "done";
  turn: number;
  paused: boolean;
  openedAt: number;
  deadline: number;
  alive: number;
  total: number;
  fighters: FighterView[];
  bye: { id: string; nickname: string; choice: "bye" | "npc" | null } | null;
  bouts: BoutView[];
  focusId: string | null;
  podium: PodiumRow[] | null;
}

interface Mine {
  pick: { card: Card; bet: boolean } | null;
  canBet: boolean;
  blockedCard: Card | null;
  canExtraLife: boolean;
  extraDecided: boolean | null;
  reactions: Action[];
  swapCards: Card[];
  reacted: boolean;
  canCounter: boolean;
  counterCost: number;
  wonBout: boolean | null;
  canChooseDeck: boolean;
  riskChoice: { tokens: number; nextLives: number; canPayTokens: boolean } | null;
}

interface PhoneBase {
  phase: ScreenData["phase"];
  turn: number;
  openedAt: number;
  deadline: number;
  alive: number;
  total: number;
  costs: Costs;
  maxTokens: number;
}
interface MeView {
  id: string;
  nickname: string;
  status: Status;
  tokens: number;
  nextLives: number;
  boutsWon: number;
  hits: number;
}
type PhoneData = PhoneBase &
  (
    | { role: "spectator" }
    | { role: "bye"; me: MeView }
    | { role: "wait"; me: MeView; byeNow: "bye" | "npc" | null; bye: { id: string; nickname: string } | null }
    | { role: "out"; me: MeView; spotlight: BoutView | null; canPredict: boolean; prediction: string | null }
    | { role: "done"; me: MeView; podium: PodiumRow[]; myRank: number | null; myPoints: number }
    | { role: "bout"; me: MeView; asNpc: boolean; mySide: string; opponentId: string; bout: BoutView; my: Mine }
  );

const CARD_LABEL: Record<Card, string> = { attack: "Attacco", defense: "Difesa", trick: "Raggiro" };
const CARD_ICON: Record<Card, string> = { attack: "⚔️", defense: "🛡️", trick: "🎭" };
const ACTION_LABEL: Record<Action | "counter", string> = { shield: "Scudo", trap: "Trappola", swap: "Cambia carta", counter: "Contromossa" };
const CARDS: Card[] = ["attack", "defense", "trick"];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sideOf = (b: BoutView, id: string) => b.sides.find((s) => s.id === id)!;

function Hearts({ n }: { n: number }) {
  return <span className="sh-hearts" aria-label={plural(n, "vita", "vite")}>{n > 0 ? "♥".repeat(n) : "—"}</span>;
}

function StatusBadge({ status }: { status: Status }) {
  return <b className={`sh-badge sh-${status}`}>{status === "out" ? "OUT" : status}</b>;
}

function CardFace({ card, label }: { card: Card; label?: string }) {
  return (
    <span className={`sh-card sh-card-${card}`}>
      <span className="sh-card-icon" aria-hidden>{CARD_ICON[card]}</span>
      {label ?? CARD_LABEL[card]}
    </span>
  );
}

/** Frase che racconta l'ultimo scambio concluso. */
function lastSentence(b: BoutView): string | null {
  const l = b.last;
  if (!l) return null;
  const used = Object.entries(l.actions).map(([id, a]) => `${sideOf(b, id).nickname}: ${ACTION_LABEL[a]}`);
  const extra = used.length > 0 ? ` (${used.join(", ")})` : "";
  if (l.replay) return `Annullato! Si rigioca lo scambio${extra}`;
  if (l.winnerId === null) return `Pareggio: si rigioca${extra}`;
  const loser = b.sides.find((s) => s.id !== l.winnerId)!;
  const w = l.cards[l.winnerId]!;
  const lo = l.cards[loser.id]!;
  const outcome = l.shielded ? `${loser.nickname} si salva con lo Scudo` : `${loser.nickname} perde ${plural(l.loss, "vita", "vite")}`;
  return `${CARD_LABEL[w]} batte ${CARD_LABEL[lo]}: ${outcome}${extra}`;
}

function phaseText(b: BoutView): string {
  const [x, y] = b.sides;
  switch (b.phase) {
    case "extraLife":
      return "Chi spende un token per una vita in più?";
    case "choose":
      return "Scelgono la carta…";
    case "react":
      return b.waitingReact > 0 ? "Reazioni in corso…" : "Reazioni";
    case "counter":
      return `${sideOf(b, b.swapBy ?? x.id).nickname} cambia carta! ${sideOf(b, b.counterBy ?? y.id).nickname} può annullare`;
    case "show":
      return lastSentence(b) ?? "";
    case "reward":
      return `${sideOf(b, b.winnerId!).nickname} vince lo scontro e sceglie il mazzo`;
    case "risk":
      return `${sideOf(b, b.winnerId!).nickname} ha pescato una carta a scelta`;
    case "done":
      return `${sideOf(b, b.winnerId!).nickname} vince lo scontro`;
  }
}

function RewardLine({ b }: { b: BoutView }) {
  if (!b.reward) return null;
  const r = b.reward;
  const parts = [r.tokens !== 0 && `${r.tokens > 0 ? "+" : ""}${r.tokens} token`, r.nextLives !== 0 && `${r.nextLives > 0 ? "+" : ""}${r.nextLives} vite nel prossimo scontro`].filter(Boolean);
  return (
    <p className={`sh-reward sh-reward-${r.deck}`}>
      {r.deck === "legendary" ? "Leggendario" : "Normale"}: <b>{r.label}</b>{parts.length > 0 && ` (${parts.join(", ")})`}
    </p>
  );
}

// ---------- schermo ----------

function Fighter({ s, b, big }: { s: SideView; b: BoutView; big?: boolean }) {
  const cards = b.reveal?.cards ?? b.last?.cards;
  const card = cards?.[s.id];
  const bet = b.reveal?.bets[s.id];
  const lost = b.loserId === s.id;
  return (
    <div className={`sh-side ${big ? "big" : ""} ${lost ? "lost" : ""} ${b.winnerId === s.id ? "won" : ""}`}>
      <div className="sh-name">{s.nickname} <StatusBadge status={s.status} /></div>
      <Hearts n={s.lives} />
      <div className="sh-tokens" aria-label={plural(s.tokens, "token", "token")}>{"●".repeat(s.tokens) || "○"}</div>
      {b.phase === "choose" && <div className="sh-picked">{s.picked ? "ha scelto ✓" : "…"}</div>}
      {b.phase === "react" && <div className="sh-picked">{s.reacted ? "ha risposto ✓" : ""}</div>}
      {card && (b.phase === "react" || b.phase === "counter" || b.phase === "show") && <CardFace card={card} />}
      {bet && <div className="sh-bet">Scommessa!</div>}
      {s.blocked && b.phase === "choose" && <div className="sh-blocked">Non può usare: {CARD_LABEL[s.blocked]}</div>}
    </div>
  );
}

function FocusBout({ b, clock, theme }: { b: BoutView; clock: ClockSync; theme: ViewProps["theme"] }) {
  const sfx = useSfx(theme);
  const sentence = b.phase === "show" ? lastSentence(b) : null;
  useEffect(() => {
    if (b.phase === "react" || b.phase === "show") sfx("reveal");
    if (b.phase === "done") sfx("fanfare");
  }, [b.phase, b.exchanges, b.id, sfx]);
  const timed = b.phase !== "show" && b.phase !== "done";
  return (
    <section className="sh-focus" aria-label="Scontro in evidenza">
      <Sfx theme={theme} text="VS!" trigger={b.id} />
      <div className="sh-versus">
        <Fighter s={b.sides[0]} b={b} big />
        <div className="sh-vs">VS</div>
        <Fighter s={b.sides[1]} b={b} big />
      </div>
      <p className="sh-phase">{phaseText(b)}</p>
      {b.npcPlayer && <p className="muted">L'NPC è interpretato da {b.npcPlayer}</p>}
      {timed && <Countdown openedAt={b.openedAt} deadline={b.deadline} clock={clock} />}
      {sentence && <span className="sh-sr" role="status">{sentence}</span>}
      <RewardLine b={b} />
    </section>
  );
}

function MiniBout({ b }: { b: BoutView }) {
  const [x, y] = b.sides;
  return (
    <li className={`sh-mini ${b.phase === "done" ? "done" : ""}`}>
      <span className="sh-mini-side">{x.nickname} <Hearts n={x.lives} /></span>
      <span className="sh-mini-vs">vs</span>
      <span className="sh-mini-side">{y.nickname} <Hearts n={y.lives} /></span>
      {b.phase === "done" && <b className="sh-mini-win">→ {sideOf(b, b.winnerId!).nickname}</b>}
    </li>
  );
}

function Podium({ rows }: { rows: PodiumRow[] }) {
  return (
    <div className="sh-podium">
      <h2>Podio</h2>
      <ol>
        {rows.slice(0, 3).map((r) => (
          <li key={r.id} className={`sh-place sh-place-${r.rank}`}>
            <span className="sh-rank">{r.rank}°</span>
            <b>{r.nickname}</b>
            <span>{r.points} punti</span>
          </li>
        ))}
      </ol>
      {rows.length > 3 && (
        <ol className="sh-rest" start={4}>
          {rows.slice(3).map((r) => <li key={r.id}>{r.nickname} <span className="muted">{r.points}</span></li>)}
        </ol>
      )}
    </div>
  );
}

export function ShadowTournamentScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenData;
  const sfx = useSfx(theme);
  useEffect(() => {
    if (v.phase === "done") sfx("fanfare");
    else if (v.phase === "bye" || v.phase === "pause") sfx("start");
  }, [v.phase, v.turn, sfx]);

  if (v.phase === "done" && v.podium) return <div className="sh-screen"><Podium rows={v.podium} /></div>;

  const focus = v.bouts.find((b) => b.id === v.focusId) ?? null;
  const others = v.bouts.filter((b) => b.id !== v.focusId);
  return (
    <div className="sh-screen">
      <header className="sh-head">
        <span>Turno {v.turn}</span>
        <span>In gioco: {v.alive} / {v.total}</span>
        {v.paused && <b className="sh-paused">IN PAUSA</b>}
      </header>
      {v.phase === "bye" && v.bye && (
        <div className="sh-bye">
          <p className="big">{v.bye.nickname} è rimasto solo: Bye o NPC?</p>
          <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />
        </div>
      )}
      {focus && <FocusBout b={focus} clock={clock} theme={theme} />}
      {others.length > 0 && <ul className="sh-bouts" aria-label="Altri scontri">{others.map((b) => <MiniBout key={b.id} b={b} />)}</ul>}
      {v.phase === "pause" && (
        <div className="sh-pause">
          <p className="big">Fine del turno {v.turn}</p>
          <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />
        </div>
      )}
      <ul className="sh-board" aria-label="Giocatori">
        {v.fighters.map((f) => (
          <li key={f.id} className={f.status === "out" ? "out" : ""}>
            {f.nickname} <StatusBadge status={f.status} />
            {f.status !== "out" && <span className="sh-board-tokens">{"●".repeat(f.tokens)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- telefono ----------

function RulesDialog({ costs, maxTokens, onClose }: { costs: Costs; maxTokens: number; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(costs, maxTokens).map((s) => (
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

function Wait({ children }: { children: React.ReactNode }) {
  return <p className="muted sh-wait">{children}</p>;
}

function BoutController({ v, send, clock, theme }: { v: Extract<PhoneData, { role: "bout" }>; send: ControllerProps["send"]; clock: ClockSync; theme: ViewProps["theme"] }) {
  const { bout: b, my, me } = v;
  const sfx = useSfx(theme);
  const [bet, setBet] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const mine = sideOf(b, v.mySide);
  const theirs = sideOf(b, v.opponentId);
  const cards = b.reveal?.cards ?? b.last?.cards;

  useEffect(() => {
    setBet(false);
    setSwapOpen(false);
  }, [b.phase, b.exchanges, b.id]);
  useEffect(() => {
    if (b.phase === "done" && my.wonBout !== null) sfx(my.wonBout ? "correct" : "wrong");
  }, [b.phase, my.wonBout, sfx]);

  const pick = (card: Card, withBet = bet) => send({ type: "play", card, bet: withBet });
  const timed = !["show", "done"].includes(b.phase);
  const result = b.reveal
    ? b.reveal.winnerId === null ? "Pareggio" : b.reveal.winnerId === v.mySide ? "Hai vinto lo scambio" : "Hai perso lo scambio"
    : null;

  return (
    <div className="sh-ctrl">
      <div className="sh-lives">
        <div><small>Tu</small> <Hearts n={mine.lives} /></div>
        <div><small>{theirs.nickname}</small> <Hearts n={theirs.lives} /></div>
      </div>
      {timed && <Countdown openedAt={b.openedAt} deadline={b.deadline} clock={clock} />}
      {v.asNpc && <p className="sh-npc">Tocca a te fare l'NPC! Gioca per divertimento: non guadagni né perdi nulla.</p>}

      {b.phase === "extraLife" &&
        (my.canExtraLife ? (
          <div className="sh-actions">
            <p>Spendi 1 token per partire con una vita in più?</p>
            <button className="primary" onClick={() => send({ type: "extraLife", spend: true })}>Sì, 1 token → {mine.lives + 1} vite</button>
            <button onClick={() => send({ type: "extraLife", spend: false })}>No, grazie</button>
          </div>
        ) : my.extraDecided !== null ? (
          <Wait>Scelta inviata, aspetta l'avversario…</Wait>
        ) : (
          <Wait>Lo scontro sta per iniziare…</Wait>
        ))}

      {b.phase === "choose" && (
        <>
          <p>{my.pick ? "Carta scelta: puoi ancora cambiarla" : "Scegli la tua carta"}</p>
          <div className="sh-hand">
            {CARDS.map((c) => (
              <button
                key={c}
                className={`sh-handcard sh-card-${c} ${my.pick?.card === c ? "chosen" : ""}`}
                disabled={my.blockedCard === c}
                onClick={() => pick(c)}
              >
                <span className="sh-card-icon" aria-hidden>{CARD_ICON[c]}</span>
                {CARD_LABEL[c]}
                {my.blockedCard === c && <small>Bloccata dalla Trappola</small>}
              </button>
            ))}
          </div>
          {my.canBet && (
            <label className="sh-bet-toggle">
              <input
                type="checkbox"
                checked={my.pick ? my.pick.bet : bet}
                onChange={(e) => {
                  setBet(e.target.checked);
                  if (my.pick) pick(my.pick.card, e.target.checked);
                }}
              />
              Scommessa ({v.costs.bet} token): se vinci toglie una vita in più
            </label>
          )}
          {my.pick && <Wait>Aspetta l'avversario…</Wait>}
        </>
      )}

      {(b.phase === "react" || b.phase === "counter") && cards && (
        <div className="sh-reveal">
          <div className="sh-reveal-cards">
            <CardFace card={cards[v.mySide]!} label={`Tu: ${CARD_LABEL[cards[v.mySide]!]}`} />
            <CardFace card={cards[v.opponentId]!} label={`${theirs.nickname}: ${CARD_LABEL[cards[v.opponentId]!]}`} />
          </div>
          {result && <p className="big">{result}</p>}
        </div>
      )}

      {b.phase === "react" &&
        (my.reacted ? (
          <Wait>Reazione inviata, aspetta…</Wait>
        ) : my.reactions.length > 0 ? (
          <div className="sh-actions">
            {my.reactions.includes("shield") && (
              <button className="primary" onClick={() => send({ type: "react", action: "shield" })}>Scudo ({v.costs.shield} token): non perdi la vita</button>
            )}
            {my.reactions.includes("trap") && (
              <button onClick={() => send({ type: "react", action: "trap" })}>Trappola ({v.costs.trap} token): blocca la sua carta</button>
            )}
            {my.reactions.includes("swap") && !swapOpen && <button onClick={() => setSwapOpen(true)}>Cambia carta ({v.costs.swap} token)</button>}
            {swapOpen && (
              <div className="sh-hand">
                {my.swapCards.map((c) => (
                  <button key={c} className={`sh-handcard sh-card-${c}`} onClick={() => send({ type: "react", action: "swap", card: c })}>
                    <span className="sh-card-icon" aria-hidden>{CARD_ICON[c]}</span>
                    {CARD_LABEL[c]}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => send({ type: "react", action: "pass" })}>Niente</button>
          </div>
        ) : (
          <Wait>Nessuna reazione possibile…</Wait>
        ))}

      {b.phase === "counter" &&
        (my.canCounter ? (
          <div className="sh-actions">
            <p>{sideOf(b, b.swapBy!).nickname} ha usato Cambia carta!</p>
            <button className="primary" onClick={() => send({ type: "react", action: "counter" })}>Annulla e rigioca ({my.counterCost} token)</button>
            <button onClick={() => send({ type: "react", action: "pass" })}>Lascia stare</button>
          </div>
        ) : (
          <Wait>{b.swapBy === v.mySide ? "Hai cambiato carta: l'avversario può annullare…" : "Si decide la contromossa…"}</Wait>
        ))}

      {b.phase === "show" && (
        <div className="sh-reveal">
          {cards && (
            <div className="sh-reveal-cards">
              <CardFace card={cards[v.mySide]!} label={`Tu: ${CARD_LABEL[cards[v.mySide]!]}`} />
              <CardFace card={cards[v.opponentId]!} label={`${theirs.nickname}: ${CARD_LABEL[cards[v.opponentId]!]}`} />
            </div>
          )}
          <p className="big">{lastSentence(b)}</p>
        </div>
      )}

      {b.phase === "reward" &&
        (my.canChooseDeck ? (
          <div className="sh-actions">
            <p className="big">Hai vinto lo scontro! Da quale mazzo peschi?</p>
            <button className="primary" onClick={() => send({ type: "deck", deck: "normal" })}>Normale: sicuro, rende poco</button>
            <button onClick={() => send({ type: "deck", deck: "legendary" })}>Leggendario: rende di più, rischia di più</button>
          </div>
        ) : (
          <Wait>{b.winnerId === v.opponentId ? `${theirs.nickname} ha vinto lo scontro e pesca la ricompensa…` : "Scontro concluso."}</Wait>
        ))}

      {b.phase === "risk" &&
        (my.riskChoice ? (
          <div className="sh-actions">
            <p className="big">{b.reward?.label}: scegli</p>
            <button className="primary" disabled={!my.riskChoice.canPayTokens} onClick={() => send({ type: "riskChoice", pay: "tokens" })}>
              {my.riskChoice.tokens} token
            </button>
            <button onClick={() => send({ type: "riskChoice", pay: "life" })}>{plural(Math.abs(my.riskChoice.nextLives), "vita", "vite")} in meno nel prossimo scontro</button>
          </div>
        ) : (
          <Wait>Pesca in corso…</Wait>
        ))}

      {b.phase === "done" && (
        <div className="sh-result">
          <p className="big">
            {v.asNpc ? "Scontro concluso" : my.wonBout ? "Hai vinto lo scontro!" : "Hai perso lo scontro"}
          </p>
          {!v.asNpc && !my.wonBout && <p>Ora sei <StatusBadge status={me.status} />{me.status === "out" && ": sei eliminato, ma puoi ancora pronosticare e fare l'NPC"}</p>}
          <RewardLine b={b} />
          <Wait>Aspetta la fine del turno…</Wait>
        </div>
      )}
    </div>
  );
}

export function ShadowTournamentController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneData;
  const [rules, setRules] = useState(false);

  let body: React.ReactNode;
  if (v.role === "spectator") body = <Wait>Il torneo è già iniziato: guardi dallo schermo.</Wait>;
  else if (v.role === "bye")
    body = (
      <div className="sh-actions">
        <p className="big">Sei rimasto solo!</p>
        <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />
        <button className="primary" onClick={() => send({ type: "byeChoice", choice: "bye" })}>Bye: salto il turno senza rischi</button>
        <button onClick={() => send({ type: "byeChoice", choice: "npc" })}>NPC: affronto un avversario, se vinco pesco una ricompensa</button>
      </div>
    );
  else if (v.role === "wait")
    body = (
      <div className="sh-ctrl">
        <p className="big">{v.byeNow === "bye" ? "Hai il Bye: salti il turno" : "Aspetta il prossimo turno"}</p>
        {v.phase === "pause" && <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />}
        {v.bye && v.bye.id !== v.me.id && <Wait>{v.bye.nickname} sceglie tra Bye e NPC…</Wait>}
      </div>
    );
  else if (v.role === "out") {
    const spot = v.spotlight;
    body = (
      <div className="sh-ctrl">
        <p className="big">Sei eliminato</p>
        {spot && v.canPredict ? (
          <div className="sh-actions">
            <p>Chi vince lo scontro in evidenza? Pronostico giusto = punti!</p>
            {spot.sides.map((s) => (
              <button key={s.id} className={v.prediction === s.id ? "primary" : ""} onClick={() => send({ type: "predict", winnerId: s.id })}>
                {s.nickname} <Hearts n={s.lives} />
              </button>
            ))}
          </div>
        ) : v.prediction ? (
          <Wait>Pronostico inviato. Pronostici giusti: {v.me.hits}</Wait>
        ) : (
          <Wait>Guarda lo schermo: se ti estraggono farai l'NPC.</Wait>
        )}
      </div>
    );
  } else if (v.role === "done")
    body = (
      <div className="sh-ctrl">
        <p className="big">{v.myRank === 1 ? "Hai vinto il torneo! 🏆" : `Sei arrivato ${v.myRank}°`}</p>
        <p>{v.myPoints} punti · {plural(v.me.boutsWon, "scontro vinto", "scontri vinti")}</p>
      </div>
    );
  else body = <BoutController v={v} send={send} clock={clock} theme={theme} />;

  const me = "me" in v ? v.me : null;
  return (
    <div className="sh-phone">
      {me && (
        <header className="sh-me">
          <span>{me.nickname} <StatusBadge status={me.status} /></span>
          <span className="sh-tokens" aria-label={plural(me.tokens, "token", "token")}>● {me.tokens}/{"maxTokens" in v ? v.maxTokens : 5}</span>
          {me.nextLives !== 0 && <span className="muted">prossimo scontro: {me.nextLives > 0 ? "+" : ""}{me.nextLives} vite</span>}
          <button className="sh-help" aria-label="Regole" onClick={() => setRules(true)}>?</button>
        </header>
      )}
      {body}
      {rules && <RulesDialog costs={v.costs} maxTokens={v.maxTokens} onClose={() => setRules(false)} />}
    </div>
  );
}
