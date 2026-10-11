import { type Knight, type Side, newKnight, other, resolveBattle } from "./battle.js";
import { type Deck, type HandCard, cardIndex, expandDeck } from "./cards.js";
import { deriveSeed, makeRng, randInt, shuffle } from "./rng.js";

export interface SimOptions {
  deck: Deck;
  hp?: number;
  /** Minigiochi giocati tra una battaglia e la successiva. */
  minigamesPerBattle?: number;
  /** Cicli massimi: poi vince chi ha più PV (in parità, battaglie a oltranza). */
  maxBattles?: number;
  draftSize?: number;
  maxPlays?: number;
  /** Battaglie a oltranza prima di arrendersi al sorteggio. */
  suddenDeathLimit?: number;
  seed: number;
}

export interface SimResult {
  winner: Side;
  battles: number;
  /** Il duello è finito per KO (invece che per PV al limite dei cicli o a oltranza). */
  ko: boolean;
  suddenDeath: boolean;
  /** Carte (id) giocate da ciascun lato durante il duello. */
  playedCards: [Set<string>, Set<string>];
  /** Dimensione media della mano di ciascun lato all'inizio delle battaglie. */
  avgHand: number;
}

/**
 * Duello tra due bot che scelgono a caso: serve a scovare loop infiniti e carte sbilanciate.
 * Riproduce il flusso reale: minigioco (vince un lato a caso) → draft a priorità → battaglia.
 */
export function simulateDuel(opts: SimOptions): SimResult {
  const { deck, hp = 30, minigamesPerBattle = 2, maxBattles = 8, draftSize = 3, maxPlays = 2, suddenDeathLimit = 10, seed } = opts;
  const rng = makeRng(seed);
  const cards = cardIndex(deck);

  let supply: HandCard[] = shuffle(expandDeck(deck), rng);
  let discard: HandCard[] = [];
  const draw = (n: number): HandCard[] => {
    if (supply.length < n) {
      supply = [...supply, ...shuffle(discard, rng)];
      discard = [];
    }
    return supply.splice(0, n);
  };

  const knights: [Knight, Knight] = [newKnight(hp), newKnight(hp)];
  const playedCards: [Set<string>, Set<string>] = [new Set(), new Set()];
  let handSum = 0;
  let handCount = 0;
  let battles = 0;

  const runBattle = (): Side | null => {
    battles++;
    handSum += knights[0].hand.length + knights[1].hand.length;
    handCount += 2;
    const plays = knights.map((k) => {
      if (k.hand.length === 0) return [];
      const n = 1 + randInt(rng, Math.min(maxPlays, k.hand.length));
      return shuffle(k.hand, rng).slice(0, n).map((c) => c.uid);
    }) as [string[], string[]];
    const r = resolveBattle({ knights, plays, cards, maxPlays, seed: deriveSeed(seed, battles) });
    knights[0] = r.knights[0];
    knights[1] = r.knights[1];
    for (const s of [0, 1] as const) {
      for (const c of r.played[s]) playedCards[s].add(c.cardId);
      discard.push(...r.played[s]);
    }
    return r.winner;
  };

  const finish = (winner: Side, ko: boolean, suddenDeath: boolean): SimResult => ({
    winner,
    battles,
    ko,
    suddenDeath,
    playedCards,
    avgHand: handCount ? handSum / handCount : 0,
  });

  for (let round = 0; round < maxBattles; round++) {
    // Minigiochi: il vincitore sceglie per primo, poi lo sconfitto; la carta rimasta torna nel mazzo.
    for (let m = 0; m < minigamesPerBattle; m++) {
      const offered = draw(draftSize);
      const first: Side = rng() < 0.5 ? 0 : 1;
      for (const side of [first, other(first)]) {
        if (offered.length === 0) break;
        const picked = offered.splice(randInt(rng, offered.length), 1)[0]!;
        knights[side].hand.push(picked);
      }
      supply.push(...offered);
    }
    const w = runBattle();
    if (w !== null) return finish(w, true, false);
  }

  // Cicli finiti: più PV vince; in parità battaglie a oltranza con una pescata fresca per lato.
  if (knights[0].hp !== knights[1].hp) return finish(knights[0].hp > knights[1].hp ? 0 : 1, false, false);
  for (let i = 0; i < suddenDeathLimit; i++) {
    for (const s of [0, 1] as const) knights[s].hand.push(...draw(2));
    const w = runBattle();
    if (w !== null) return finish(w, true, true);
    if (knights[0].hp !== knights[1].hp) return finish(knights[0].hp > knights[1].hp ? 0 : 1, false, true);
  }
  return finish(rng() < 0.5 ? 0 : 1, false, true); // ultima spiaggia: sorteggio con il seme
}
