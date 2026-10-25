import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BlurStagesPlan, type RatePlan, songMsAt } from "@gioco/shared";
import type { MusicBackend } from "./backends";
import { BLUR_CUTOFF_HZ, CLEAR_CUTOFF_HZ, cutoffForStage, makeupForCutoff } from "./effects";
import { CURVE_STEP_MS, RATE_STEP_MS, type ListeningRun, holdListening, startListening, stagesCurve } from "./listening";

type Call = { at: number; name: string; args: unknown[] };

/**
 * Un lettore finto che ricorda ogni comando con l'ora (finta) e che sa dove si trova il brano: avanza di `rate` secondi
 * di musica per ogni secondo che passa, come un vero elemento audio. Serve a confrontare ciò che si sente con la teoria.
 */
function fakeBackend(options: { ready?: boolean } = {}) {
  const calls: Call[] = [];
  let ready = options.ready ?? true;
  const waiting: (() => void)[] = [];
  let position = 0;
  let rate = 1;
  let playing = false;
  let last = Date.now();
  const sync = () => {
    const t = Date.now();
    if (playing) position += ((t - last) / 1000) * rate;
    last = t;
  };
  const log = (name: string, ...args: unknown[]) => calls.push({ at: Date.now(), name, args });
  const backend: MusicBackend = {
    whenReady(cb) {
      if (ready) {
        cb();
        return () => undefined;
      }
      waiting.push(cb);
      return () => void waiting.splice(waiting.indexOf(cb), 1);
    },
    playAt(seconds, maxMs) {
      sync();
      log("playAt", ...(maxMs === undefined ? [seconds] : [seconds, maxMs]));
      position = seconds;
      playing = true;
    },
    pause() {
      sync();
      log("pause");
      playing = false;
    },
    cue(seconds) {
      sync();
      log("cue", seconds);
      position = seconds;
    },
    setClarity: (...args) => void log("setClarity", ...args),
    setCutoffCurve: (...args) => void log("setCutoffCurve", ...args),
    setRate(r) {
      sync();
      log("setRate", r);
      rate = r;
    },
    dispose: () => void log("dispose"),
  };
  return {
    backend,
    calls,
    named: (name: string) => calls.filter((c) => c.name === name),
    /** Dove si trova il brano adesso (secondi). */
    position: () => {
      sync();
      return position;
    },
    becomeReady() {
      ready = true;
      waiting.splice(0).forEach((cb) => cb());
    },
  };
}

const START = 1_000;
/** Un ascolto che comincia adesso (ora finta = 0) da `offsetMs` di tempo ascoltato. */
const run = (overrides: Partial<ListeningRun> = {}): ListeningRun => ({
  listening: { loop: null, rate: null, stages: null },
  startSeconds: 0,
  offsetMs: 0,
  segmentStart: Date.now(),
  stopAt: null,
  clipMs: 30_000,
  clearAtPercent: null,
  now: () => Date.now(),
  ...overrides,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

describe("filtro dell'ovattato a fasi", () => {
  it("partenza e arrivo: molto sfocato, sfocato, nessun filtro", () => {
    expect(cutoffForStage(0)).toBe(BLUR_CUTOFF_HZ.heavy_blur);
    expect(cutoffForStage(1)).toBeCloseTo(BLUR_CUTOFF_HZ.blur);
    expect(cutoffForStage(2)).toBeCloseTo(CLEAR_CUTOFF_HZ);
    expect(cutoffForStage(-5)).toBe(cutoffForStage(0));
    expect(cutoffForStage(9)).toBeCloseTo(CLEAR_CUTOFF_HZ);
  });

  it("tra un livello e l'altro la frequenza cresce sempre, in scala esponenziale", () => {
    let prev = cutoffForStage(0);
    for (let l = 0.01; l <= 2; l += 0.01) {
      const hz = cutoffForStage(l);
      expect(hz).toBeGreaterThan(prev);
      prev = hz;
    }
    expect(cutoffForStage(0.5)).toBeCloseTo(Math.sqrt(BLUR_CUTOFF_HZ.heavy_blur * BLUR_CUTOFF_HZ.blur));
  });

  it("il volume compensato scende da quello del filtro forte a nessuna compensazione, senza salti", () => {
    expect(makeupForCutoff(BLUR_CUTOFF_HZ.heavy_blur)).toBeCloseTo(2.2);
    expect(makeupForCutoff(BLUR_CUTOFF_HZ.blur)).toBeCloseTo(1.4);
    expect(makeupForCutoff(CLEAR_CUTOFF_HZ)).toBeCloseTo(1);
    expect(makeupForCutoff(100)).toBeCloseTo(2.2);
    let prev = makeupForCutoff(BLUR_CUTOFF_HZ.heavy_blur);
    for (let l = 0; l <= 2; l += 0.01) {
      const g = makeupForCutoff(cutoffForStage(l));
      expect(g).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - g).toBeLessThan(0.05);
      prev = g;
    }
  });
});

describe("curva del filtro", () => {
  const plan: BlurStagesPlan = { firstMs: 2_000, secondMs: 1_000, transitionMs: 500 };
  const end = 2_000 + 1_000 + 2 * 500;

  it("dall'inizio: parte dal filtro forte, arriva al suono libero e non scende mai", () => {
    const hz = stagesCurve(plan, 0);
    expect(hz).toHaveLength(Math.ceil(end / CURVE_STEP_MS) + 1);
    expect(hz[0]).toBe(BLUR_CUTOFF_HZ.heavy_blur);
    expect(hz.at(-1)).toBeCloseTo(CLEAR_CUTOFF_HZ);
    for (let i = 1; i < hz.length; i++) expect(hz[i]!).toBeGreaterThanOrEqual(hz[i - 1]!);
  });

  it("ha un tratto fermo su ciascuna fase: filtro forte, poi filtro leggero", () => {
    const hz = stagesCurve(plan, 0);
    const at = (ms: number) => hz[Math.round(ms / CURVE_STEP_MS)]!;
    expect(at(0)).toBeCloseTo(at(1_900));
    expect(at(2_500)).toBeCloseTo(BLUR_CUTOFF_HZ.blur);
    expect(at(3_400)).toBeCloseTo(BLUR_CUTOFF_HZ.blur);
    expect(at(3_900)).toBeGreaterThan(BLUR_CUTOFF_HZ.blur * 1.5);
  });

  it("ripartendo a metà di una fase la curva comincia dal punto giusto", () => {
    expect(stagesCurve(plan, 2_250)[0]).toBeCloseTo(cutoffForStage(0.5), 0); // a metà del primo passaggio
    expect(stagesCurve(plan, 3_000)[0]).toBeCloseTo(BLUR_CUTOFF_HZ.blur); // nella seconda fase
  });

  it("a suono già normale resta un solo valore: il filtro rimane aperto", () => {
    expect(stagesCurve(plan, end)).toEqual([cutoffForStage(2)]);
    expect(stagesCurve(plan, end + 10_000)).toEqual([cutoffForStage(2)]);
  });
});

describe("ascolto continuo", () => {
  it("fa partire il brano dal punto scelto, senza toccare la velocità", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ startSeconds: 5 }));
    expect(f.calls.map((c) => c.name)).toEqual(["playAt"]);
    expect(f.calls[0]!.args).toEqual([5]);
    expect(f.named("setRate")).toHaveLength(0);
    expect(f.named("setCutoffCurve")).toHaveLength(0);
  });

  it("ripartendo dopo una pausa riprende dal tempo ascoltato", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ startSeconds: 5, offsetMs: 3_500 }));
    expect(f.calls[0]!.args).toEqual([8.5]);
  });

  it("aspetta che il brano sia pronto, e parte da dove sarebbe arrivato nel frattempo", () => {
    const f = fakeBackend({ ready: false });
    startListening(f.backend, run());
    expect(f.calls).toHaveLength(0);
    vi.advanceTimersByTime(2_000);
    f.becomeReady();
    expect(f.calls[0]!.args).toEqual([2]);
  });

  it("si ferma all'ora stabilita e non fa più nulla dopo l'annullamento", () => {
    const f = fakeBackend();
    const cancel = startListening(f.backend, run({ stopAt: START + 5_000 }));
    vi.advanceTimersByTime(4_999);
    expect(f.named("pause")).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(f.named("pause")).toHaveLength(1);
    cancel();
    const n = f.calls.length;
    vi.advanceTimersByTime(60_000);
    expect(f.calls).toHaveLength(n);
  });

  it("annullando prima della fine non si ferma più e non fa suonare nulla", () => {
    const f = fakeBackend({ ready: false });
    const cancel = startListening(f.backend, run({ stopAt: START + 5_000 }));
    cancel();
    f.becomeReady();
    vi.advanceTimersByTime(10_000);
    expect(f.calls).toHaveLength(0);
  });
});

describe("velocità del brano", () => {
  it("più lento: imposta la velocità prima di partire e non la cambia più", () => {
    const f = fakeBackend();
    const rate: RatePlan = { rate: 0.5, untilMs: null, transitionMs: 0 };
    startListening(f.backend, run({ listening: { loop: null, rate, stages: null }, startSeconds: 2 }));
    expect(f.calls.map((c) => c.name)).toEqual(["setRate", "playAt"]);
    expect(f.calls[0]!.args).toEqual([0.5]);
    vi.advanceTimersByTime(60_000);
    expect(f.named("setRate")).toHaveLength(1); // niente timer per aggiornare una velocità che non cambia
  });

  it("più lento: il brano avanza di mezzo secondo per ogni secondo ascoltato", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ listening: { loop: null, rate: { rate: 0.5, untilMs: null, transitionMs: 0 }, stages: null }, startSeconds: 1 }));
    vi.advanceTimersByTime(10_000);
    expect(f.position()).toBeCloseTo(1 + 5, 5);
  });

  it("più veloce: il brano avanza il doppio", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ listening: { loop: null, rate: { rate: 2, untilMs: null, transitionMs: 0 }, stages: null } }));
    vi.advanceTimersByTime(10_000);
    expect(f.position()).toBeCloseTo(20, 5);
  });

  it("ripartendo a metà il brano riprende dal punto che aveva raggiunto, non dal tempo ascoltato", () => {
    const f = fakeBackend();
    // 6 s ascoltati a metà velocità = 3 s di brano
    startListening(f.backend, run({ listening: { loop: null, rate: { rate: 0.5, untilMs: null, transitionMs: 0 }, stages: null }, startSeconds: 10, offsetMs: 6_000 }));
    expect(f.named("playAt")[0]!.args).toEqual([13]);
  });

  describe("prima lento, poi normale", () => {
    const rate: RatePlan = { rate: 0.5, untilMs: 2_000, transitionMs: 1_000 };
    const listening = { loop: null, rate, stages: null };

    it("la velocità sale in modo morbido da 0,5 a 1, senza mai scendere, e poi si ferma", () => {
      const f = fakeBackend();
      startListening(f.backend, run({ listening }));
      vi.advanceTimersByTime(10_000);
      const rates = f.named("setRate").map((c) => c.args[0] as number);
      expect(rates[0]).toBe(0.5);
      expect(rates.at(-1)).toBe(1);
      for (let i = 1; i < rates.length; i++) {
        expect(rates[i]!).toBeGreaterThanOrEqual(rates[i - 1]!);
        expect(rates[i]! - rates[i - 1]!).toBeLessThan(0.05); // nessun salto
      }
      // a metà del passaggio la velocità è circa a metà strada
      const mid = f.named("setRate").find((c) => c.at - START >= 2_500)!;
      expect(mid.args[0] as number).toBeCloseTo(0.75, 1);
      // aggiornamenti solo durante il passaggio (e uno all'inizio), poi più nulla
      const afterSettled = f.named("setRate").filter((c) => c.at - START > 3_000 + RATE_STEP_MS);
      expect(afterSettled).toHaveLength(0);
    });

    it("la posizione nel brano segue la teoria: l'errore dei passi di aggiornamento è trascurabile", () => {
      for (const heard of [1_500, 2_000, 2_500, 3_000, 3_700, 8_000]) {
        const f = fakeBackend();
        vi.setSystemTime(START);
        startListening(f.backend, run({ listening, startSeconds: 4 }));
        vi.advanceTimersByTime(heard);
        const expected = 4 + songMsAt(rate, heard) / 1000;
        expect(Math.abs(f.position() - expected), `dopo ${heard} ms`).toBeLessThan(0.03);
      }
    });

    it("dopo il passaggio il brano torna a un secondo per secondo", () => {
      const f = fakeBackend();
      startListening(f.backend, run({ listening }));
      vi.advanceTimersByTime(5_000);
      const a = f.position();
      vi.advanceTimersByTime(4_000);
      expect(f.position() - a).toBeCloseTo(4, 1);
    });

    it("ripartendo a metà del passaggio riprende dalla posizione e dalla velocità giuste, e finisce di accelerare", () => {
      const f = fakeBackend();
      startListening(f.backend, run({ listening, startSeconds: 0, offsetMs: 2_500 }));
      expect(f.calls[0]!.name).toBe("setRate");
      expect(f.calls[0]!.args[0] as number).toBeCloseTo(0.75, 5);
      expect(f.named("playAt")[0]!.args[0] as number).toBeCloseTo(songMsAt(rate, 2_500) / 1000, 5);
      vi.advanceTimersByTime(2_000);
      expect(f.named("setRate").at(-1)!.args).toEqual([1]);
    });

    it("ripartendo a velocità già normale non resta nessun timer di aggiornamento", () => {
      const f = fakeBackend();
      startListening(f.backend, run({ listening, offsetMs: 9_000 }));
      expect(f.calls.map((c) => c.name)).toEqual(["setRate", "playAt"]);
      expect(f.calls[0]!.args).toEqual([1]);
      vi.advanceTimersByTime(30_000);
      expect(f.calls).toHaveLength(2);
    });

    it("annullando durante il passaggio la velocità smette di cambiare", () => {
      const f = fakeBackend();
      const cancel = startListening(f.backend, run({ listening }));
      vi.advanceTimersByTime(2_500);
      cancel();
      const n = f.calls.length;
      vi.advanceTimersByTime(5_000);
      expect(f.calls).toHaveLength(n);
    });

    it("con il passaggio di colpo la velocità cambia una volta sola, all'istante scelto", () => {
      const f = fakeBackend();
      const abrupt: RatePlan = { rate: 2, untilMs: 1_000, transitionMs: 0 };
      startListening(f.backend, run({ listening: { loop: null, rate: abrupt, stages: null } }));
      vi.advanceTimersByTime(3_000);
      const rates = f.named("setRate").map((c) => c.args[0]);
      expect(rates[0]).toBe(2);
      expect(rates.at(-1)).toBe(1);
      expect(new Set(rates)).toEqual(new Set([2, 1]));
      expect(f.named("setRate").find((c) => c.args[0] === 1)!.at - START).toBeLessThanOrEqual(1_000 + RATE_STEP_MS);
    });
  });
});

describe("ovattato a fasi", () => {
  const stages: BlurStagesPlan = { firstMs: 2_000, secondMs: 1_000, transitionMs: 500 };
  const listening = { loop: null, rate: null, stages };

  it("programma la curva del filtro una sola volta, dall'inizio fino al suono libero", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ listening }));
    const curves = f.named("setCutoffCurve");
    expect(curves).toHaveLength(1);
    const [hz, step] = curves[0]!.args as [number[], number];
    expect(step).toBe(CURVE_STEP_MS);
    expect(hz[0]).toBe(BLUR_CUTOFF_HZ.heavy_blur);
    expect(hz.at(-1)).toBeCloseTo(CLEAR_CUTOFF_HZ);
    // il brano suona normalmente: nessun cambio di velocità
    expect(f.named("setRate")).toHaveLength(0);
    expect(f.named("playAt")[0]!.args).toEqual([0]);
  });

  it("ripartendo a metà la curva comincia dal livello raggiunto", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ listening, offsetMs: 3_000 }));
    const [hz] = f.named("setCutoffCurve")[0]!.args as [number[]];
    expect(hz[0]).toBeCloseTo(BLUR_CUTOFF_HZ.blur);
    expect(hz.length).toBeLessThan(stagesCurve(stages, 0).length);
  });

  it("da fermo il filtro resta com'era al momento dello stop", () => {
    const f = fakeBackend();
    holdListening(f.backend, { listening, offsetMs: 750, clipMs: 30_000, clearAtPercent: null });
    expect(f.calls.map((c) => c.name)).toEqual(["pause", "setClarity", "setCutoffCurve"]);
    const [hz] = f.named("setCutoffCurve")[0]!.args as [number[]];
    expect(hz).toHaveLength(1);
    expect(hz[0]).toBeCloseTo(stagesCurve(stages, 750)[0]!);
  });
});

describe("ascolto a spezzoni", () => {
  const loop = { snippetsMs: [500, 1_000], pauseMs: 600 };
  const listening = { loop, rate: null, stages: null };

  it("suona e tace agli istanti del piano, ripartendo sempre dallo stesso punto", () => {
    const f = fakeBackend();
    const positions: unknown[] = [];
    startListening(f.backend, run({ listening, startSeconds: 3, clipMs: 2_700, onLoop: (p) => positions.push(p) }));
    vi.advanceTimersByTime(3_000);
    const seq = f.calls.map((c) => [c.at - START, c.name, ...c.args]);
    expect(seq).toEqual([
      [0, "playAt", 3, 500], // primo spezzone, 0,5 s
      [500, "pause"],
      [500, "cue", 3], // pronto a ripartire dall'inizio
      [1_100, "playAt", 3, 1_000], // secondo spezzone, 1 s, dopo la pausa
      [2_100, "pause"],
      [2_100, "cue", 3],
      [2_700, "pause"], // fine dell'ultima pausa: l'ascolto è finito
      [2_700, "cue", 3],
    ]);
    expect(positions.length).toBeGreaterThan(0);
  });

  it("aspetta l'inizio fissato dal server un po' nel futuro, così il primo spezzone è intero", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ listening, segmentStart: START + 400 }));
    vi.advanceTimersByTime(399);
    expect(f.calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(f.calls[0]).toMatchObject({ name: "playAt", args: [0, 500] });
  });

  it("ripartendo a metà di uno spezzone suona solo quello che ne resta", () => {
    const f = fakeBackend();
    // 1,5 s di ascolto: 0,5 spezzone + 0,6 pausa + 0,4 s del secondo spezzone
    startListening(f.backend, run({ listening, offsetMs: 1_500 }));
    expect(f.calls[0]).toMatchObject({ name: "playAt", args: [0.4, 600] });
  });

  it("se il timer scatta qualche millisecondo in anticipo il cambio avviene lo stesso, senza spezzoni di un millisecondo", () => {
    const f = fakeBackend();
    let skew = 0; // l'orologio che il motore legge scatta dopo il timer: simula un timer in anticipo
    startListening(f.backend, run({ listening, startSeconds: 3, now: () => Date.now() + skew }));
    vi.advanceTimersByTime(499);
    skew = -1;
    vi.advanceTimersByTime(1);
    // al confine a 500 ms l'orologio dice 499 ms: si tace comunque, e non parte nessuno spezzone di 1 ms
    expect(f.calls.slice(1).map((c) => c.name)).toEqual(["pause", "cue"]);
    expect(f.named("playAt")).toHaveLength(1);
    // il secondo spezzone parte alla fine della pausa, per tutta la sua durata
    vi.advanceTimersByTime(700);
    const second = f.named("playAt")[1]!;
    expect(second.args[0]).toBe(3);
    expect(second.args[1] as number).toBeGreaterThanOrEqual(1_000);
    expect(second.args[1] as number).toBeLessThanOrEqual(1_001);
    expect(f.named("playAt")).toHaveLength(2);
  });

  it("negli spezzoni la velocità non c'entra: nessuna chiamata a setRate", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ listening }));
    vi.advanceTimersByTime(5_000);
    expect(f.named("setRate")).toHaveLength(0);
  });

  it("da fermo non c'è nessuno spezzone in corso", () => {
    const f = fakeBackend();
    const onLoop = vi.fn();
    holdListening(f.backend, { listening, offsetMs: 100, clipMs: 2_700, clearAtPercent: null, onLoop });
    expect(onLoop).toHaveBeenCalledWith(null);
  });
});

describe("svela gradualmente", () => {
  it("la nitidezza sale da dove si è arrivati fino al suono originale alla percentuale scelta", () => {
    const f = fakeBackend();
    startListening(f.backend, run({ clipMs: 10_000, clearAtPercent: 80, offsetMs: 4_000 }));
    const [from, to, ms] = f.named("setClarity")[0]!.args as number[];
    expect(from).toBeCloseTo(0.5);
    expect(to).toBe(1);
    expect(ms).toBe(4_000); // fino a 8 s di ascolto, ne restano 4
  });

  it("senza «Svela gradualmente» la nitidezza non si tocca; da fermo resta com'era", () => {
    const f = fakeBackend();
    startListening(f.backend, run());
    expect(f.named("setClarity")).toHaveLength(0);
    holdListening(f.backend, { listening: { loop: null, rate: null, stages: null }, offsetMs: 5_000, clipMs: 10_000, clearAtPercent: 100 });
    expect(f.named("setClarity").at(-1)!.args).toEqual([0.5, 0.5, 0]);
  });
});
