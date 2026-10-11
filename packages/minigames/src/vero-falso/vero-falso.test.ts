import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type VeroFalsoState, veroFalso as vf } from "./index.js";

const ctx: MinigameContext = {
  players: [
    { id: "a", nickname: "Ada", teamId: null },
    { id: "b", nickname: "Bob", teamId: null },
  ],
  teams: [],
  seed: 1,
};

const config = vf.configSchema.parse({
  statements: [
    { text: "S1", answer: true },
    { text: "S2", answer: false },
    { text: "S3", answer: true },
  ],
  timeSec: 10,
  maxPoints: 100,
  minPoints: 40,
  wrongPenalty: 10,
  streakBonus: 20,
  revealSec: 2,
});

const answer = (s: VeroFalsoState, id: string, value: boolean, at: number) =>
  vf.onInput(s, id, { type: "answer", value }, { receivedAt: at, claimedTime: at - 10, rtt: 20 });

describe("vero-falso", () => {
  it("la configurazione ha valori predefiniti e rifiuta punti incoerenti", () => {
    const c = vf.configSchema.parse({ statements: [{ text: "x", answer: true }] });
    expect(c).toMatchObject({ timeSec: 8, maxPoints: 100, revealSec: 2 });
    expect(vf.configSchema.safeParse({ statements: [{ text: "x", answer: true }], minPoints: 500, maxPoints: 100 }).success).toBe(false);
    expect(vf.configSchema.safeParse({ statements: [] }).success).toBe(false);
  });

  it("più veloce = più punti; sbagliata = penalità; non risponde = niente", () => {
    let s = vf.init(config, { ...ctx, players: [...ctx.players, { id: "c", nickname: "Cleo", teamId: null }] }, 0);
    s = answer(s, "a", true, 1_000); // giusta e veloce
    s = answer(s, "b", false, 9_000); // sbagliata
    s = vf.onHostCommand(s, { type: "next" }, 10_000); // rivela (c non ha risposto)
    expect(s.earned.a).toBeGreaterThan(80);
    expect(s.earned.b).toBe(-10);
    expect(s.earned.c).toBeUndefined();
    expect(s.totals).toMatchObject({ a: s.earned.a, b: -10 });
  });

  it("la serie di risposte giuste dà un bonus crescente e si interrompe con un errore", () => {
    let s = vf.init(config, ctx, 0);
    const earnedAt: number[] = [];
    // S1 (vera): giusta, S2 (falsa): giusta, S3 (vera): sbagliata
    for (const [value] of [[true], [false], [false]] as const) {
      s = answer(s, "a", value, s.openedAt + 1_000);
      s = vf.onHostCommand(s, { type: "next" }, s.openedAt + 2_000);
      earnedAt.push(s.earned.a ?? 0);
      s = vf.onHostCommand(s, { type: "next" }, s.openedAt + 3_000);
    }
    expect(earnedAt[1]! - earnedAt[0]!).toBeGreaterThanOrEqual(15); // bonus serie (+20, meno la lieve differenza di tempo)
    expect(earnedAt[2]).toBe(-10);
    expect(vf.isFinished(s)).toBe(true);
  });

  it("dopo la rivelazione passa da sola alla successiva; alla fine termina", () => {
    let s = vf.init(config, ctx, 0);
    for (const id of ["a", "b"]) s = answer(s, id, true, 1_000);
    s = vf.onTick(s, 1_100); // tutti hanno risposto: rivela
    expect(s.phase).toBe("reveal");
    expect(vf.onTick(s, 2_000)).toBe(s); // pausa ancora in corso: nessun cambio
    s = vf.onTick(s, 3_200); // pausa finita (revealSec = 2)
    expect(s).toMatchObject({ phase: "statement", index: 1, openedAt: 3_200 });
    s = vf.onTick(s, 3_200 + 10_600); // nessuno risponde: scade e rivela
    s = vf.onTick(s, 3_200 + 10_600 + 2_100);
    s = vf.onTick(s, 3_200 + 10_600 + 2_100 + 10_600);
    s = vf.onTick(s, 3_200 + 10_600 + 2_100 + 10_600 + 2_100);
    expect(vf.isFinished(s)).toBe(true);
  });

  it("la prima risposta è definitiva; fuori tempo o fuori serata non conta", () => {
    let s = vf.init(config, ctx, 0);
    s = answer(s, "a", true, 1_000);
    s = answer(s, "a", false, 2_000);
    expect(s.answers.a?.value).toBe(true);
    expect(answer(s, "b", true, 10_700).answers.b).toBeUndefined(); // oltre la tolleranza
    expect(answer(s, "intruso", true, 1_000).answers.intruso).toBeUndefined();
  });

  it("anti-leak: la risposta giusta compare solo dalla rivelazione (e nella vista della regia)", () => {
    let s = vf.init(config, ctx, 0);
    s = answer(s, "a", true, 1_000);
    const noAnswer = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/"answer"|"correct"/);
    noAnswer(vf.screenView(s));
    noAnswer(vf.viewFor(s, "a", null));
    noAnswer(vf.viewFor(s, "b", null));
    expect(JSON.stringify(vf.hostView(s).info)).toContain("VERO");
    const r = vf.onHostCommand(s, { type: "next" }, 2_000);
    expect(vf.screenView(r)).toMatchObject({ reveal: { answer: true, counts: { true: 1, false: 0 } } });
    expect(vf.viewFor(r, "a", null)).toMatchObject({ reveal: { correct: true } });
    expect(vf.viewFor(r, "b", null)).toMatchObject({ reveal: { correct: null } });
  });
});
