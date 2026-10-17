import { z } from "zod";

/** Una carta ricompensa: effetti sui token (subito) e sulle vite del prossimo scontro; `qty` è la quantità nel mazzo. */
export const rewardCardSchema = z.object({
  label: z.string().trim().min(1).max(40).meta({ title: "Nome" }),
  qty: z.number().int().min(0).max(30).meta({ title: "Quantità nel mazzo", description: "Più copie = più probabile" }),
  tokens: z.number().int().min(-5).max(5).default(0).meta({ title: "Token", description: "Valgono subito (negativo = si perdono)" }),
  nextLives: z.number().int().min(-2).max(2).default(0).meta({ title: "Vite nel prossimo scontro", description: "Negativo = una vita in meno" }),
  either: z
    .boolean()
    .default(false)
    .meta({ title: "A scelta", description: "Chi la pesca sceglie se subire i token o le vite (con token insufficienti: le vite)" }),
});

export type RewardCard = z.infer<typeof rewardCardSchema>;

const sec = (title: string, min: number, max: number, def: number, description?: string) =>
  z.number().int().min(min).max(max).default(def).meta({ title, ...(description && { description }) });

export const shadowConfigSchema = z.object({
  startLives: z.number().int().min(1).max(5).default(3).meta({ title: "Vite a inizio scontro", description: "Con 2 il torneo è più corto" }),
  maxLives: z.number().int().min(1).max(8).default(5).meta({ title: "Vite massime" }),
  startTokens: z.number().int().min(0).max(10).default(1).meta({ title: "Token iniziali" }),
  maxTokens: z.number().int().min(1).max(20).default(5).meta({ title: "Token massimi", description: "L'eccedenza si perde" }),
  allStartLoser: z.boolean().default(false).meta({ title: "Tutti partono da L", description: "Eliminazione diretta: una sola sconfitta" }),

  extraLifeCost: z.number().int().min(0).max(10).default(1).meta({ title: "Costo vita extra (token)" }),
  betCost: z.number().int().min(0).max(10).default(1).meta({ title: "Costo Scommessa (token)" }),
  shieldCost: z.number().int().min(0).max(10).default(2).meta({ title: "Costo Scudo (token)" }),
  trapCost: z.number().int().min(0).max(10).default(2).meta({ title: "Costo Trappola (token)" }),
  swapCost: z.number().int().min(0).max(20).default(5).meta({ title: "Costo Cambia carta (token)" }),
  counterCost: z.number().int().min(0).max(20).default(5).meta({ title: "Costo contromossa (token)" }),

  extraLifeSec: sec("Tempo vita extra (s)", 3, 60, 10),
  chooseSec: sec("Tempo di scelta della carta (s)", 3, 60, 15),
  reactSec: sec("Tempo per le reazioni (s)", 3, 30, 8),
  showSec: sec("Pausa dopo ogni scambio (s)", 1, 15, 3),
  rewardSec: sec("Tempo per scegliere il mazzo (s)", 3, 60, 10),
  byeSec: sec("Tempo per scegliere Bye o NPC (s)", 3, 60, 15),
  turnPauseSec: sec("Pausa tra i turni (s)", 1, 30, 5),
  maxTurns: sec("Turni massimi", 1, 100, 40, "Passati questi turni il torneo finisce con la classifica attuale"),

  normalDeck: z.array(rewardCardSchema).min(1).max(12).meta({ title: "Mazzo Normale", itemLabel: "Carta" }),
  legendaryDeck: z.array(rewardCardSchema).min(1).max(12).meta({ title: "Mazzo Leggendario", itemLabel: "Carta" }),

  placementPoints: z
    .array(z.number().int().min(0).max(100_000))
    .min(1)
    .max(10)
    .default([1000, 700, 500])
    .meta({ title: "Punti ai primi classificati", description: "1°, 2°, 3°…; poi si scala fino al minimo" }),
  placementMin: z.number().int().min(0).max(10_000).default(100).meta({ title: "Punti al primo eliminato" }),
  boutWinPoints: z.number().int().min(0).max(10_000).default(50).meta({ title: "Punti per scontro vinto" }),
  predictionPoints: z.number().int().min(0).max(10_000).default(30).meta({ title: "Punti per pronostico giusto (eliminati)" }),
});

export type ShadowConfig = z.infer<typeof shadowConfigSchema>;

export const DEFAULT_NORMAL_DECK: RewardCard[] = [
  { label: "+1 token", qty: 5, tokens: 1, nextLives: 0, either: false },
  { label: "+2 token", qty: 3, tokens: 2, nextLives: 0, either: false },
  { label: "+1 token e 1 vita", qty: 2, tokens: 1, nextLives: 1, either: false },
  { label: "Neutra", qty: 3, tokens: 0, nextLives: 0, either: false },
  { label: "Rischio lieve", qty: 2, tokens: -1, nextLives: 0, either: false },
];

export const DEFAULT_LEGENDARY_DECK: RewardCard[] = [
  { label: "+3 token", qty: 4, tokens: 3, nextLives: 0, either: false },
  { label: "+2 token e 1 vita", qty: 2, tokens: 2, nextLives: 1, either: false },
  { label: "Vantaggio rischioso", qty: 1, tokens: 2, nextLives: -1, either: false },
  { label: "Rischio forte", qty: 3, tokens: -2, nextLives: -1, either: true },
  { label: "Neutra", qty: 2, tokens: 0, nextLives: 0, either: false },
];

export const sampleShadowConfig: ShadowConfig = shadowConfigSchema.parse({
  normalDeck: DEFAULT_NORMAL_DECK,
  legendaryDeck: DEFAULT_LEGENDARY_DECK,
});
