/** Le tre carte base: Attacco batte Raggiro, Raggiro batte Difesa, Difesa batte Attacco. */
export type Card = "attack" | "defense" | "trick";
export const CARDS: readonly Card[] = ["attack", "defense", "trick"];

export type Action = "shield" | "trap" | "swap";

export type Reaction = { action: "pass" } | { action: "shield" } | { action: "trap" } | { action: "swap"; card: Card };

export interface Costs {
  bet: number;
  shield: number;
  trap: number;
  swap: number;
  counter: number;
}

export const beats = (x: Card, y: Card): boolean =>
  (x === "attack" && y === "trick") || (x === "trick" && y === "defense") || (x === "defense" && y === "attack");

/** Esito per il primo giocatore: `0` vince lui, `1` vince il secondo, `null` pareggio. */
export function outcome(a: Card, b: Card): 0 | 1 | null {
  if (a === b) return null;
  return beats(a, b) ? 0 : 1;
}

export type Result = "win" | "lose" | "draw";

/**
 * Reazioni possibili dopo la rivelazione. Una sola azione per scambio: chi ha pagato la Scommessa non reagisce.
 * (La contromossa non è qui: si decide dopo, vedi `canCounter`.)
 */
export function availableReactions(p: { tokens: number; bet: boolean; result: Result; costs: Costs }): Action[] {
  if (p.bet) return [];
  const out: Action[] = [];
  if (p.result === "lose" && p.tokens >= p.costs.shield) out.push("shield");
  if (p.result !== "win" && p.tokens >= p.costs.swap) out.push("swap");
  if (p.tokens >= p.costs.trap) out.push("trap");
  return out;
}

export function canCounter(p: { tokens: number; bet: boolean; acted: boolean; costs: Costs }): boolean {
  return !p.bet && !p.acted && p.tokens >= p.costs.counter;
}

export interface ExchangeInput {
  cards: [Card, Card];
  bets: [boolean, boolean];
  reactions: [Reaction, Reaction];
  /** La contromossa: chi la usa annulla il Cambia carta dell'avversario e lo scambio si rigioca. */
  counter: 0 | 1 | null;
  costs: Costs;
}

export interface ExchangeResult {
  /** Carte finali (dopo l'eventuale Cambia carta). */
  cards: [Card, Card];
  winner: 0 | 1 | null;
  /** Vite perse dallo sconfitto (0 con Scudo o in pareggio). */
  loss: number;
  shielded: boolean;
  /** Scambio annullato dalla contromossa: si rigioca, nessuno perde vite. */
  replay: boolean;
  /** Per ciascuno, la carta che non potrà usare nello scambio successivo (Trappola dell'avversario). */
  blocked: [Card | null, Card | null];
  /** Token spesi dalle reazioni (la Scommessa è già stata pagata alla rivelazione). */
  spent: [number, number];
}

/** Ordine: Cambia carta → contromossa → Scudo → Trappola. Presuppone che input e token siano già stati validati. */
export function resolveExchange(i: ExchangeInput): ExchangeResult {
  const cards: [Card, Card] = [...i.cards];
  const spent: [number, number] = [0, 0];
  const blocked: [Card | null, Card | null] = [null, null];

  for (const s of [0, 1] as const) {
    const r = i.reactions[s];
    if (r.action !== "swap") continue;
    spent[s] += i.costs.swap;
    if (i.counter === 1 - s) {
      spent[1 - s] += i.costs.counter;
      return { cards: [...i.cards], winner: null, loss: 0, shielded: false, replay: true, blocked, spent };
    }
    cards[s] = r.card;
  }

  const w = outcome(cards[0], cards[1]);
  let loss = w === null ? 0 : 1 + (i.bets[w] ? 1 : 0);
  let shielded = false;
  if (w !== null && i.reactions[1 - w].action === "shield") {
    spent[1 - w] += i.costs.shield;
    loss = 0;
    shielded = true;
  }
  for (const s of [0, 1] as const) {
    if (i.reactions[s].action === "trap") {
      spent[s] += i.costs.trap;
      blocked[1 - s] = cards[1 - s];
    }
  }
  return { cards, winner: w, loss, shielded, replay: false, blocked, spent };
}
