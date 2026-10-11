import type { BattleEventV, CardV, Side } from "./types";

type Hp = [number, number];

/** PV dopo un evento (solo danni, veleno e cure cambiano i PV). */
export function applyEvent(hp: Hp, e: BattleEventV, maxHp: Hp): Hp {
  const next: Hp = [hp[0], hp[1]];
  if (e.type === "damage") next[e.target] = Math.max(0, next[e.target] - e.amount);
  else if (e.type === "poison-tick") next[e.side] = Math.max(0, next[e.side] - e.damage);
  else if (e.type === "heal") next[e.side] = Math.min(maxHp[e.side], next[e.side] + e.amount);
  return next;
}

/**
 * PV a inizio battaglia, ricavati dai PV finali ripercorrendo gli eventi all'indietro: serve per animare
 * le barre dei PV che scendono. In caso di KO è un'approssimazione (i PV non scendono sotto zero).
 */
export function initialHp(finalHp: Hp, maxHp: Hp, events: BattleEventV[]): Hp {
  const start: Hp = [finalHp[0], finalHp[1]];
  for (const e of events) {
    if (e.type === "damage") start[e.target] += e.amount;
    else if (e.type === "poison-tick") start[e.side] += e.damage;
    else if (e.type === "heal") start[e.side] -= e.amount;
  }
  return [Math.min(maxHp[0], Math.max(0, start[0])), Math.min(maxHp[1], Math.max(0, start[1]))];
}

/** Testo italiano di un evento, per la cronaca della battaglia. Restituisce null per gli eventi che non si raccontano. */
export function narrate(e: BattleEventV, names: [string, string], cards: Record<string, CardV>): string | null {
  const n = (s: Side) => names[s];
  const cardName = (id: string | null) => (id && cards[id] ? `«${cards[id].name}»` : "una carta");
  switch (e.type) {
    case "play":
      return null;
    case "poison-tick":
      return `Il veleno tormenta ${n(e.side)}: -${e.damage}`;
    case "shield":
      return `${n(e.side)} alza lo scudo (${e.amount})`;
    case "counter-ready":
      return `${n(e.side)} si prepara a contrattaccare`;
    case "heal":
      return e.amount > 0 ? `${n(e.side)} si cura di ${e.amount}` : `${n(e.side)} è già in forma`;
    case "damage": {
      const blocked = e.blocked > 0 ? ` (${e.blocked} bloccati)` : "";
      if (e.kind === "counter") return `Contrattacco di ${n(e.source)}! -${e.amount}`;
      if (e.kind === "heavy") return `Colpo pesante di ${n(e.source)}! -${e.amount}${blocked}`;
      return `${n(e.source)} colpisce ${n(e.target)}: -${e.amount}${blocked}`;
    }
    case "poison":
      return `${n(e.source)} avvelena ${n(e.target)} (${e.damage} per ${e.turns} battaglie)`;
    case "steal":
      return e.uid ? `${n(e.side)} ruba ${cardName(e.cardId)}!` : `${n(e.side)} tenta un furto, ma la mano è vuota`;
    case "spy":
      return e.cardId ? `${n(e.side)} spia ${cardName(e.cardId)}` : `${n(e.side)} spia la mano avversaria`;
    case "sabotage":
      return `${n(e.source)} sabota ${n(e.target)}: -${e.percent}% punti al prossimo minigioco`;
    case "ko":
      return `${n(e.side)} è KO!`;
  }
}

/** Gli eventi da animare uno per uno: tutto tranne la rivelazione delle carte, che compare subito. */
export const stepEvents = (events: BattleEventV[]): BattleEventV[] => events.filter((e) => e.type !== "play");

export const REASON_LABEL: Record<string, string> = {
  ko: "per KO",
  hp: "ai punti vita",
  sudden: "alla battaglia a oltranza",
  coin: "per sorteggio",
};
