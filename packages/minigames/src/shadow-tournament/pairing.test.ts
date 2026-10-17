import { describe, expect, it } from "vitest";
import { makeRng } from "../knight-duel/rng.js";
import { type PairingFighter, pairTurn } from "./pairing.js";

const fighters = (n: number, losers = 0): PairingFighter[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, status: i < losers ? ("L" as const) : ("W" as const), lastOpponent: null, oddLastTurn: false }));

describe("accoppiamento", () => {
  it("da 2 a 30 giocatori: nessuno in due coppie, nessuno escluso tranne il rimasto solo", () => {
    for (let n = 2; n <= 30; n++) {
      for (let seed = 1; seed <= 5; seed++) {
        const { pairs, odd } = pairTurn(fighters(n, Math.floor(n / 3)), makeRng(seed));
        const used = [...pairs.flat(), ...(odd ? [odd] : [])];
        expect(new Set(used).size, `n=${n}`).toBe(n);
        expect(odd === null).toBe(n % 2 === 0);
        expect(pairs.length).toBe(Math.floor(n / 2));
      }
    }
  });

  it("W con W e L con L quando i gruppi sono pari", () => {
    const f = fighters(8, 4);
    const status = new Map(f.map((x) => [x.id, x.status]));
    for (let seed = 1; seed <= 20; seed++) {
      for (const [x, y] of pairTurn(f, makeRng(seed)).pairs) expect(status.get(x)).toBe(status.get(y));
    }
  });

  it("con gruppi dispari un solo accoppiamento misto, e il rimasto solo è un L", () => {
    const f = fighters(7, 3); // 4 W e 3 L: resta solo un L, poi 4 W e 2 L
    for (let seed = 1; seed <= 20; seed++) {
      const { pairs, odd } = pairTurn(f, makeRng(seed));
      expect(f.find((x) => x.id === odd)!.status).toBe("L");
      const status = new Map(f.map((x) => [x.id, x.status]));
      expect(pairs.filter(([x, y]) => status.get(x) !== status.get(y))).toHaveLength(0);
    }
  });

  it("senza L il rimasto solo è un W", () => {
    const { odd } = pairTurn(fighters(5), makeRng(3));
    expect(odd).not.toBeNull();
  });

  it("il rimasto solo non è lo stesso due turni di fila (se c'è alternativa)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const f = fighters(5, 3).map((x) => (x.id === "p0" ? { ...x, oddLastTurn: true } : x));
      expect(pairTurn(f, makeRng(seed)).odd).not.toBe("p0");
    }
  });

  it("evita di rifare l'ultimo scontro quando possibile", () => {
    const f = fighters(6).map((x, i) => ({ ...x, lastOpponent: `p${i ^ 1}` })); // p0-p1, p2-p3, p4-p5 si sono appena affrontati
    for (let seed = 1; seed <= 20; seed++) {
      for (const [x, y] of pairTurn(f, makeRng(seed)).pairs) expect(Number(x.slice(1)) ^ 1).not.toBe(Number(y.slice(1)));
    }
  });

  it("con un solo giocatore non ci sono coppie", () => {
    expect(pairTurn(fighters(1), makeRng(1))).toEqual({ pairs: [], odd: null });
  });
});
