import { doorOpen, patrolCell } from "@gioco/shared";
import { type Dir, step } from "../maze.js";
import { type Course, asMaze } from "./generate.js";

/**
 * Il movimento del pilota: regole pure, giudicate all'ora equa (`at`, ora server) e non a quella di arrivo.
 * Un passo per volta, al massimo uno ogni `stepMs`; mine, pattuglie e porte chiuse costano un blocco.
 */

export interface LaneRun {
  pos: number;
  /** L'ultimo punto di controllo raggiunto: ci si torna dopo una mina o una pattuglia. */
  lastCheckpoint: number;
  /** Fermo fino a quest'ora (ms, ora server). */
  frozenUntil: number;
  lastStepAt: number;
  keysTaken: number[];
  /** Mine calpestate: diventano note a tutti. */
  minesHit: number[];
  strikes: number;
  /** Ora (equa) dell'arrivo; `null` finché non arriva. */
  finishedAt: number | null;
}

export type StepEvent = "move" | "wall" | "bump" | "mine" | "patrol" | "key" | "exit" | "rejected";

export interface MoveRules {
  stepMs: number;
  penaltyMs: number;
  /** Fermo dopo l'urto contro una porta chiusa. */
  bumpMs: number;
}

export const BUMP_MS = 1_000;

/** «Mai» come numero finito: lo stato è JSON (con `-Infinity` diventerebbe `null`). */
const NEVER = -1e12;

export function initialRun(course: Course): LaneRun {
  return { pos: course.start, lastCheckpoint: course.start, frozenUntil: 0, lastStepAt: NEVER, keysTaken: [], minesHit: [], strikes: 0, finishedAt: null };
}

/** Chiavi che servono per aprire l'uscita: tutte quelle del livello. */
export const keysNeeded = (course: Course): number => course.keys.length;

export const hasAllKeys = (course: Course, run: LaneRun): boolean => run.keysTaken.length >= keysNeeded(course);

/** Una pattuglia è sulla casella `cell` all'istante `elapsedMs`? */
export const patrolOn = (course: Course, cell: number, elapsedMs: number): boolean => course.patrols.some((p) => patrolCell(p, elapsedMs) === cell);

function hurt(run: LaneRun, at: number, rules: MoveRules): LaneRun {
  return { ...run, pos: run.lastCheckpoint, frozenUntil: at + rules.penaltyMs, lastStepAt: at, strikes: run.strikes + 1 };
}

/**
 * Un passo del pilota verso `dir` all'ora equa `at`. `levelStartedAt` dà il tempo del livello alle porte e alle pattuglie.
 * Restituisce la stessa `run` (stesso oggetto) se il passo non conta nulla: fermo, troppo presto, già arrivato, muro.
 */
export function stepLane(course: Course, run: LaneRun, dir: Dir, at: number, levelStartedAt: number, rules: MoveRules): { run: LaneRun; event: StepEvent } {
  if (run.finishedAt !== null || at < run.frozenUntil || at < run.lastStepAt + rules.stepMs) return { run, event: "rejected" };
  const next = step(asMaze(course), run.pos, dir);
  if (next === null) return { run, event: "wall" };
  const elapsed = at - levelStartedAt;

  const door = course.doors.find((d) => d.cell === next);
  if (door && !doorOpen(door, elapsed)) return { run: { ...run, frozenUntil: at + rules.bumpMs, lastStepAt: at }, event: "bump" };

  if (course.mines.includes(next)) {
    const minesHit = run.minesHit.includes(next) ? run.minesHit : [...run.minesHit, next];
    return { run: { ...hurt(run, at, rules), minesHit }, event: "mine" };
  }
  if (patrolOn(course, next, elapsed)) return { run: hurt(run, at, rules), event: "patrol" };

  let moved: LaneRun = { ...run, pos: next, lastStepAt: at };
  let event: StepEvent = "move";
  if (course.keys.includes(next) && !run.keysTaken.includes(next)) {
    moved = { ...moved, keysTaken: [...moved.keysTaken, next] };
    event = "key";
  }
  if (course.checkpoints.includes(next)) moved = { ...moved, lastCheckpoint: next };
  if (next === course.exit && hasAllKeys(course, moved)) {
    moved = { ...moved, finishedAt: at };
    event = "exit";
  }
  return { run: moved, event };
}

/**
 * Una pattuglia raggiunge il pilota fermo (o appena tornato a un punto di controllo): come una mina. Si valuta a ogni
 * tick. Restituisce la stessa `run` se non succede nulla.
 */
export function patrolCatch(course: Course, run: LaneRun, at: number, levelStartedAt: number, rules: MoveRules): LaneRun {
  if (run.finishedAt !== null || at < run.frozenUntil) return run;
  return patrolOn(course, run.pos, at - levelStartedAt) ? hurt(run, at, rules) : run;
}
