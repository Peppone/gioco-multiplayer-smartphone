import { describe, expect, it } from "vitest";
import { makeRng } from "./knight-duel/rng.js";
import { DIRS, type Dir, type Maze, cellIndex, directionsOf, distances, generateMaze, neighbour, passages, shortestPath, step } from "./maze.js";

const DIR_LIST = Object.keys(DIRS) as Dir[];

/** Distanze tra tutte le coppie di celle con Floyd-Warshall, indipendente dalla BFS del modulo. */
function allPairs(m: Maze): number[][] {
  const n = m.w * m.h;
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (let i = 0; i < n; i++) for (const dir of DIR_LIST) { const j = step(m, i, dir); if (j !== null) d[i]![j] = 1; }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i]![k]! + d[k]![j]! < d[i]![j]!) d[i]![j] = d[i]![k]! + d[k]![j]!;
  return d;
}

describe("generatore di labirinti", () => {
  it("è deterministico: stesso seme, stesso labirinto", () => {
    for (let seed = 1; seed <= 50; seed++) expect(generateMaze(6, 6, makeRng(seed))).toEqual(generateMaze(6, 6, makeRng(seed)));
    expect(generateMaze(6, 6, makeRng(1))).not.toEqual(generateMaze(6, 6, makeRng(2)));
  });

  it("i passaggi sono simmetrici e non escono dalla griglia", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const m = generateMaze(6, 6, makeRng(seed), { loops: seed % 5 });
      for (let i = 0; i < m.cells.length; i++) {
        for (const d of DIR_LIST) {
          const open = (m.cells[i]! & DIRS[d].bit) !== 0;
          const j = neighbour(m, i, d);
          if (open) {
            expect(j, `seme ${seed}: passaggio verso il bordo`).not.toBeNull();
            expect(step(m, i, d)).toBe(j);
            expect(m.cells[j!]! & DIRS[d].opposite, `seme ${seed}: passaggio a senso unico`).not.toBe(0);
          } else {
            expect(step(m, i, d)).toBeNull();
          }
        }
      }
    }
  });

  it("senza cicli è perfetto: tutte le celle raggiungibili e un solo percorso tra due celle (w×h−1 passaggi)", () => {
    for (const [w, h] of [[6, 6], [4, 7], [1, 5], [8, 8], [2, 2]] as const) {
      for (let seed = 1; seed <= 100; seed++) {
        const m = generateMaze(w, h, makeRng(seed));
        expect(passages(m), `${w}×${h} seme ${seed}`).toBe(w * h - 1);
        expect(distances(m, 0).every((d) => d >= 0), "tutte le celle raggiungibili").toBe(true);
      }
    }
  });

  it("con `loops` ci sono cicli: tanti passaggi in più, e mai oltre i muri esistenti", () => {
    for (let loops = 1; loops <= 6; loops++) {
      for (let seed = 1; seed <= 50; seed++) {
        const m = generateMaze(6, 6, makeRng(seed), { loops });
        expect(passages(m)).toBe(35 + loops);
        expect(distances(m, 0).every((d) => d >= 0)).toBe(true);
      }
    }
    // chiedere troppi cicli apre tutti i muri e basta
    const full = generateMaze(3, 3, makeRng(1), { loops: 99 });
    expect(passages(full)).toBe(12);
  });

  it("il percorso più breve è davvero il più breve (confronto con Floyd-Warshall) e si può percorrere", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = generateMaze(6, 6, makeRng(seed), { loops: seed % 4 });
      const ref = allPairs(m);
      for (const [from, to] of [[0, 35], [5, 30], [14, 21], [7, 7]] as const) {
        const path = shortestPath(m, from, to)!;
        expect(path[0]).toBe(from);
        expect(path.at(-1)).toBe(to);
        expect(path.length - 1, `seme ${seed}: ${from}→${to}`).toBe(ref[from]![to]);
        expect(distances(m, from)[to]).toBe(ref[from]![to]);
        // seguendo le direzioni si arriva davvero, senza muri
        let at: number = from;
        for (const d of directionsOf(m, path)) {
          const next = step(m, at, d);
          expect(next, "muro lungo il percorso").not.toBeNull();
          at = next!;
        }
        expect(at).toBe(to);
      }
    }
  });

  it("nessun percorso se le celle non sono collegate", () => {
    const m: Maze = { w: 2, h: 1, cells: [0, 0] };
    expect(shortestPath(m, 0, 1)).toBeNull();
    expect(distances(m, 0)).toEqual([0, -1]);
    expect(shortestPath(m, 0, 0)).toEqual([0]);
  });

  it("gli indici e i confini sono coerenti", () => {
    const m = generateMaze(4, 3, makeRng(3));
    expect(cellIndex(m, 3, 2)).toBe(11);
    expect(neighbour(m, 0, "up")).toBeNull();
    expect(neighbour(m, 0, "left")).toBeNull();
    expect(neighbour(m, 11, "right")).toBeNull();
    expect(neighbour(m, 11, "down")).toBeNull();
    expect(neighbour(m, 5, "right")).toBe(6);
  });
});
