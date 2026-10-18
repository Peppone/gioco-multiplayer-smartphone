import { CHARACTER_LABEL, TEAM_LABEL } from "./rulesText";
import type { Card, Team } from "./types";

/** Icona della squadra, disegnata a mano in SVG: stella (Blu), bomba (Rossa), punto di domanda (grigia). */
function TeamIcon({ team }: { team: Team }) {
  if (team === "blue") {
    return (
      <svg viewBox="0 0 64 64" className="scb-icon" aria-hidden="true">
        <path d="M32 6l7.4 17.2 18.6 1.6-14.1 12.3 4.3 18.2L32 45.6 15.8 55.3l4.3-18.2L6 24.8l18.6-1.6z" fill="currentColor" />
      </svg>
    );
  }
  if (team === "red") {
    return (
      <svg viewBox="0 0 64 64" className="scb-icon" aria-hidden="true">
        <circle cx="29" cy="38" r="19" fill="currentColor" />
        <path d="M40 22l7-9m0 0l-1-7m1 7l7-1m-7 1l6 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className="scb-icon" aria-hidden="true">
      <path d="M23 24c0-6 4-10 10-10s10 4 10 9c0 8-9 8-9 16" stroke="currentColor" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="34" cy="52" r="4.5" fill="currentColor" />
    </svg>
  );
}

/** Candelotto di dinamite, motivo grafico del tema «boom». */
export function Dynamite({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 96" className={className} aria-hidden="true">
      <rect x="10" y="26" width="28" height="64" rx="5" fill="currentColor" />
      <rect x="10" y="44" width="28" height="8" fill="#0003" />
      <path d="M24 26c0-10 10-8 10-18" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="35" cy="6" r="4" fill="var(--accent)" />
    </svg>
  );
}

/**
 * La carta personaggio: nome in verticale lungo il bordo, icona della squadra, fascia di colore in basso.
 * Con `colorOnly` (o se manca il personaggio) si vede solo la fascia, a tutta altezza.
 */
export function CardFace({ card, colorOnly = false }: { card: Card | { team: Team }; colorOnly?: boolean }) {
  const character = "character" in card ? card.character : null;
  if (colorOnly || !character) {
    return (
      <div className="scb-color" data-team={card.team} data-testid="scb-color">
        <TeamIcon team={card.team} />
        <b>{TEAM_LABEL[card.team]}</b>
      </div>
    );
  }
  return (
    <div className="scb-card" data-team={card.team} data-character={character} data-testid="scb-card">
      <span className="scb-card-name">{CHARACTER_LABEL[character]}</span>
      <TeamIcon team={card.team} />
      <b className="scb-card-band">{TEAM_LABEL[card.team]}</b>
    </div>
  );
}
