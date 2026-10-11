import { describe, expect, it } from "vitest";
import { DEFAULT_DECK, deckSchema } from "./cards.js";
import { type SimResult, simulateDuel } from "./simulate.js";

const N = 1000;
// Valori di default della modalità: 20 PV e 6 cicli massimi (con 30 PV i duelli durano troppo per una serata).
const HP = 20;
const MAX_BATTLES = 6;
const run = (over: Partial<Parameters<typeof simulateDuel>[0]> = {}): SimResult[] =>
  Array.from({ length: N }, (_, i) => simulateDuel({ deck: DEFAULT_DECK, hp: HP, maxBattles: MAX_BATTLES, seed: i + 1, ...over }));

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe("mazzo base", () => {
  it("è valido secondo lo schema e ha circa 15 carte diverse", () => {
    const parsed = deckSchema.parse(DEFAULT_DECK);
    expect(parsed.cards.length).toBe(15);
    expect(new Set(parsed.cards.map((c) => c.id)).size).toBe(15);
  });

  it("rifiuta mazzi con identificatori ripetuti e effetti senza valore", () => {
    const dup = { cards: [DEFAULT_DECK.cards[0]!, DEFAULT_DECK.cards[0]!, DEFAULT_DECK.cards[1]!] };
    expect(deckSchema.safeParse(dup).success).toBe(false);
    const bad = { cards: DEFAULT_DECK.cards.map((c, i) => (i === 0 ? { ...c, effects: [{ kind: "attack", amount: 0 }] } : c)) };
    expect(deckSchema.safeParse(bad).success).toBe(false);
  });
});

describe(`simulazione di ${N} duelli tra bot casuali (mazzo base, ${HP} PV)`, () => {
  const results = run();

  it("ogni duello finisce con un vincitore: nessun loop infinito", () => {
    expect(results.every((r) => r.winner === 0 || r.winner === 1)).toBe(true);
    expect(Math.max(...results.map((r) => r.battles))).toBeLessThanOrEqual(MAX_BATTLES + 10); // cicli + oltranza
  });

  it("la durata è ragionevole: pochi cicli, quasi sempre per KO", () => {
    const med = median(results.map((r) => r.battles));
    expect(med).toBeGreaterThanOrEqual(3);
    expect(med).toBeLessThanOrEqual(6);
    expect(results.filter((r) => r.ko).length / N).toBeGreaterThan(0.6);
  });

  it("i due lati sono alla pari: nessun vantaggio per chi è «lato 0»", () => {
    const wins0 = results.filter((r) => r.winner === 0).length / N;
    expect(wins0).toBeGreaterThan(0.45);
    expect(wins0).toBeLessThan(0.55);
  });

  it("la mano non cresce all'infinito", () => {
    const avg = results.reduce((s, r) => s + r.avgHand, 0) / N;
    expect(avg).toBeLessThan(8);
  });

  it("nessuna carta è degenere: l'esito resta equilibrato per ogni carta giocata", () => {
    const stats = new Map<string, { w: number; n: number }>();
    for (const r of results) {
      for (const side of [0, 1] as const) {
        for (const id of r.playedCards[side]) {
          const s = stats.get(id) ?? { w: 0, n: 0 };
          s.n++;
          if (r.winner === side) s.w++;
          stats.set(id, s);
        }
      }
    }
    const table = [...stats].map(([id, s]) => ({ id, n: s.n, win: s.w / s.n })).sort((a, b) => b.win - a.win);
    // Per tarare il mazzo: `pnpm exec vitest run knight-duel/simulation` mostra la tabella.
    console.log("\nCarta · duelli in cui è giocata · % vittorie\n" + table.map((t) => `${t.id.padEnd(12)} ${String(t.n).padStart(4)}  ${(t.win * 100).toFixed(1)}%`).join("\n"));
    for (const t of table) {
      expect(t.n, `${t.id} deve comparire`).toBeGreaterThan(100);
      expect(t.win, `${t.id}: troppo debole`).toBeGreaterThan(0.38);
      expect(t.win, `${t.id}: troppo forte`).toBeLessThan(0.62);
    }
  });

  it("la simulazione è deterministica: stesso seme, stesso duello", () => {
    const a = simulateDuel({ deck: DEFAULT_DECK, hp: HP, seed: 123 });
    const b = simulateDuel({ deck: DEFAULT_DECK, hp: HP, seed: 123 });
    expect({ ...a, playedCards: [[...a.playedCards[0]], [...a.playedCards[1]]] }).toEqual({ ...b, playedCards: [[...b.playedCards[0]], [...b.playedCards[1]]] });
  });
});
