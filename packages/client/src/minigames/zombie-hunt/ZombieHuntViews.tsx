import { useEffect } from "react";
import { useSfx } from "../../audio/useAudio";
import { Countdown } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";

type Role = "human" | "zombie" | "out";
interface Card {
  suit: number;
  value: number;
}
type Choice = ({ kind: "card" } & Card) | { kind: "shotgun" } | { kind: "vaccine" } | { kind: "bite" };

const SUIT_GLYPH = ["♠", "♥", "♦", "♣"];
const SUIT_NAME = ["Picche", "Cuori", "Quadri", "Fiori"];
const isRed = (suit: number) => suit === 1 || suit === 2;
const cardText = (c: Card) => `${c.value}${SUIT_GLYPH[c.suit] ?? "?"}`;
const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.value === b.value;

function SuitBadge({ suit, label }: { suit: number; label: string }) {
  return (
    <span className={`zh-suit ${isRed(suit) ? "red" : ""}`} data-suit={suit} aria-label={`${label}: ${SUIT_NAME[suit]}`}>
      {SUIT_GLYPH[suit]}
    </span>
  );
}
type Outcome = "win" | "lose" | "draw" | "bye" | "bitten" | "bit" | "shot" | "killed" | "cure" | "healed" | "quiet";

interface Summary {
  infected: number;
  shot: number;
  cured: number;
  eliminated: number;
}
interface ScreenPlay {
  phase: "play" | "reveal";
  round: number;
  rounds: number;
  openedAt: number;
  deadline: number;
  suit: number;
  nextSuit: number | null;
  alive: number;
  total: number;
  chosen: number;
  summary?: Summary;
}
interface ScreenDone {
  phase: "done";
  winner: "humans" | "zombies" | "draw" | null;
  humans: number;
  zombies: number;
  players: { id: string; nickname: string; role: Role; points: number }[];
}
interface PlayerEvent {
  outcome: Outcome;
  opponent: string | null;
  mine: Choice | null;
  theirs: Choice | null;
  card: Card | null;
  count: number;
  points: number;
}
interface PlayerPlay {
  phase: "play" | "reveal";
  round: number;
  rounds: number;
  openedAt: number;
  deadline: number;
  suit: number;
  nextSuit: number | null;
  role: Role;
  cards: Card[];
  shotgun: boolean;
  vaccine: boolean;
  opponent: string | null;
  bye: boolean;
  choice: Choice | null;
  points: number;
  event?: PlayerEvent | null;
}
interface PlayerDone {
  phase: "done";
  role: Role;
  winner: "humans" | "zombies" | "draw" | null;
  points: number;
}

const choiceLabel = (c: Choice | null) => (!c ? "—" : c.kind === "card" ? cardText(c) : c.kind === "shotgun" ? "🔫" : c.kind === "bite" ? "🧟" : "💉");

function eventText(e: PlayerEvent): string {
  const who = e.opponent ?? "";
  switch (e.outcome) {
    case "win": {
      const miss = e.theirs && e.theirs.kind !== "card";
      const cards = e.count > 1 ? `${e.count} carte` : `la sua carta (${e.card ? cardText(e.card) : "?"})`;
      return miss ? `${who} ti ha sparato a vuoto: non eri uno zombie! Prendi ${cards}.` : `Hai battuto ${who} e preso ${cards}!`;
    }
    case "lose": {
      const miss = e.mine && e.mine.kind !== "card";
      const cards = e.count > 1 ? `${e.count} carte` : `la carta (${e.card ? cardText(e.card) : "?"})`;
      return miss ? `A vuoto! ${who} non era uno zombie: cedi ${cards}.` : `${who} ti ha battuto e ti ha preso ${cards}.`;
    }
    case "draw":
      return e.mine && e.mine.kind !== "card" ? `Colpo a vuoto da entrambi: vi scambiate ${e.count} carte.` : `Pareggio con ${who}.`;
    case "bye":
      return "Turno di riposo: nessuno sfidante.";
    case "bitten":
      return `${who} era uno ZOMBIE! Sei stato infettato…`;
    case "bit":
      return `Hai infettato ${who}! 🧟`;
    case "shot":
      return `Zombie abbattuto: ${who}! Colpo di fucile!`;
    case "killed":
      return `${who} ti ha sparato. Sei fuori dai giochi.`;
    case "cure":
      return `${who} era uno zombie: l'hai curato con il vaccino!`;
    case "healed":
      return `${who} ti ha curato: sei di nuovo umano!`;
    case "quiet":
      return `${who} è uno zombie come te. Nessun morso.`;
  }
}

const GOOD: Outcome[] = ["win", "bit", "shot", "cure", "healed"];
const BAD: Outcome[] = ["lose", "bitten", "killed"];

export function ZombieHuntScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenPlay | ScreenDone;
  const sfx = useSfx(theme);
  const phase = v.phase;
  const round = v.phase === "done" ? -1 : v.round;

  useEffect(() => {
    if (round >= 0) sfx("start", 0.35);
  }, [round, sfx]);
  useEffect(() => {
    if (phase === "reveal") sfx("reveal");
    if (phase === "done") sfx("fanfare");
  }, [phase, round, sfx]);

  if (v.phase === "done") {
    const title = v.winner === "humans" ? "Vincono gli UMANI!" : v.winner === "zombies" ? "Vincono gli ZOMBIE!" : "Pareggio!";
    const order = [...v.players].sort((a, b) => b.points - a.points);
    return (
      <div className="zh-screen">
        <h2 className="question">{title}</h2>
        <p className="muted">Sopravvissuti: {v.humans} umani · {v.zombies} zombie</p>
        <ul className="zh-roles">
          {order.map((p) => (
            <li key={p.id} className={`zh-role zh-${p.role}`}>
              <span>{p.role === "zombie" ? "🧟" : p.role === "human" ? "🙂" : "💀"}</span> {p.nickname} <b>{p.points}</b>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const s = v.summary;
  return (
    <div className="zh-screen">
      <p className="muted">Turno {v.round} di {v.rounds}</p>
      <h2 className="question">{v.phase === "play" ? "Scegliete la carta… e state attenti agli zombie!" : "Esiti del turno"}</h2>
      {v.phase === "play" ? (
        <>
          <p className="zh-turn-suit big">
            Seme del turno <SuitBadge suit={v.suit} label="Seme del turno" />
            {v.nextSuit !== null && <span className="muted"> · prossimo <SuitBadge suit={v.nextSuit} label="Prossimo seme" /></span>}
          </p>
          <p className="muted">Chi ha carte di questo seme deve giocarne una: batte tutti gli altri semi.</p>
          <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} onTick={() => sfx("tick", 0.3)} />
          <p className="muted">Scelte arrivate: {v.chosen}</p>
        </>
      ) : (
        s && (
          <div className="zh-summary">
            <div className="zh-stat">🧟 <b>{s.infected}</b> infettati</div>
            <div className="zh-stat">🔫 <b>{s.shot}</b> zombie abbattuti</div>
            <div className="zh-stat">💉 <b>{s.cured}</b> curati</div>
            <div className="zh-stat">💀 <b>{s.eliminated}</b> eliminati</div>
          </div>
        )
      )}
      <p className="big">In gioco: {v.alive} / {v.total}</p>
    </div>
  );
}

export function ZombieHuntController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PlayerPlay | PlayerDone;
  const sfx = useSfx(theme);
  const event = v.phase === "reveal" ? v.event : undefined;
  const round = v.phase === "done" ? -1 : v.round;

  useEffect(() => {
    if (!event) return;
    if (GOOD.includes(event.outcome)) sfx("correct");
    else if (BAD.includes(event.outcome)) sfx("wrong");
  }, [event, round, sfx]);

  if (v.phase === "done") {
    const title = v.winner === "humans" ? "Hanno vinto gli umani" : v.winner === "zombies" ? "Hanno vinto gli zombie" : "Pareggio";
    return (
      <div className="zh-ctrl">
        <p className="big">{title}</p>
        <p>{v.role === "zombie" ? "Eri uno zombie 🧟" : v.role === "human" ? "Sei sopravvissuto 🙂" : "Sei stato eliminato 💀"}</p>
        <p className="muted">Punti: {v.points}</p>
      </div>
    );
  }

  const canAct = v.phase === "play" && (v.role === "human" || v.role === "zombie") && !v.bye && v.opponent !== null && v.choice === null;
  // Obbligo di seguire il seme del turno, se se ne ha (lo stesso controllo lo fa il server).
  const follow = v.cards.filter((c) => c.suit === v.suit);
  const legal = follow.length > 0 ? follow : v.cards;
  return (
    <div className="zh-ctrl">
      <p className="muted">
        Turno {v.round} / {v.rounds} · {v.role === "zombie" ? "🧟 sei uno ZOMBIE" : v.role === "human" ? "🙂 sei UMANO" : "💀 eliminato"} · {v.points} pt
      </p>
      {v.phase === "play" && <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />}
      {v.phase === "play" && v.role !== "out" && (
        <p className="zh-turn-suit">
          Seme del turno <SuitBadge suit={v.suit} label="Seme del turno" />
          {v.nextSuit !== null && <span className="muted"> · prossimo <SuitBadge suit={v.nextSuit} label="Prossimo seme" /></span>}
        </p>
      )}
      {v.phase === "play" && (v.role === "human" || v.role === "zombie") && !v.bye && v.choice === null && legal.length < v.cards.length && (
        <p className="muted">Devi giocare una carta di {SUIT_NAME[v.suit]}.</p>
      )}

      {v.phase === "play" && v.role === "out" && <p className="big">Sei fuori dai giochi. Guarda lo schermo!</p>}
      {v.phase === "play" && v.role !== "out" && v.bye && <p className="big">Turno di riposo</p>}
      {v.phase === "play" && (v.role === "human" || v.role === "zombie") && !v.bye && (
        <>
          <p className="big">Sfidante: {v.opponent}</p>
          <p className="muted">
            {v.choice
              ? `Hai scelto ${choiceLabel(v.choice)}: attendi gli altri`
              : v.role === "zombie"
                ? "Mordi, oppure mimetizzati giocando una carta come un umano."
                : "Scegli una carta. Potrebbe essere uno zombie…"}
          </p>
          {v.role === "zombie" && (
            <button className={`zh-special zh-bite ${v.choice?.kind === "bite" ? "chosen" : ""}`} disabled={!canAct} onClick={() => send({ type: "bite" })}>
              🧟 Morsica
            </button>
          )}
          <div className="zh-cards">
            {v.cards.map((c, i) => (
              <button
                key={`${c.suit}-${c.value}-${i}`}
                className={`zh-card ${isRed(c.suit) ? "red" : ""} ${c.suit === v.suit ? "trump" : ""} ${v.choice?.kind === "card" && sameCard(v.choice, c) ? "chosen" : ""}`}
                disabled={!canAct || !legal.some((l) => sameCard(l, c))}
                onClick={() => send({ type: "play", suit: c.suit, value: c.value })}
              >
                {cardText(c)}
              </button>
            ))}
          </div>
          {(v.shotgun || v.vaccine) && (
            <>
              <div className="zh-specials">
                {v.shotgun && (
                  <button className={`zh-special ${v.choice?.kind === "shotgun" ? "chosen" : ""}`} disabled={!canAct} onClick={() => send({ type: "shotgun" })}>
                    🔫 Fucile
                  </button>
                )}
                {v.vaccine && (
                  <button className={`zh-special ${v.choice?.kind === "vaccine" ? "chosen" : ""}`} disabled={!canAct} onClick={() => send({ type: "vaccine" })}>
                    💉 Vaccino
                  </button>
                )}
              </div>
              {!v.choice && <p className="muted">Se lo sfidante non è uno zombie, fucile e vaccino vanno a vuoto: perdi il duello, cedi carte e punti.</p>}
            </>
          )}
        </>
      )}

      {v.phase === "reveal" && event && (
        <>
          <p className="big">{eventText(event)}</p>
          {event.mine && event.theirs && (
            <p className="zh-versus">{choiceLabel(event.mine)} vs {choiceLabel(event.theirs)}</p>
          )}
          {event.points !== 0 && <p className="muted">{event.points > 0 ? "+" : ""}{event.points} punti</p>}
        </>
      )}
      {v.phase === "reveal" && !event && <p className="big">{v.role === "out" ? "Sei fuori dai giochi." : "Turno concluso."}</p>}
    </div>
  );
}
