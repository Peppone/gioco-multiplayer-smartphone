import type { Card, Effect, EffectKind, HandCard } from "./cards.js";
import { makeRng, randInt } from "./rng.js";

/** 0 e 1 sono i due lati del duello. */
export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export interface PoisonStack {
  damage: number;
  /** Battaglie successive in cui il veleno infligge ancora danni. */
  turns: number;
}

export interface Knight {
  hp: number;
  maxHp: number;
  poison: PoisonStack[];
  hand: HandCard[];
}

/** Avvenimenti di una battaglia, nell'ordine di risoluzione: lo schermo li anima uno dopo l'altro. */
export type BattleEvent =
  | { type: "play"; side: Side; uid: string; cardId: string }
  | { type: "poison-tick"; side: Side; damage: number }
  | { type: "shield"; side: Side; amount: number }
  | { type: "counter-ready"; side: Side }
  | { type: "heal"; side: Side; amount: number }
  | { type: "damage"; source: Side; target: Side; kind: "attack" | "heavy" | "counter"; amount: number; blocked: number }
  | { type: "poison"; source: Side; target: Side; damage: number; turns: number }
  | { type: "steal"; side: Side; uid: string | null; cardId: string | null }
  | { type: "spy"; side: Side; uid: string | null; cardId: string | null }
  | { type: "sabotage"; source: Side; target: Side; percent: number }
  | { type: "ko"; side: Side };

export interface BattleInput {
  knights: [Knight, Knight];
  /** `uid` delle carte che ciascun lato gioca (devono essere nella sua mano). */
  plays: [string[], string[]];
  cards: Record<string, Card>;
  /** Massimo di carte giocabili per lato in una battaglia. */
  maxPlays: number;
  seed: number;
}

export interface BattleResult {
  knights: [Knight, Knight];
  events: BattleEvent[];
  /** Il lato che ha messo KO l'altro, oppure null se nessuno è a 0 PV. */
  winner: Side | null;
  /** Carte effettivamente giocate (e quindi consumate), per lato. */
  played: [HandCard[], HandCard[]];
  /** Malus in % ai punti del prossimo minigioco, per lato che lo subisce (0-100). */
  sabotage: [number, number];
  /** Carta avversaria svelata dalla Spia, per lato che ha spiato. */
  spied: [HandCard | null, HandCard | null];
}

/**
 * Fase di risoluzione di ciascun tipo di effetto. Ordine: difese → cure → attacchi → effetti → colpo pesante.
 * Dentro una fase si risolve per iniziativa decrescente; a pari iniziativa decide il seme (equo per i due lati).
 */
const PHASE: Record<EffectKind, number> = {
  shield: 1,
  counter: 1,
  heal: 2,
  attack: 3,
  poison: 4,
  steal: 4,
  spy: 4,
  sabotage: 4,
  heavy: 5,
};

interface Item {
  side: Side;
  card: Card;
  effect: Effect;
  phase: number;
  tiebreak: number;
  order: number;
}

const cloneKnight = (k: Knight): Knight => ({
  hp: k.hp,
  maxHp: k.maxHp,
  poison: k.poison.map((p) => ({ ...p })),
  hand: k.hand.map((c) => ({ ...c })),
});

export const newKnight = (maxHp: number, hand: HandCard[] = []): Knight => ({ hp: maxHp, maxHp, poison: [], hand });

/**
 * Risolve una battaglia: funzione pura e deterministica (stessi input e seme = stesso risultato).
 * Regola di fine: il primo KO chiude subito la battaglia, le azioni successive non avvengono.
 */
export function resolveBattle(input: BattleInput): BattleResult {
  const rng = makeRng(input.seed);
  const knights: [Knight, Knight] = [cloneKnight(input.knights[0]), cloneKnight(input.knights[1])];
  const events: BattleEvent[] = [];
  const shield = [0, 0];
  const counters: number[][] = [[], []];
  const sabotage: [number, number] = [0, 0];
  const spied: [HandCard | null, HandCard | null] = [null, null];
  const played: [HandCard[], HandCard[]] = [[], []];
  let winner: Side | null = null;

  const ko = (loser: Side) => {
    winner = other(loser);
    events.push({ type: "ko", side: loser });
  };
  const finish = (): BattleResult => ({ knights, events, winner, played, sabotage, spied });

  // ---- 0. Veleno delle battaglie precedenti (ignora gli scudi) ----
  const tick = [0, 1].map((s) => knights[s]!.poison.reduce((sum, p) => sum + p.damage, 0));
  if (tick[0]! > 0 || tick[1]! > 0) {
    const raw = [knights[0].hp - tick[0]!, knights[1].hp - tick[1]!];
    for (const s of [0, 1] as const) {
      if (tick[s]! > 0) events.push({ type: "poison-tick", side: s, damage: tick[s]! });
      knights[s].poison = knights[s].poison.map((p) => ({ ...p, turns: p.turns - 1 })).filter((p) => p.turns > 0);
    }
    if (raw[0]! <= 0 && raw[1]! <= 0) {
      // Doppio KO per veleno: sopravvive chi ha più PV residui, a pari PV decide il seme.
      const survivor: Side = raw[0]! > raw[1]! ? 0 : raw[1]! > raw[0]! ? 1 : rng() < 0.5 ? 0 : 1;
      knights[survivor].hp = 1;
      knights[other(survivor)].hp = 0;
      ko(other(survivor));
    } else {
      for (const s of [0, 1] as const) {
        knights[s].hp = Math.max(0, raw[s]!);
        if (winner === null && raw[s]! <= 0) ko(s);
      }
    }
    if (winner !== null) return finish(); // battaglia chiusa: le carte annunciate non vengono giocate
  }

  // ---- 1. Carte giocate (rivelazione simultanea): si ignorano uid non validi, doppioni e oltre il massimo ----
  for (const s of [0, 1] as const) {
    const seen = new Set<string>();
    for (const uid of input.plays[s]) {
      if (seen.has(uid) || played[s].length >= input.maxPlays) continue;
      seen.add(uid);
      const idx = knights[s].hand.findIndex((c) => c.uid === uid);
      if (idx < 0 || !input.cards[knights[s].hand[idx]!.cardId]) continue;
      played[s].push(knights[s].hand.splice(idx, 1)[0]!);
    }
    for (const c of played[s]) events.push({ type: "play", side: s, uid: c.uid, cardId: c.cardId });
  }

  // ---- 2. Elenco degli effetti in ordine di risoluzione ----
  const items: Item[] = [];
  for (const s of [0, 1] as const) {
    for (const c of played[s]) {
      const card = input.cards[c.cardId]!;
      const tiebreak = rng(); // uno per carta, in ordine fisso: deterministico
      card.effects.forEach((effect, order) => items.push({ side: s, card, effect, phase: PHASE[effect.kind], tiebreak, order }));
    }
  }
  items.sort((a, b) => a.phase - b.phase || b.card.initiative - a.card.initiative || a.tiebreak - b.tiebreak || a.order - b.order);

  // ---- 3. Risoluzione ----
  const hit = (source: Side, target: Side, kind: "attack" | "heavy" | "counter", amount: number) => {
    const blocked = kind === "counter" ? 0 : Math.min(shield[target]!, amount); // il contrattacco ignora gli scudi
    shield[target]! -= blocked;
    const dealt = amount - blocked;
    knights[target].hp = Math.max(0, knights[target].hp - dealt);
    events.push({ type: "damage", source, target, kind, amount: dealt, blocked });
    if (knights[target].hp === 0) ko(target);
  };
  const pick = (hand: HandCard[]): HandCard | null => (hand.length === 0 ? null : hand[randInt(rng, hand.length)]!);

  for (const { side, effect } of items) {
    if (winner !== null) break;
    const foe = other(side);
    switch (effect.kind) {
      case "shield":
        shield[side]! += effect.amount;
        events.push({ type: "shield", side, amount: effect.amount });
        break;
      case "counter":
        counters[side]!.push(effect.amount); // l'entità resta segreta fino a quando scatta
        events.push({ type: "counter-ready", side });
        break;
      case "heal": {
        const amount = Math.min(effect.amount, knights[side].maxHp - knights[side].hp);
        knights[side].hp += amount;
        events.push({ type: "heal", side, amount });
        break;
      }
      case "attack":
      case "heavy": {
        hit(side, foe, effect.kind, effect.amount);
        // Il contrattacco scatta una sola volta per carta, se chi è stato attaccato è ancora in piedi.
        const retaliation = winner === null ? counters[foe]!.shift() : undefined;
        if (retaliation !== undefined) hit(foe, side, "counter", retaliation);
        break;
      }
      case "poison":
        knights[foe].poison.push({ damage: effect.amount, turns: effect.turns });
        events.push({ type: "poison", source: side, target: foe, damage: effect.amount, turns: effect.turns });
        break;
      case "steal": {
        // Si può rubare solo dalla mano rimasta: le carte appena giocate sono già sul tavolo.
        const card = pick(knights[foe].hand);
        if (card) {
          knights[foe].hand = knights[foe].hand.filter((c) => c.uid !== card.uid);
          knights[side].hand.push(card);
        }
        events.push({ type: "steal", side, uid: card?.uid ?? null, cardId: card?.cardId ?? null });
        break;
      }
      case "spy": {
        const card = pick(knights[foe].hand);
        spied[side] = card ? { ...card } : null;
        events.push({ type: "spy", side, uid: card?.uid ?? null, cardId: card?.cardId ?? null });
        break;
      }
      case "sabotage":
        sabotage[foe] = Math.min(100, sabotage[foe] + effect.amount);
        events.push({ type: "sabotage", source: side, target: foe, percent: effect.amount });
        break;
    }
  }
  return finish();
}

/**
 * Versione di un evento adatta a chi lo guarda. Furto e Spia nascondono quale carta è coinvolta:
 * la vede solo chi l'ha presa/spiata (e chi l'ha persa, per il furto). Lo schermo non la vede mai.
 */
export function redactEvent(event: BattleEvent, viewer: Side | "screen"): BattleEvent {
  if (event.type === "steal" && viewer !== event.side && viewer !== other(event.side)) return { ...event, uid: null, cardId: null };
  if (event.type === "spy" && viewer !== event.side) return { ...event, uid: null, cardId: null };
  return event;
}
