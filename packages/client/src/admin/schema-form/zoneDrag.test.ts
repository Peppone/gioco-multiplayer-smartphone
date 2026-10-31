import { describe, expect, it } from "vitest";
import { defaultZone, dragZone, nextFreeZone, secondsAtX, waveformPeaks } from "./zoneDrag";

describe("ampiezze della forma d'onda", () => {
  it("dà un valore per tratto, normalizzato sul picco più alto", () => {
    const a = Float32Array.from({ length: 1000 }, (_, i) => (i < 500 ? 0.1 : 0.4) * Math.sin(i));
    const peaks = waveformPeaks([a], 10);
    expect(peaks.length).toBe(10);
    expect(Math.max(...peaks)).toBeCloseTo(1, 6);
    expect(peaks[0]!).toBeLessThan(0.4);
    expect(peaks[9]!).toBeGreaterThan(0.9);
  });

  it("guarda tutti i canali e un suono muto o vuoto resta a zero", () => {
    const quiet = new Float32Array(100);
    const loud = Float32Array.from({ length: 100 }, (_, i) => (i > 90 ? 0.5 : 0));
    expect(waveformPeaks([quiet, loud], 4)[3]).toBe(1);
    expect(Array.from(waveformPeaks([quiet], 4))).toEqual([0, 0, 0, 0]);
    expect(waveformPeaks([], 4).length).toBe(4);
    expect(waveformPeaks([quiet], 0).length).toBe(0);
  });
});

describe("trascinamento di una zona", () => {
  const zone = { from: 10, to: 14 };

  it("il bordo sinistro si sposta senza scavalcare la fine né uscire dal brano", () => {
    expect(dragZone("start", zone, 1.234, 60)).toEqual({ from: 11.2, to: 14 });
    expect(dragZone("start", zone, 50, 60)).toEqual({ from: 13.9, to: 14 });
    expect(dragZone("start", zone, -50, 60)).toEqual({ from: 0, to: 14 });
  });

  it("il bordo destro si sposta senza scavalcare l'inizio né uscire dal brano", () => {
    expect(dragZone("end", zone, -1, 60)).toEqual({ from: 10, to: 13 });
    expect(dragZone("end", zone, -50, 60)).toEqual({ from: 10, to: 10.1 });
    expect(dragZone("end", zone, 100, 60)).toEqual({ from: 10, to: 60 });
  });

  it("spostare tutta la zona ne conserva la lunghezza e la tiene dentro il brano", () => {
    expect(dragZone("move", zone, 2.04, 60)).toEqual({ from: 12, to: 16 });
    expect(dragZone("move", zone, 100, 60)).toEqual({ from: 56, to: 60 });
    expect(dragZone("move", zone, -100, 60)).toEqual({ from: 0, to: 4 });
  });

  it("gli estremi sono multipli del passo, senza errori di arrotondamento", () => {
    for (let d = -3; d <= 3; d += 0.37) {
      const z = dragZone("move", { from: 1.1, to: 2.3 }, d, 60);
      expect(z.from).toBe(Number(z.from.toFixed(1)));
      expect(z.to).toBe(Number(z.to.toFixed(1)));
      expect(z.to - z.from).toBeCloseTo(1.2, 6);
    }
  });

  it("converte una posizione in secondi", () => {
    expect(secondsAtX(50, 200, 60)).toBe(15);
    expect(secondsAtX(-5, 200, 60)).toBe(0);
    expect(secondsAtX(999, 200, 60)).toBe(60);
    expect(secondsAtX(10, 0, 60)).toBe(0);
  });
});

describe("zona proposta", () => {
  it("sta al centro del brano, lunga un quinto tra 1 e 5 secondi, e non esce mai dal brano", () => {
    expect(defaultZone(20)).toEqual({ from: 8, to: 12 });
    expect(defaultZone(100)).toEqual({ from: 47.5, to: 52.5 });
    expect(defaultZone(3)).toEqual({ from: 1, to: 2 });
    const tiny = defaultZone(0.5);
    expect(tiny.from).toBeGreaterThanOrEqual(0);
    expect(tiny.to).toBeLessThanOrEqual(0.5);
    expect(tiny.to).toBeGreaterThan(tiny.from);
  });
});

describe("altra zona libera", () => {
  it("propone il centro se è libero, altrimenti il primo posto libero della stessa lunghezza", () => {
    expect(nextFreeZone(20, [])).toEqual({ from: 8, to: 12 });
    expect(nextFreeZone(20, [{ from: 8, to: 12 }])).toEqual({ from: 0, to: 4 });
    expect(nextFreeZone(20, [{ from: 0, to: 4 }, { from: 8, to: 12 }])).toEqual({ from: 4, to: 8 });
    expect(nextFreeZone(20, [{ from: 0, to: 9 }, { from: 9, to: 20 }])).toBeNull();
  });

  it("le zone che si toccano soltanto non si sovrappongono", () => {
    const z = nextFreeZone(20, [{ from: 6, to: 8 }])!;
    expect(z.to <= 6 || z.from >= 8).toBe(true);
  });
});
