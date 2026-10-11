import type { Deck } from "./cards.js";
import { type SimResult, simulateDuel } from "./simulate.js";

export interface AnalysisOptions {
  duels?: number;
  hp?: number;
  maxBattles?: number;
  minigamesPerBattle?: number;
  /** Fascia di vittorie (0-1) oltre la quale una carta è segnalata come troppo forte o troppo debole. */
  band?: [number, number];
}

export interface CardStat {
  id: string;
  name: string;
  /** Duelli in cui almeno un lato l'ha giocata. */
  played: number;
  /** Quota di vittorie del lato che l'ha giocata (0-1). */
  winRate: number;
  flag: "ok" | "forte" | "debole" | "rara";
}

export interface DeckAnalysis {
  duels: number;
  /** Mediana delle battaglie per duello. */
  medianBattles: number;
  koRate: number;
  suddenDeathRate: number;
  /** Vittorie del «lato 0»: vicino a 0,5 se non c'è un vantaggio di posizione. */
  side0WinRate: number;
  cards: CardStat[];
  warnings: string[];
}

/**
 * Fa giocare molti duelli tra bot casuali con il mazzo indicato e riassume durata, equilibrio tra i lati
 * e forza di ogni carta. È una guida, non una verità: i bot non sfruttano Spia e Sabotaggio e non ragionano.
 */
export function analyzeDeck(deck: Deck, opts: AnalysisOptions = {}): DeckAnalysis {
  const { duels = 2000, hp = 20, maxBattles = 6, minigamesPerBattle = 2, band = [0.38, 0.62] } = opts;
  const results: SimResult[] = Array.from({ length: duels }, (_, i) => simulateDuel({ deck, hp, maxBattles, minigamesPerBattle, seed: i + 1 }));

  const battles = results.map((r) => r.battles).sort((a, b) => a - b);
  const stats = new Map<string, { wins: number; n: number }>();
  for (const r of results) {
    for (const side of [0, 1] as const) {
      for (const id of r.playedCards[side]) {
        const s = stats.get(id) ?? { wins: 0, n: 0 };
        s.n++;
        if (r.winner === side) s.wins++;
        stats.set(id, s);
      }
    }
  }

  const cards: CardStat[] = deck.cards.map((c) => {
    const s = stats.get(c.id) ?? { wins: 0, n: 0 };
    const winRate = s.n > 0 ? s.wins / s.n : 0;
    // Una carta giocata in meno del 5% dei duelli non permette di giudicarla.
    const flag: CardStat["flag"] = s.n < duels * 0.05 ? "rara" : winRate > band[1] ? "forte" : winRate < band[0] ? "debole" : "ok";
    return { id: c.id, name: c.name, played: s.n, winRate, flag };
  });

  const analysis: DeckAnalysis = {
    duels,
    medianBattles: battles[Math.floor(duels / 2)] ?? 0,
    koRate: results.filter((r) => r.ko).length / duels,
    suddenDeathRate: results.filter((r) => r.suddenDeath).length / duels,
    side0WinRate: results.filter((r) => r.winner === 0).length / duels,
    cards,
    warnings: [],
  };

  const w = analysis.warnings;
  for (const c of cards) {
    if (c.flag === "forte") w.push(`«${c.name}» vince il ${(c.winRate * 100).toFixed(0)}% dei duelli in cui è giocata: potrebbe essere troppo forte.`);
    if (c.flag === "debole") w.push(`«${c.name}» vince solo il ${(c.winRate * 100).toFixed(0)}% dei duelli in cui è giocata: potrebbe essere troppo debole.`);
    if (c.flag === "rara") w.push(`«${c.name}» compare in pochissimi duelli: aggiungi copie o controlla che sia valida.`);
  }
  if (analysis.koRate < 0.6) w.push(`Solo il ${(analysis.koRate * 100).toFixed(0)}% dei duelli finisce per KO: i duelli sono lunghi, prova a ridurre i PV o aumentare i danni.`);
  if (analysis.medianBattles > maxBattles - 1) w.push(`I duelli durano quasi sempre tutte le ${maxBattles} battaglie: valuta meno PV o più danni.`);
  if (Math.abs(analysis.side0WinRate - 0.5) > 0.05) w.push(`Un lato vince più dell'altro (${(analysis.side0WinRate * 100).toFixed(0)}% contro ${(100 - analysis.side0WinRate * 100).toFixed(0)}%): c'è un vantaggio di posizione.`);
  return analysis;
}
