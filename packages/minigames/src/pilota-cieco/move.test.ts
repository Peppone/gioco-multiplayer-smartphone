import { describe, expect, it } from "vitest";
import { fairTime } from "@gioco/shared";
import { LEFT, RIGHT } from "../maze.js";
import type { Course } from "./generate.js";
import { BUMP_MS, type LaneRun, type MoveRules, initialRun, patrolCatch, stepLane } from "./move.js";

/** Corridoio 6×1: ingresso 0, uscita 5, controlli a 0 e 3, chiave a 2. Si va solo a destra e a sinistra. */
const corridor = (over: Partial<Course> = {}): Course => ({
  w: 6,
  h: 1,
  cells: [RIGHT, RIGHT | LEFT, RIGHT | LEFT, RIGHT | LEFT, RIGHT | LEFT, LEFT],
  start: 0,
  exit: 5,
  checkpoints: [0, 3],
  mines: [],
  doors: [],
  keys: [2],
  patrols: [],
  route: [0, 1, 2, 3, 4, 5],
  ...over,
});
const rules: MoveRules = { stepMs: 350, penaltyMs: 3000, bumpMs: BUMP_MS };
const T0 = 10_000;

/** Fa una serie di passi a destra a tempi stabiliti. */
function walk(c: Course, times: number[], run: LaneRun = initialRun(c)) {
  let cur = run;
  const events: string[] = [];
  for (const at of times) {
    const out = stepLane(c, cur, "right", at, T0, rules);
    events.push(out.event);
    cur = out.run;
  }
  return { run: cur, events };
}

describe("passi del pilota", () => {
  it("un passo alla volta: i muri non contano, e prima di stepMs il passo è rifiutato (stesso oggetto)", () => {
    const c = corridor();
    const run = initialRun(c);
    expect(stepLane(c, run, "up", T0, T0, rules)).toEqual({ run, event: "wall" });
    expect(stepLane(c, run, "left", T0, T0, rules).run).toBe(run);
    const first = stepLane(c, run, "right", T0 + 100, T0, rules);
    expect(first.event).toBe("move");
    expect(first.run.pos).toBe(1);
    const early = stepLane(c, first.run, "right", T0 + 100 + 349, T0, rules);
    expect(early.event).toBe("rejected");
    expect(early.run).toBe(first.run);
    expect(stepLane(c, first.run, "right", T0 + 100 + 350, T0, rules).event).toBe("key"); // la casella 2 ha la chiave
  });

  it("la chiave si raccoglie una volta; il punto di controllo si aggiorna; l'uscita senza chiave non vale", () => {
    const c = corridor();
    const { run, events } = walk(c, [T0 + 400, T0 + 800, T0 + 1200]);
    expect(events).toEqual(["move", "key", "move"]);
    expect(run.keysTaken).toEqual([2]);
    expect(run.pos).toBe(3);
    expect(run.lastCheckpoint).toBe(3);
    // senza la chiave: all'uscita non si finisce
    const noKey = corridor({ keys: [2] });
    const start: LaneRun = { ...initialRun(noKey), pos: 4 };
    const out = stepLane(noKey, start, "right", T0 + 5000, T0, rules);
    expect(out.event).toBe("move");
    expect(out.run.pos).toBe(5);
    expect(out.run.finishedAt).toBeNull();
    // con la chiave sì, e il tempo dell'arrivo è quello equo del passo
    const withKey = stepLane(noKey, { ...start, keysTaken: [2] }, "right", T0 + 5000, T0, rules);
    expect(withKey.event).toBe("exit");
    expect(withKey.run.finishedAt).toBe(T0 + 5000);
    // arrivati, nessun altro passo
    const after = stepLane(noKey, withKey.run, "left", T0 + 9000, T0, rules);
    expect(after.event).toBe("rejected");
    expect(after.run).toBe(withKey.run);
  });

  it("senza chiavi nel livello l'uscita è sempre aperta", () => {
    const c = corridor({ keys: [] });
    const out = stepLane(c, { ...initialRun(c), pos: 4 }, "right", T0 + 5000, T0, rules);
    expect(out.event).toBe("exit");
  });

  it("una mina: si torna all'ultimo punto di controllo, fermi per penaltyMs, con un errore; la mina diventa nota e resta pericolosa", () => {
    const c = corridor({ mines: [4] });
    let run: LaneRun = { ...initialRun(c), pos: 3, lastCheckpoint: 3, lastStepAt: T0 };
    const hit = stepLane(c, run, "right", T0 + 500, T0, rules);
    expect(hit.event).toBe("mine");
    expect(hit.run).toMatchObject({ pos: 3, frozenUntil: T0 + 500 + 3000, strikes: 1, minesHit: [4] });
    // durante il blocco niente passi
    expect(stepLane(c, hit.run, "right", T0 + 3499, T0, rules).event).toBe("rejected");
    run = hit.run;
    // dopo il blocco, la stessa mina colpisce ancora, senza doppioni tra le note
    const again = stepLane(c, run, "right", T0 + 3500, T0, rules);
    expect(again.event).toBe("mine");
    expect(again.run.minesHit).toEqual([4]);
    expect(again.run.strikes).toBe(2);
    // il ritorno è all'ultimo controllo, non all'ingresso
    const early = corridor({ mines: [1], checkpoints: [0, 3] });
    expect(stepLane(early, initialRun(early), "right", T0 + 100, T0, rules).run.pos).toBe(0);
  });

  it("una porta chiusa è un urto (fermi per 1 s, senza spostarsi e senza errore); aperta si passa", () => {
    const door = { cell: 1, period: 1000, offset: 0 };
    const c = corridor({ doors: [door] });
    const closed = stepLane(c, initialRun(c), "right", T0 + 1200, T0, rules);
    expect(closed.event).toBe("bump");
    expect(closed.run).toMatchObject({ pos: 0, frozenUntil: T0 + 1200 + BUMP_MS, strikes: 0 });
    expect(stepLane(c, closed.run, "right", T0 + 2199, T0, rules).event).toBe("rejected");
    // alla fine dell'urto la porta (tra 2000 e 3000 è aperta) lascia passare
    const open = stepLane(c, closed.run, "right", T0 + 2200, T0, rules);
    expect(open.event).toBe("move");
    expect(open.run.pos).toBe(1);
  });

  it("le porte si giudicano all'ora equa: la stessa pressione dà lo stesso esito qualunque sia il ritardo di rete", () => {
    const door = { cell: 1, period: 1000, offset: 0 };
    const c = corridor({ doors: [door] });
    // premuto a T0+900 (porta aperta), il messaggio arriva fino a 600 ms dopo (porta chiusa): vale l'ora della pressione
    const pressedAt = T0 + 900;
    for (const delay of [10, 80, 200, 450, 600]) {
      const fair = fairTime({ claimed: pressedAt, receivedAt: pressedAt + delay, rtt: delay * 2, openedAt: T0 });
      expect(fair).toBe(pressedAt);
      expect(stepLane(c, initialRun(c), "right", fair, T0, rules).event, `ritardo ${delay} ms`).toBe("move");
    }
    // l'orologio sballato di un telefono non permette di passare: l'ora è riportata al limite plausibile
    const cheat = fairTime({ claimed: T0 + 900, receivedAt: T0 + 1500, rtt: 40, openedAt: T0 });
    expect(cheat).toBeGreaterThanOrEqual(T0 + 1500 - 90);
    expect(stepLane(c, initialRun(c), "right", cheat, T0, rules).event).toBe("bump");
  });

  it("una pattuglia sulla casella è come una mina (ma non diventa nota); la raggiunge anche chi sta fermo", () => {
    const patrol = { path: [1, 2, 3], stepMs: 1000, offset: 0 };
    const c = corridor({ patrols: [patrol], checkpoints: [0] });
    // a T0+1100 la pattuglia è in 2; il pilota in 1 che prova ad andare in 2
    const run: LaneRun = { ...initialRun(c), pos: 1, lastStepAt: T0 };
    const hit = stepLane(c, run, "right", T0 + 1100, T0, rules);
    expect(hit.event).toBe("patrol");
    expect(hit.run).toMatchObject({ pos: 0, strikes: 1, minesHit: [] });
    // a T0+100 la pattuglia è in 1: chi aspetta in 1 viene preso dal tick; chi è altrove no
    expect(patrolCatch(c, run, T0 + 100, T0, rules)).toMatchObject({ pos: 0, strikes: 1 });
    expect(patrolCatch(c, run, T0 + 1100, T0, rules)).toBe(run);
    expect(patrolCatch(c, initialRun(c), T0 + 100, T0, rules)).toEqual(initialRun(c));
    // fermo per il blocco: non si colpisce di nuovo
    const frozen: LaneRun = { ...run, frozenUntil: T0 + 5000 };
    expect(patrolCatch(c, frozen, T0 + 100, T0, rules)).toBe(frozen);
  });

  it("funzioni pure: non modificano l'input", () => {
    const c = corridor({ mines: [1], doors: [{ cell: 3, period: 500, offset: 0 }] });
    const run = initialRun(c);
    const before = JSON.stringify([c, run]);
    stepLane(c, run, "right", T0 + 100, T0, rules);
    patrolCatch(c, run, T0 + 100, T0, rules);
    expect(JSON.stringify([c, run])).toBe(before);
  });
});
