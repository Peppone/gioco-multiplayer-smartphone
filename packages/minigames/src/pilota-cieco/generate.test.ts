import { describe, expect, it } from "vitest";
import { doorChangesIn, doorOpen, patrolCell, patrolIndex } from "@gioco/shared";
import { type Dir, DIRS, step } from "../maze.js";
import { type Course, type LevelParams, type Mode, type Size, asMaze, generateCourse, generateCourses, levelSpec, remainingSteps, routeLength } from "./generate.js";
import { type LaneRun, initialRun, stepLane } from "./move.js";

const base: LevelParams = { mode: "insieme", size: "medio", mineDensity: 8, doors: 3, keys: 1, patrols: true };
const DIR_LIST = Object.keys(DIRS) as Dir[];

describe("parametri dei livelli", () => {
  it("la griglia cresce di 2 a livello fino al massimo (13 in «insieme», 15 «a turno»)", () => {
    const sides = (mode: Mode, size: Size) => [1, 2, 3, 4, 5].map((l) => levelSpec({ ...base, mode, size }, l).w);
    expect(sides("insieme", "piccolo")).toEqual([9, 11, 13, 13, 13]);
    expect(sides("insieme", "medio")).toEqual([11, 13, 13, 13, 13]);
    expect(sides("insieme", "grande")).toEqual([13, 13, 13, 13, 13]);
    expect(sides("a-turno", "piccolo")).toEqual([9, 11, 13, 15, 15]);
    expect(sides("a-turno", "grande")).toEqual([13, 15, 15, 15, 15]);
  });

  it("più mine, porte più veloci e pattuglie dal livello 2 (solo se attive)", () => {
    const l1 = levelSpec(base, 1);
    const l3 = levelSpec(base, 3);
    expect(l1.patrols).toBe(0);
    expect(levelSpec(base, 2).patrols).toBe(1);
    expect(l3.patrols).toBe(2);
    expect(levelSpec({ ...base, patrols: false }, 3).patrols).toBe(0);
    expect(l3.doorPeriod).toBeLessThan(l1.doorPeriod);
    expect(l3.patrolStepMs).toBeLessThan(levelSpec(base, 2).patrolStepMs);
    expect(l3.mines).toBeGreaterThan(l1.mines);
    expect(levelSpec({ ...base, mineDensity: 0 }, 2).mines).toBe(0);
    expect(l1.doors).toBe(3);
    expect(levelSpec(base, 1).keys).toBe(1);
  });
});

/** Un livello è ben formato: percorso valido, mine lontane dal percorso, porte e pattuglie dove devono stare. */
function expectWellFormed(c: Course, spec: ReturnType<typeof levelSpec>, label: string) {
  const maze = asMaze(c);
  const n = c.w * c.h;
  expect(c.route[0], `${label}: il percorso parte dall'ingresso`).toBe(c.start);
  expect(c.route.at(-1), `${label}: e finisce all'uscita`).toBe(c.exit);
  c.route.slice(1).forEach((cell, i) => {
    const prev = c.route[i]!;
    expect(DIR_LIST.some((d) => step(maze, prev, d) === cell), `${label}: passo ${i} del percorso attraversa un muro`).toBe(true);
  });
  for (const k of c.keys) expect(c.route, `${label}: il percorso passa dalle chiavi`).toContain(k);
  expect(c.keys).toHaveLength(spec.keys);
  const route = new Set(c.route);
  for (const m of c.mines) expect(route.has(m), `${label}: mina sul percorso`).toBe(false);
  expect(new Set(c.mines).size).toBe(c.mines.length);
  expect(c.mines.length, `${label}: mine`).toBe(spec.mines);
  const special = new Set([c.start, c.exit, ...c.keys, ...c.checkpoints]);
  for (const m of c.mines) expect(special.has(m), `${label}: mina su una casella speciale`).toBe(false);
  expect(c.checkpoints[0]).toBe(c.start);
  expect(new Set(c.checkpoints).size).toBe(c.checkpoints.length);
  expect(new Set(c.doors.map((d) => d.cell)).size, `${label}: porte distinte`).toBe(c.doors.length);
  expect(c.doors).toHaveLength(spec.doors);
  for (const d of c.doors) {
    expect(special.has(d.cell), `${label}: porta su una casella speciale`).toBe(false);
    expect(c.mines).not.toContain(d.cell);
    expect(d.period).toBe(spec.doorPeriod);
    expect(d.offset).toBeGreaterThanOrEqual(0);
  }
  if (spec.doors > 0 && c.route.length > 6) expect(c.doors.some((d) => route.has(d.cell)), `${label}: almeno una porta sul percorso`).toBe(true);
  expect(c.patrols.length).toBeLessThanOrEqual(spec.patrols);
  expect(c.patrols.length, `${label}: pattuglie`).toBe(spec.patrols);
  for (const p of c.patrols) {
    expect(p.path.length).toBeGreaterThanOrEqual(3);
    expect(new Set(p.path).size).toBe(p.path.length);
    p.path.slice(1).forEach((cell, i) => expect(DIR_LIST.some((d) => step(maze, p.path[i]!, d) === cell), `${label}: tratto di pattuglia con un muro`).toBe(true));
    for (const cell of p.path) expect(special.has(cell), `${label}: pattuglia su una casella speciale`).toBe(false);
    expect(p.stepMs).toBe(spec.patrolStepMs);
  }
  for (const cell of [...c.mines, ...c.keys, ...c.checkpoints, ...c.doors.map((d) => d.cell), c.start, c.exit]) {
    expect(cell).toBeGreaterThanOrEqual(0);
    expect(cell).toBeLessThan(n);
  }
}

describe("generatore di un livello", () => {
  it("è deterministico: stesso seme, stesso livello", () => {
    const spec = levelSpec(base, 2);
    for (let seed = 1; seed <= 100; seed++) expect(generateCourse(seed, spec)).toEqual(generateCourse(seed, spec));
    expect(generateCourse(1, spec)).not.toEqual(generateCourse(2, spec));
  });

  it("per 5000 semi (tutti i livelli, dimensioni e opzioni) il livello è ben formato", () => {
    const sizes: Size[] = ["piccolo", "medio", "grande"];
    for (let seed = 1; seed <= 5000; seed++) {
      const params: LevelParams = { mode: seed % 2 ? "insieme" : "a-turno", size: sizes[seed % 3]!, mineDensity: [0, 4, 8, 20][seed % 4]!, doors: seed % 9, keys: seed % 4, patrols: seed % 5 !== 0 };
      const level = (seed % 5) + 1;
      const spec = levelSpec(params, level);
      expectWellFormed(generateCourse(seed, spec), spec, `seme ${seed} livello ${level}`);
    }
  });

  it("ogni livello si può vincere: un pilota che segue il percorso e aspetta porte e pattuglie arriva (simulazione)", () => {
    const rules = { stepMs: 350, penaltyMs: 3000, bumpMs: 1000 };
    for (let seed = 1; seed <= 150; seed++) {
      const spec = levelSpec({ ...base, mode: "a-turno", size: "piccolo", keys: seed % 3 }, (seed % 5) + 1);
      const c = generateCourse(seed, spec);
      let run: LaneRun = initialRun(c);
      let idx = 0;
      for (let at = 100; at < 1_200_000 && run.finishedAt === null; at += 100) {
        const next = c.route[idx + 1]!;
        // un pilota attento aspetta: niente passo se la porta davanti è chiusa o se una pattuglia sarebbe lì
        const door = c.doors.find((d) => d.cell === next);
        if ((door && !doorOpen(door, at)) || c.patrols.some((p) => patrolCell(p, at) === next)) continue;
        const dir = DIR_LIST.find((d) => step(asMaze(c), run.pos, d) === next)!;
        const out = stepLane(c, run, dir, at, 0, rules);
        if (out.event === "move" || out.event === "key" || out.event === "exit") {
          run = out.run;
          idx++;
        }
      }
      expect(run.finishedAt, `seme ${seed}: arrivo entro 20 minuti simulati`).not.toBeNull();
      const strikes = run.strikes;
      expect(strikes, "nessuna mina sul percorso").toBe(0);
    }
  });
});

describe("equità tra le squadre", () => {
  it("stesse caratteristiche e percorsi entro il 10% della media, ma labirinti diversi (2000 prove)", () => {
    for (let trial = 1; trial <= 2000; trial++) {
      const teams = 2 + (trial % 3);
      const level = (trial % 5) + 1;
      const spec = levelSpec({ ...base, size: (["piccolo", "medio", "grande"] as const)[trial % 3]!, keys: trial % 3 }, level);
      const courses = generateCourses(trial, level, spec, teams);
      expect(courses).toHaveLength(teams);
      const lengths = courses.map(routeLength);
      const mean = lengths.reduce((a, b) => a + b, 0) / teams;
      for (const [i, len] of lengths.entries()) expect(Math.abs(len - mean) / mean, `prova ${trial}, squadra ${i}: ${lengths.join(",")}`).toBeLessThanOrEqual(0.1);
      for (const c of courses) {
        expect(c.mines.length).toBe(courses[0]!.mines.length);
        expect(c.doors.length).toBe(courses[0]!.doors.length);
        expect(c.keys.length).toBe(courses[0]!.keys.length);
        expect(c.patrols.length).toBe(courses[0]!.patrols.length);
        expect(c.w).toBe(spec.w);
      }
      expect(new Set(courses.map((c) => JSON.stringify(c.cells))).size, "labirinti tutti diversi").toBe(teams);
    }
  }, 120_000);

  it("stessi semi, stessi livelli", () => {
    const spec = levelSpec(base, 2);
    expect(generateCourses(7, 2, spec, 4)).toEqual(generateCourses(7, 2, spec, 4));
    expect(generateCourses(7, 2, spec, 4)).not.toEqual(generateCourses(7, 3, spec, 4));
  });
});

describe("strada che resta", () => {
  it("dall'ingresso è il percorso intero, sull'uscita è zero, e cala lungo il percorso (le chiavi in tasca contano)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const spec = levelSpec({ ...base, keys: 1 + (seed % 3) }, 1);
      const c = generateCourse(seed, spec);
      expect(remainingSteps(c, c.start, [])).toBe(routeLength(c));
      expect(remainingSteps(c, c.exit, c.keys)).toBe(0);
      expect(remainingSteps(c, c.exit, [])).toBeGreaterThan(0);
      const left = c.route.map((cell, i) => remainingSteps(c, cell, c.keys.filter((k) => c.route.indexOf(k) <= i)));
      for (let i = 1; i < left.length; i++) expect(left[i]!, `seme ${seed}, passo ${i}`).toBeLessThanOrEqual(left[i - 1]!);
    }
  });
});

describe("porte e pattuglie nel tempo (timeline condivisa)", () => {
  it("la porta alterna aperta e chiusa ogni `period`, sfasata da `offset`, e dice quando cambia", () => {
    const d = { cell: 3, period: 1000, offset: 0 };
    expect([0, 999, 1000, 1999, 2000, 3500].map((t) => doorOpen(d, t))).toEqual([true, true, false, false, true, false]);
    const shifted = { ...d, offset: 500 };
    expect([0, 499, 500, 1499, 1500].map((t) => doorOpen(shifted, t))).toEqual([true, true, false, false, true]);
    expect(doorChangesIn(d, 0)).toBe(1000);
    expect(doorChangesIn(d, 1)).toBe(999);
    expect(doorChangesIn(d, 999)).toBe(1);
    expect(doorChangesIn(d, 1000)).toBe(1000);
    // la risposta dipende solo dall'istante: stesso istante, stessa risposta
    for (let t = -3000; t < 5000; t += 137) expect(doorOpen(d, t)).toBe(doorOpen(d, t));
    expect(doorOpen(d, -1)).toBe(false);
  });

  it("la pattuglia va e torna lungo il percorso senza saltare caselle", () => {
    const p = { path: [10, 11, 12, 13], stepMs: 500, offset: 0 };
    const seq = Array.from({ length: 14 }, (_, k) => patrolIndex(p, k * 500));
    expect(seq).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1]);
    expect(patrolCell(p, 1250)).toBe(12);
    expect(patrolIndex({ ...p, offset: 500 }, 0)).toBe(1);
    expect(patrolIndex({ path: [5], stepMs: 100, offset: 0 }, 12345)).toBe(0);
    for (let t = -5000; t < 9000; t += 111) expect(p.path).toContain(patrolCell(p, t));
    // due calcoli (server e telefono) con lo stesso orologio danno lo stesso risultato
    expect(patrolCell(p, 7777)).toBe(patrolCell({ ...p }, 7777));
  });
});
