import { expect } from "vitest";
import type { InputMeta, MinigameContext } from "@gioco/shared";
import { type ArtificieriState, artificieri as plugin, artificieriConfigSchema, fakeRemaining } from "./index.js";
import { MODULES } from "./bomb.js";
import type { ModuleInstance } from "./modules/types.js";
import { MAZE_SIZE, type MazeData, type MazeRules, mazeFor } from "./modules/maze.js";
import { step } from "../maze.js";

/** Funzioni comuni ai test di Artificieri: partenze, input con ora e ritardo, soluzioni e errori garantiti. */
export type S = ArtificieriState;

export const T0 = 1_000_000;

/** Parole di 5 lettere per il modulo «Parola» nei test (in produzione vengono da una lista della libreria). */
export const TEST_WORDS = [
  "PIZZA", "LIBRO", "PORTA", "SEDIA", "NOTTE", "FIORE", "PIANO", "TRENO", "MONDO", "CIELO", "FUOCO", "LATTE", "VENTO", "ACQUA", "ISOLA",
  "RADIO", "BARCA", "CARTA", "FORNO", "PRATO", "TORRE", "LUNGO", "MANGO", "PESCE", "POLLO", "BIRRA", "DENTE", "GAMBA", "PUNTO", "ROSSO",
  "VERDE", "NERVO", "SOGNO", "TEMPO", "VALLE",
];

/** `enabledModules` con solo i tipi indicati (gli altri spenti): la configurazione ha un default per ogni tipo. */
export const only = (...kinds: string[]) => Object.fromEntries(["wires", "button", "symbols", "colors", "maze", "word"].map((k) => [k, kinds.includes(k)]));

export const roster = (n: number, teamId: string | null, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, nickname: `${prefix.toUpperCase()}${i + 1}`, teamId }));
export const TEAMS = [
  { id: "ta", name: "Alfa" },
  { id: "tb", name: "Beta" },
];
export const ctxFor = (seed: number, extra: Partial<MinigameContext> = {}): MinigameContext => ({
  players: [...roster(3, "ta", "a"), ...roster(3, "tb", "b")],
  teams: TEAMS,
  seed,
  ...extra,
});
export const cfg = (over: Record<string, unknown> = {}) => artificieriConfigSchema.parse({ words: TEST_WORDS, ...over });
export const start = (seed = 1, over: Record<string, unknown> = {}, ctx = ctxFor(seed)): S => plugin.init(cfg(over), ctx, T0);

export const meta = (at: number, claimed = at, rtt: number | null = 30): InputMeta => ({ receivedAt: at, claimedTime: claimed, rtt });
export const input = (s: S, id: string, i: Record<string, unknown>, at: number, claimed = at, rtt: number | null = 30): S => plugin.onInput(s, id, plugin.inputSchema.parse(i), meta(at, claimed, rtt));
export const host = (s: S, type: string, at: number): S => plugin.onHostCommand(s, plugin.commandSchema.parse({ type }), at);

/** Porta lo stato fino al disinnesco (scommesse saltate): l'artificiere ha premuto «Inizia» a T0 + 1000. */
export function toDefuse(s: S): S {
  let cur = s;
  if (cur.phase === "bet") cur = plugin.onTick(cur, cur.phaseEndsAt! + 1);
  expect(cur.phase).toBe("briefing");
  cur = input(cur, cur.bomb!.defuserId, { type: "start" }, T0 + 1000);
  expect(cur.phase).toBe("defuse");
  return cur;
}

export const solutionOf = (s: S, mod: ModuleInstance) => MODULES[mod.kind].solution({ data: mod.data, rules: s.bomb!.rules[mod.kind], edge: s.bomb!.edgework, progress: mod.progress, strikes: s.bomb!.strikes });

/** Ora server a cui il timer della bomba mostra `ms` rimasti (con il timer a velocità `speed`). */
export const timeFor = (s: S, ms: number) => s.bomb!.clock.at + (s.bomb!.clock.remainingMs - ms) / s.bomb!.speed;

/** Tempo finto rimasto a metà di un secondo, con la cifra delle unità richiesta, più basso possibile ma sotto `below`. */
export function midSecondWithDigit(digit: number, below: number): number {
  for (let k = Math.floor((below - 500) / 1000); k >= 0; k--) if ((k + 1) % 10 === digit) return 500 + 1000 * k;
  throw new Error("nessun istante");
}

/** Gioca la soluzione di un modulo; ritorna il nuovo stato. Il rilascio del pulsante avviene su un istante con la cifra giusta. */
export function solveModule(s: S, mod: ModuleInstance, at: number): S {
  let cur = s;
  const sol = solutionOf(s, mod);
  for (const a of sol.actions) {
    let when = at;
    if (a.type === "release") when = timeFor(cur, midSecondWithDigit(sol.releaseDigit!, fakeRemaining(cur.bomb!, at)));
    cur = input(cur, cur.bomb!.defuserId, { ...a, module: mod.id }, when);
  }
  return cur;
}

/** Fa un errore (all'ora `at`): prova le azioni sbagliate possibili finché una costa un errore. */
export function strikeAt(s: S, at: number): S {
  const b = s.bomb!;
  for (const mod of b.modules.filter((m) => !m.solved)) {
    const sol = solutionOf(s, mod);
    const candidates: Record<string, unknown>[] = [];
    if (mod.kind === "wires") {
      const cut = (mod.progress as { cut: number[] }).cut;
      const right = (sol.actions[0] as { wire: number }).wire;
      for (let wire = 0; wire < (mod.data as { wires: unknown[] }).wires.length; wire++) if (wire !== right && !cut.includes(wire)) candidates.push({ type: "cut", module: mod.id, wire });
    } else if (mod.kind === "button") {
      candidates.push(sol.actions[0]!.type === "tap" ? { type: "hold", module: mod.id } : { type: "tap", module: mod.id });
    } else if (mod.kind === "colors") {
      const next = (sol.actions[0] as { key: number }).key;
      for (let key = 0; key < 4; key++) if (key !== next) candidates.push({ type: "press", module: mod.id, key });
    } else if (mod.kind === "maze") {
      const maze = { w: MAZE_SIZE, h: MAZE_SIZE, cells: mazeFor(b.rules.maze as MazeRules, (mod.data as MazeData).marks).cells };
      for (const dir of ["up", "down", "left", "right"] as const) if (step(maze, (mod.progress as { pos: number }).pos, dir) === null) candidates.push({ type: "move", module: mod.id, dir });
    } else if (mod.kind === "word") {
      candidates.push({ type: "submit", module: mod.id });
    } else {
      const pressed = (mod.progress as { pressed: number[] }).pressed;
      const next = (sol.actions[0] as { key: number }).key;
      for (let key = 0; key < (mod.data as { symbols: unknown[] }).symbols.length; key++) if (key !== next && !pressed.includes(key)) candidates.push({ type: "press", module: mod.id, key });
    }
    for (const c of candidates) {
      const out = input(s, b.defuserId, c, at);
      if (out.bomb!.strikes > b.strikes) return out;
    }
  }
  throw new Error("nessun errore possibile");
}

/** Cerca un seme in cui il primo turno ha la proprietà richiesta. */
export function findSeed(over: Record<string, unknown>, pred: (s: S) => boolean): number {
  for (let seed = 1; seed < 500; seed++) if (pred(start(seed, over))) return seed;
  throw new Error("nessun seme adatto");
}

export function toDefuseFrom(s: S): S {
  let cur = s;
  if (cur.phase === "bet") cur = plugin.onTick(cur, cur.phaseEndsAt! + 1);
  return host(cur, "start", cur.phaseStartedAt + 1000);
}
