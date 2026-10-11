import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { COLLECT_WINDOW_MS, buzzer, type BuzzerState } from "./index.js";

const ids = ["a", "b", "c", "d"];
const ctx: MinigameContext = {
  players: ids.map((id) => ({ id, nickname: id.toUpperCase(), teamId: null })),
  teams: [],
  seed: 1,
};

const config = buzzer.configSchema.parse({
  questions: [
    { text: "Q1", answer: "SEGRETA1" },
    { text: "Q2", answer: "SEGRETA2", points: 200 },
  ],
  defaultPoints: 100,
  wrongPenalty: 50,
});

const cmd = (s: BuzzerState, type: "open" | "correct" | "wrong" | "skip" | "next", now = 0) =>
  buzzer.onHostCommand(s, { type }, now);

/** Pressione con orologio perfetto: `at` = istante vero, `latency` = ritardo di rete di andata. */
const press = (s: BuzzerState, id: string, at: number, latency: number) =>
  buzzer.onInput(s, id, { type: "buzz" }, { receivedAt: at + latency, claimedTime: at, rtt: latency * 2 });

function opened(now = 1_000): BuzzerState {
  return cmd(buzzer.init(config, ctx, now), "open", now);
}

/** Consegna le pressioni nell'ordine di arrivo al server, facendo girare il tick come farebbe il server. */
function simulate(s: BuzzerState, presses: { id: string; at: number; latency: number }[]): BuzzerState {
  const arrivals = [...presses].sort((p, q) => p.at + p.latency - (q.at + q.latency));
  for (const p of arrivals) {
    s = buzzer.onTick(s, p.at + p.latency);
    s = press(s, p.id, p.at, p.latency);
  }
  const last = Math.max(...arrivals.map((p) => p.at + p.latency));
  return buzzer.onTick(s, last + COLLECT_WINDOW_MS + 1);
}

describe("buzzer", () => {
  it("le pressioni sono ignorate finché il buzzer non è aperto", () => {
    const s = buzzer.init(config, ctx, 0);
    expect(press(s, "a", 100, 20)).toBe(s);
  });

  it("chi ha premuto davvero per primo vince, anche se il suo messaggio arriva dopo", () => {
    // A preme a t=0 con 200 ms di latenza (arriva a 200); B preme a t=60 con 30 ms (arriva a 90).
    const s = simulate(opened(0), [
      { id: "a", at: 0, latency: 200 },
      { id: "b", at: 60, latency: 30 },
    ]);
    expect(s.phase).toBe("answering");
    expect(s.queue.map((p) => p.playerId)).toEqual(["a", "b"]);
  });

  it("latenza simulata 50-250 ms: vince sempre il primo a premere (1000 prove)", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let trial = 0; trial < 1000; trial++) {
      const presses = ids.map((id) => ({
        id,
        at: Math.floor(rnd() * 100), // pressioni entro 100 ms l'una dall'altra
        latency: 50 + Math.floor(rnd() * 200),
      }));
      const s = simulate(opened(0), presses);
      const truth = [...presses].sort((p, q) => p.at - q.at || p.id.localeCompare(q.id))[0]!;
      const got = s.queue[0]!.playerId;
      const tied = presses.filter((p) => p.at === truth.at).map((p) => p.id);
      expect(tied).toContain(got);
    }
  });

  it("un client non può anticipare l'orario: il timestamp è limitato da RTT e arrivo", () => {
    const s0 = opened(0);
    // B preme davvero a 100 ms (latenza 10) ma A dichiara t=0 pur arrivando a 300 con RTT 40
    let s = press(s0, "b", 100, 10);
    s = buzzer.onInput(s, "a", { type: "buzz" }, { receivedAt: 300, claimedTime: 0, rtt: 40 });
    s = buzzer.onTick(s, 600);
    expect(s.queue[0]!.playerId).toBe("b");
  });

  it("risposta corretta: punti al giocatore; sbagliata: penalità e passa al successivo", () => {
    let s = simulate(opened(0), [
      { id: "a", at: 0, latency: 20 },
      { id: "b", at: 50, latency: 20 },
    ]);
    s = cmd(s, "wrong");
    expect(s.totals.a).toBe(-50);
    expect(s.phase).toBe("answering");
    expect(s.queue[s.current]!.playerId).toBe("b");
    s = cmd(s, "correct");
    expect(s.phase).toBe("resolved");
    expect(s.totals.b).toBe(100);
    expect(buzzer.scores(s).map((d) => [d.playerId, d.points])).toEqual([["a", -50], ["b", 100]]);
  });

  it("coda esaurita: il buzzer si riarma ma chi ha già tentato resta bloccato", () => {
    let s = simulate(opened(0), [{ id: "a", at: 0, latency: 20 }]);
    s = cmd(s, "wrong", 5_000);
    expect(s.phase).toBe("open");
    expect(press(s, "a", 5_100, 20)).toBe(s);
    s = press(s, "c", 5_100, 20);
    expect(s.phase).toBe("collecting");
  });

  it("chi arriva durante la risposta si accoda dopo chi sta rispondendo", () => {
    let s = simulate(opened(0), [{ id: "a", at: 0, latency: 20 }]);
    s = press(s, "c", 1_000, 20);
    s = press(s, "b", 900, 20);
    expect(s.queue.map((p) => p.playerId)).toEqual(["a", "b", "c"]);
    expect(s.queue[s.current]!.playerId).toBe("a");
  });

  it("percorre le domande, usa i punti specifici e termina", () => {
    let s = simulate(opened(0), [{ id: "a", at: 0, latency: 20 }]);
    s = cmd(s, "correct");
    s = cmd(s, "next", 9_000);
    expect(s.index).toBe(1);
    expect(s.phase).toBe("idle");
    s = cmd(s, "open", 9_100);
    s = simulate(s, [{ id: "b", at: 9_200, latency: 20 }]);
    s = cmd(s, "correct");
    expect(s.totals).toEqual({ a: 100, b: 200 });
    s = cmd(s, "next");
    expect(buzzer.isFinished(s)).toBe(true);
  });

  it("anti-leak: la risposta segreta compare solo nella vista della regia", () => {
    let s = simulate(opened(0), [{ id: "a", at: 0, latency: 20 }]);
    for (const view of [buzzer.screenView(s), buzzer.viewFor(s, "a", null), buzzer.viewFor(s, "b", null)]) {
      expect(JSON.stringify(view)).not.toContain("SEGRETA");
    }
    expect(JSON.stringify(buzzer.hostView(s).info)).toContain("SEGRETA1");
    s = cmd(s, "correct");
    expect(JSON.stringify(buzzer.screenView(s))).not.toContain("SEGRETA");
  });

  it("onTick non cambia lo stato (stesso oggetto) quando non c'è nulla da fare", () => {
    const s = opened(0);
    expect(buzzer.onTick(s, 99_999)).toBe(s);
  });
});
