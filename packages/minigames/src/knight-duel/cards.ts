import { z } from "zod";

/** Icone disponibili per le carte (mappate sugli sprite Kenney lato client). */
export const CARD_ICONS = ["sword", "dagger", "axe", "hammer", "shield", "potion-red", "potion-green", "potion-blue", "staff", "spear"] as const;

export const EFFECT_KINDS = ["attack", "heavy", "shield", "counter", "heal", "poison", "steal", "spy", "sabotage"] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Effetti che non usano `amount`. */
const NO_AMOUNT: EffectKind[] = ["steal", "spy"];

// Schema piatto (non un'unione): l'editor a form genera i campi da qui.
const effectSchema = z
  .object({
    kind: z.enum(EFFECT_KINDS).meta({
      title: "Effetto",
      enumLabels: {
        attack: "Attacco",
        heavy: "Colpo pesante (si risolve per ultimo)",
        shield: "Scudo",
        counter: "Contrattacco",
        heal: "Cura",
        poison: "Veleno",
        steal: "Furto di una carta",
        spy: "Spia (svela una carta avversaria)",
        sabotage: "Sabotaggio (malus ai punti)",
      },
    }),
    amount: z
      .number()
      .int()
      .min(0)
      .max(99)
      .default(5)
      .meta({ title: "Valore", description: "Danni, danni bloccati, PV curati o percentuale di malus; ignorato da Furto e Spia" }),
    turns: z.number().int().min(1).max(5).default(2).meta({ title: "Battaglie", description: "Solo per il Veleno: per quante battaglie successive" }),
  })
  .refine((e) => NO_AMOUNT.includes(e.kind) || e.amount >= 1, { message: "Il valore deve essere almeno 1", path: ["amount"] })
  .refine((e) => e.kind !== "sabotage" || e.amount <= 100, { message: "La percentuale del sabotaggio non supera 100", path: ["amount"] });

export const cardSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]{2,32}$/, "Solo minuscole, numeri e trattini")
    .meta({ title: "Identificatore", description: "Univoco nel mazzo, es. fendente" }),
  name: z.string().trim().min(1).max(24).meta({ title: "Nome" }),
  icon: z.enum(CARD_ICONS).default("sword").meta({
    title: "Icona",
    enumLabels: {
      sword: "Spada",
      dagger: "Pugnale",
      axe: "Ascia",
      hammer: "Martello",
      shield: "Scudo",
      "potion-red": "Pozione rossa",
      "potion-green": "Pozione verde",
      "potion-blue": "Pozione blu",
      staff: "Bastone",
      spear: "Lancia",
    },
  }),
  rarity: z.enum(["common", "rare", "epic"]).default("common").meta({
    title: "Rarità",
    enumLabels: { common: "Comune", rare: "Rara", epic: "Epica" },
  }),
  initiative: z.number().int().min(0).max(20).default(5).meta({ title: "Iniziativa", description: "Più è alta, prima si risolve nella sua fase" }),
  copies: z.number().int().min(1).max(6).default(1).meta({ title: "Copie nel mazzo" }),
  effects: z.array(effectSchema).min(1).max(3).meta({ title: "Effetti", itemLabel: "Effetto" }),
});

export const deckSchema = z
  .object({ cards: z.array(cardSchema).min(3).max(60).meta({ title: "Carte", itemLabel: "Carta" }) })
  .refine((d) => new Set(d.cards.map((c) => c.id)).size === d.cards.length, { message: "Gli identificatori delle carte devono essere tutti diversi", path: ["cards"] });

export type Effect = z.infer<typeof effectSchema>;
export type Card = z.infer<typeof cardSchema>;
export type Deck = z.infer<typeof deckSchema>;

/** Una carta fisica nel gioco: stessa carta con più copie → `uid` diversi. */
export interface HandCard {
  uid: string;
  cardId: string;
}

/** Espande il mazzo in carte fisiche (una per copia), con `uid` stabili del tipo `fendente#2`. */
export function expandDeck(deck: Deck): HandCard[] {
  return deck.cards.flatMap((c) => Array.from({ length: c.copies }, (_, i) => ({ uid: `${c.id}#${i + 1}`, cardId: c.id })));
}

export function cardIndex(deck: Deck): Record<string, Card> {
  return Object.fromEntries(deck.cards.map((c) => [c.id, c]));
}

const EFFECT_TEXT: Record<EffectKind, (e: Effect) => string> = {
  attack: (e) => `Attacco ${e.amount}`,
  heavy: (e) => `Colpo pesante ${e.amount}`,
  shield: (e) => `Scudo ${e.amount}`,
  counter: (e) => `Contrattacco ${e.amount}`,
  heal: (e) => `Cura ${e.amount}`,
  poison: (e) => `Veleno ${e.amount} per ${e.turns} battaglie`,
  steal: () => "Ruba una carta",
  spy: () => "Svela una carta avversaria",
  sabotage: (e) => `Sabotaggio -${e.amount}% punti`,
};

/** Testo descrittivo di una carta, generato dagli effetti (non si scrive a mano). */
export const describeCard = (card: Card): string => card.effects.map((e) => EFFECT_TEXT[e.kind](e)).join(" · ");

// ---- Mazzo iniziale (circa 15 carte, su pochi effetti componibili) ----

const e = (kind: EffectKind, amount = 0, turns = 2): Effect => ({ kind, amount, turns });

export const DEFAULT_DECK: Deck = {
  cards: [
    { id: "fendente", name: "Fendente", icon: "sword", rarity: "common", initiative: 6, copies: 3, effects: [e("attack", 5)] },
    { id: "affondo", name: "Affondo", icon: "dagger", rarity: "common", initiative: 9, copies: 2, effects: [e("attack", 3)] },
    { id: "ascia", name: "Ascia spaccaossa", icon: "axe", rarity: "rare", initiative: 4, copies: 1, effects: [e("attack", 7)] },
    { id: "martello", name: "Colpo di martello", icon: "hammer", rarity: "common", initiative: 3, copies: 2, effects: [e("heavy", 8)] },
    { id: "scudo", name: "Scudo di quercia", icon: "shield", rarity: "common", initiative: 8, copies: 2, effects: [e("shield", 6)] },
    { id: "muro", name: "Muro di ferro", icon: "shield", rarity: "rare", initiative: 5, copies: 1, effects: [e("shield", 10)] },
    { id: "riposta", name: "Riposta", icon: "spear", rarity: "common", initiative: 7, copies: 2, effects: [e("counter", 5)] },
    { id: "pozione", name: "Pozione curativa", icon: "potion-red", rarity: "common", initiative: 5, copies: 2, effects: [e("heal", 7)] },
    { id: "elisir", name: "Elisir maggiore", icon: "potion-blue", rarity: "rare", initiative: 5, copies: 1, effects: [e("heal", 9)] },
    { id: "veleno", name: "Veleno del ragno", icon: "potion-green", rarity: "common", initiative: 4, copies: 2, effects: [e("poison", 3, 2)] },
    { id: "mano-lesta", name: "Mano lesta", icon: "dagger", rarity: "rare", initiative: 10, copies: 1, effects: [e("steal"), e("attack", 2)] },
    { id: "occhio-mago", name: "Occhio del mago", icon: "staff", rarity: "common", initiative: 10, copies: 1, effects: [e("spy"), e("shield", 3)] },
    { id: "sabotaggio", name: "Sabotaggio", icon: "staff", rarity: "rare", initiative: 6, copies: 1, effects: [e("sabotage", 30), e("attack", 2)] },
    { id: "carica", name: "Carica eroica", icon: "sword", rarity: "epic", initiative: 7, copies: 1, effects: [e("attack", 5), e("shield", 3)] },
    { id: "vendetta", name: "Vendetta", icon: "spear", rarity: "epic", initiative: 6, copies: 1, effects: [e("counter", 6), e("attack", 3)] },
  ],
};
