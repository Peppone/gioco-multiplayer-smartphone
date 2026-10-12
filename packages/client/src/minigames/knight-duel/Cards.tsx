import { useRef, useState } from "react";
import type { ClockSync } from "@gioco/shared";
import { useRemaining } from "../Countdown";
import { ICON_TILE, Sprite } from "./Sprite";
import type { CardV, HandCardV, MemberVoteV } from "./types";

const RARITY_LABEL = { common: "Comune", rare: "Rara", epic: "Epica" } as const;

export function CardIcon({ card, scale = 4 }: { card: CardV; scale?: number }) {
  return <Sprite index={ICON_TILE[card.icon] ?? 104} scale={scale} />;
}

/**
 * Una carta. `compact` mostra solo icona e nome (poco leggibile da chi sbircia dal telefono accanto);
 * `large` mostra anche effetti e iniziativa. `back` è il dorso, senza alcuna informazione.
 */
export function DuelCard({
  card,
  size = "compact",
  back = false,
  selected = false,
  badges = [],
}: {
  card?: CardV;
  size?: "compact" | "large";
  back?: boolean;
  selected?: boolean;
  badges?: string[];
}) {
  if (back || !card) {
    return (
      <div className={`duel-card back ${size}`} aria-label="Carta coperta">
        <span className="back-mark">⚔</span>
      </div>
    );
  }
  return (
    <div className={`duel-card ${card.rarity} ${size} ${selected ? "selected" : ""}`}>
      <CardIcon card={card} scale={size === "large" ? 7 : 4} />
      <b className="card-name">{card.name}</b>
      {size === "large" && (
        <>
          <span className="card-text">{card.text}</span>
          <small className="card-meta">{RARITY_LABEL[card.rarity]} · iniziativa {card.initiative}</small>
        </>
      )}
      {badges.length > 0 && (
        <span className="card-badges">
          {badges.map((b, i) => <i key={i}>{b}</i>)}
        </span>
      )}
    </div>
  );
}

/**
 * Carta che si ingrandisce solo finché la si tiene premuta: così chi è vicino non legge la mano.
 * Un tocco breve la seleziona (`onTap`); `peek` riceve la carta mentre è premuta.
 */
function PeekableCard({ card, onTap, onPeek, children }: { card: HandCardV; onTap?: () => void; onPeek: (c: HandCardV | null) => void; children: React.ReactNode }) {
  const timer = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const release = () => {
    window.clearTimeout(timer.current);
    onPeek(null);
  };
  return (
    <button
      type="button"
      className="peekable"
      onPointerDown={() => {
        held.current = false;
        timer.current = window.setTimeout(() => {
          held.current = true;
          onPeek(card);
        }, 220);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()} // niente menu di sistema con la pressione lunga
      onClick={() => {
        if (held.current) held.current = false; // era una pressione lunga: nessuna selezione
        else onTap?.();
      }}
    >
      {children}
    </button>
  );
}

function PeekOverlay({ card }: { card: HandCardV | null }) {
  if (!card) return null;
  return (
    <div className="peek-overlay" aria-live="polite">
      <DuelCard card={card} size="large" />
    </div>
  );
}

/** La mano: carte compatte; tenendo premuta una carta la si vede grande. */
export function HandStrip({ hand }: { hand: HandCardV[] }) {
  const [peek, setPeek] = useState<HandCardV | null>(null);
  if (hand.length === 0) return <p className="muted hand-empty">Mano vuota</p>;
  return (
    <>
      <div className="hand-strip">
        {hand.map((c) => (
          <PeekableCard key={c.uid} card={c} onPeek={setPeek}>
            <DuelCard card={c} />
          </PeekableCard>
        ))}
      </div>
      <p className="muted hint-peek">Tieni premuta una carta per vederla</p>
      <PeekOverlay card={peek} />
    </>
  );
}

/** Scelta delle carte per il team (draft o battaglia): tocco per scegliere, voti dei compagni in tempo reale. */
export function CardPicker({
  cards,
  vote,
  team,
  clock,
  onCast,
  onConfirm,
  confirmLabel,
  heading,
}: {
  cards: HandCardV[];
  vote: MemberVoteV;
  team: { id: string; nickname: string }[];
  clock: ClockSync;
  onCast: (uid: string) => void;
  onConfirm: () => void;
  confirmLabel: string;
  /** Sostituisce l'invito standard (es. «Prima scelta: ne avrai un'altra dopo»). */
  heading?: string;
}) {
  const [peek, setPeek] = useState<HandCardV | null>(null);
  const remaining = useRemaining(vote.deadline, clock);
  const initial = (id: string) => (team.find((t) => t.id === id)?.nickname ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="card-picker">
      <p className="muted">
        {heading ?? (vote.max === 1 ? "Scegli una carta" : `Scegli fino a ${vote.max} carte`)} ·{Math.ceil(remaining / 1000)}s
      </p>
      <div className="picker-grid">
        {cards.map((c) => {
          const mates = vote.mates.filter((m) => m.picks.includes(c.uid)).map((m) => initial(m.playerId));
          const mine = vote.mine.includes(c.uid);
          return (
            <PeekableCard key={c.uid} card={c} onTap={() => onCast(c.uid)} onPeek={setPeek}>
              <DuelCard card={c} selected={mine} badges={[...(mine ? ["tu"] : []), ...mates]} />
            </PeekableCard>
          );
        })}
      </div>
      <p className="muted hint-peek">Tocca per scegliere · tieni premuto per vedere la carta</p>
      {vote.mates.length > 0 && (
        <p className="mates">
          {vote.mates.map((m) => (
            <span key={m.playerId} className={m.confirmed ? "ok" : ""}>
              {team.find((t) => t.id === m.playerId)?.nickname ?? "?"}: {m.picks.length} {m.confirmed ? "✓" : ""}
            </span>
          ))}
        </p>
      )}
      <button type="button" className={`primary confirm ${vote.confirmed ? "done" : ""}`} onClick={onConfirm} disabled={vote.confirmed}>
        {vote.confirmed ? "Confermato ✓ (cambia una carta per modificare)" : confirmLabel}
      </button>
      <PeekOverlay card={peek} />
    </div>
  );
}
