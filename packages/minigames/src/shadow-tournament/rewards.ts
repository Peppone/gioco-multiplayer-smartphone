import type { RewardCard, ShadowConfig } from "./config.js";

export type DeckName = "normal" | "legendary";

/** Pesca una carta: le quantità sono probabilità e la carta torna nel mazzo (nessuna memoria tra le pescate). */
export function drawCard(deck: RewardCard[], rng: () => number): RewardCard {
  const total = deck.reduce((sum, c) => sum + c.qty, 0);
  if (total === 0) return deck[0]!;
  let r = Math.floor(rng() * total);
  for (const c of deck) {
    if (r < c.qty) return c;
    r -= c.qty;
  }
  return deck[deck.length - 1]!;
}

export const deckOf = (cfg: ShadowConfig, name: DeckName): RewardCard[] => (name === "normal" ? cfg.normalDeck : cfg.legendaryDeck);

export interface Effect {
  tokens: number;
  nextLives: number;
}

/** Con la carta «a scelta» si sceglie fra i token e le vite; non si può pagare più token di quanti se ne hanno. */
export function canPayTokens(card: RewardCard, tokens: number): boolean {
  return card.tokens >= 0 || tokens + card.tokens >= 0;
}

/** Effetto di una carta; `pay` serve solo per le carte «a scelta». */
export function effectOf(card: RewardCard, pay: "tokens" | "life", tokens: number): Effect {
  if (!card.either) return { tokens: card.tokens, nextLives: card.nextLives };
  const choice = pay === "tokens" && canPayTokens(card, tokens) ? "tokens" : "life";
  return choice === "tokens" ? { tokens: card.tokens, nextLives: 0 } : { tokens: 0, nextLives: card.nextLives };
}

/** Valore medio in token del mazzo (per il bilanciamento: ignora le vite). */
export function averageTokens(deck: RewardCard[]): number {
  const total = deck.reduce((s, c) => s + c.qty, 0);
  return total === 0 ? 0 : deck.reduce((s, c) => s + c.qty * c.tokens, 0) / total;
}
