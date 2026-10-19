/**
 * Classifica e punti della Plancia di Comando: funzioni pure. L'avanzamento di un equipaggio è la **media per membro**
 * (passi / membri): con più membri ci sono più ordini in parallelo, e il totale favorirebbe le squadre grandi.
 */

export interface CrewScore {
  id: string;
  members: number;
  /** Ordini eseguiti (e allarmi superati): un passo ciascuno. */
  progress: number;
  done: number;
  /** Scafo rimasto, da 0 a 100. */
  hull: number;
}

export interface ScoringConfig {
  stepPoints: number;
  hullBonus: number;
  podiumPoints: number[];
}

export const distanceOf = (c: Pick<CrewScore, "progress" | "members">): number => (c.members === 0 ? 0 : c.progress / c.members);

/** Gli id degli equipaggi dal primo all'ultimo: più strada, poi più scafo, poi più ordini, poi per id. */
export function rankCrews(crews: CrewScore[]): string[] {
  return [...crews]
    .sort((a, b) => distanceOf(b) - distanceOf(a) || b.hull - a.hull || b.done - a.done || a.id.localeCompare(b.id))
    .map((c) => c.id);
}

/** Punti di un equipaggio: per ordine eseguito, per lo scafo rimasto e, tra più squadre, per il piazzamento (0-based). */
export function crewPoints(cfg: ScoringConfig, crew: CrewScore, rank: number, podium: boolean): number {
  return cfg.stepPoints * crew.done + Math.round((cfg.hullBonus * crew.hull) / 100) + (podium ? (cfg.podiumPoints[rank] ?? 0) : 0);
}
