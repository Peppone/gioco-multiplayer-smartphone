import { describe, expect, it } from "vitest";
import { ClockSync, makeSample } from "./clock.js";

describe("makeSample", () => {
  it("calcola RTT e offset con percorso simmetrico", () => {
    // client in anticipo di 1000 ms sul server? no: server = client + 5000
    const s = makeSample(1000, 6050, 1100); // viaggio 100 ms, server risponde a metà
    expect(s.rtt).toBe(100);
    expect(s.offset).toBe(5000);
  });
});

describe("ClockSync", () => {
  it("usa il campione con RTT minimo", () => {
    const c = new ClockSync();
    c.add({ rtt: 300, offset: 4900 });
    c.add({ rtt: 60, offset: 5002 });
    c.add({ rtt: 150, offset: 5100 });
    expect(c.offset).toBe(5002);
    expect(c.rtt).toBe(60);
    expect(c.toServerTime(1000)).toBe(6002);
  });

  it("scarta RTT negativi e mantiene solo gli ultimi N campioni", () => {
    const c = new ClockSync(2);
    c.add({ rtt: -5, offset: 1 });
    expect(c.best).toBeNull();
    c.add({ rtt: 10, offset: 1 });
    c.add({ rtt: 50, offset: 2 });
    c.add({ rtt: 60, offset: 3 }); // il campione da 10 ms esce dalla finestra
    expect(c.rtt).toBe(50);
  });

  it("senza campioni l'offset è 0", () => {
    expect(new ClockSync().offset).toBe(0);
  });
});
