import { shuffle } from "../knight-duel/rng.js";

export interface PairingFighter {
  id: string;
  status: "W" | "L";
  lastOpponent: string | null;
  /** Era il giocatore rimasto solo (bye o NPC) nel turno precedente. */
  oddLastTurn: boolean;
}

export interface Pairing {
  pairs: [string, string][];
  /** Il giocatore rimasto solo con un numero dispari. */
  odd: string | null;
}

/** Il rimasto solo: prima un L, poi un W; mai chi lo era già nel turno prima (se c'è alternativa). */
function pickOdd(fighters: PairingFighter[], rng: () => number): string {
  const order = (list: PairingFighter[]) => shuffle(list, rng);
  const candidates = [
    ...order(fighters.filter((f) => f.status === "L" && !f.oddLastTurn)),
    ...order(fighters.filter((f) => f.status === "L")),
    ...order(fighters.filter((f) => !f.oddLastTurn)),
    ...order(fighters),
  ];
  return candidates[0]!.id;
}

/**
 * Accoppiamento automatico: W con W e L con L (se i gruppi sono dispari, l'ultimo W affronta il primo L),
 * evitando di rifare l'ultimo scontro. Con numero dispari uno resta solo (`odd`).
 */
export function pairTurn(fighters: PairingFighter[], rng: () => number): Pairing {
  if (fighters.length < 2) return { pairs: [], odd: null };
  const odd = fighters.length % 2 === 1 ? pickOdd(fighters, rng) : null;
  const rest = fighters.filter((f) => f.id !== odd);
  const last = new Map(rest.map((f) => [f.id, f.lastOpponent]));

  let best: [string, string][] | null = null;
  let bestRematches = Infinity;
  for (let attempt = 0; attempt < 60 && bestRematches > 0; attempt++) {
    const line = [...shuffle(rest.filter((f) => f.status === "W"), rng), ...shuffle(rest.filter((f) => f.status === "L"), rng)];
    const pairs: [string, string][] = [];
    for (let i = 0; i + 1 < line.length; i += 2) pairs.push([line[i]!.id, line[i + 1]!.id]);
    const rematches = pairs.filter(([x, y]) => last.get(x) === y || last.get(y) === x).length;
    if (rematches < bestRematches) {
      best = pairs;
      bestRematches = rematches;
    }
  }
  return { pairs: best ?? [], odd };
}
