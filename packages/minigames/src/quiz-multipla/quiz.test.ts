import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { quizMultipla as quiz, type QuizState } from "./index.js";

const ctx: MinigameContext = {
  players: [
    { id: "a", nickname: "Ada", teamId: "t1" },
    { id: "b", nickname: "Bob", teamId: "t2" },
    { id: "c", nickname: "Cleo", teamId: "t2" },
  ],
  teams: [],
  seed: 1,
};

const config = quiz.configSchema.parse({
  questions: [
    { text: "Q1", options: ["x", "y", "z"], correctIndex: 1 },
    { text: "Q2", options: ["x", "y"], correctIndex: 0, timeSec: 10 },
  ],
  defaultTimeSec: 20,
  maxPoints: 1000,
  minPoints: 200,
});

const answer = (s: QuizState, id: string, choice: number, at: number, rtt = 50) =>
  quiz.onInput(s, id, { type: "answer", choice }, { receivedAt: at, claimedTime: at - rtt / 2, rtt });

describe("quiz-multipla", () => {
  it("rifiuta una configurazione con correctIndex fuori dalle opzioni", () => {
    const bad = { questions: [{ text: "Q", options: ["a", "b"], correctIndex: 5 }] };
    expect(quiz.configSchema.safeParse(bad).success).toBe(false);
  });

  it("assegna più punti a chi risponde prima, nessuno a chi sbaglia", () => {
    let s = quiz.init(config, ctx, 1_000);
    s = answer(s, "a", 1, 2_000); // corretta, veloce
    s = answer(s, "b", 1, 11_000); // corretta, lenta
    s = answer(s, "c", 0, 1_500); // sbagliata
    s = quiz.onHostCommand(s, { type: "next" }, 12_000); // rivela
    expect(s.phase).toBe("reveal");
    expect(s.earned.a).toBeGreaterThan(s.earned.b!);
    expect(s.earned.c).toBeUndefined();
    expect(s.earned.a).toBeLessThanOrEqual(1000);
    expect(s.earned.b).toBeGreaterThanOrEqual(200);
  });

  it("la prima risposta è definitiva e fuori tempo non conta", () => {
    let s = quiz.init(config, ctx, 0);
    s = answer(s, "a", 0, 1_000);
    s = answer(s, "a", 1, 2_000);
    expect(s.answers.a?.choice).toBe(0);
    const late = answer(s, "b", 1, 20_000 + 600);
    expect(late.answers.b).toBeUndefined();
  });

  it("una risposta in tempo ma arrivata entro la tolleranza viene accettata", () => {
    let s = quiz.init(config, ctx, 0);
    // pressione a 19,9 s (in tempo), arrivata a 20,3 s per rete lenta
    s = quiz.onInput(s, "a", { type: "answer", choice: 1 }, { receivedAt: 20_300, claimedTime: 19_900, rtt: 500 });
    expect(s.answers.a).toBeDefined();
  });

  it("ignora chi non è in serata", () => {
    const s = answer(quiz.init(config, ctx, 0), "intruso", 1, 1_000);
    expect(s.answers).toEqual({});
  });

  it("rivela da solo quando tutti hanno risposto o scade il tempo", () => {
    let s = quiz.init(config, ctx, 0);
    expect(quiz.onTick(s, 5_000)).toBe(s); // nessun cambio: stesso oggetto
    for (const id of ["a", "b", "c"]) s = answer(s, id, 1, 3_000);
    expect(quiz.onTick(s, 3_001).phase).toBe("reveal");
    expect(quiz.onTick(quiz.init(config, ctx, 0), 20_501).phase).toBe("reveal");
  });

  it("percorre tutte le domande e finisce con punteggi e classifica", () => {
    let s = quiz.init(config, ctx, 0);
    s = answer(s, "a", 1, 1_000);
    s = quiz.onHostCommand(s, { type: "next" }, 2_000); // rivela Q1
    s = quiz.onHostCommand(s, { type: "next" }, 3_000); // Q2
    expect(s.index).toBe(1);
    expect(s.deadline).toBe(3_000 + 10_000);
    s = answer(s, "b", 0, 4_000);
    s = quiz.onHostCommand(s, { type: "next" }, 5_000);
    s = quiz.onHostCommand(s, { type: "next" }, 6_000);
    expect(quiz.isFinished(s)).toBe(true);
    expect(quiz.scores(s).map((d) => d.playerId).sort()).toEqual(["a", "b"]);
    expect(quiz.result(s).ranking.map((r) => r.rank)).toEqual([1, 2, 3]); // a e b hanno punti diversi (velocità), c è a zero
  });

  it("anti-leak: la risposta corretta non compare nelle viste prima della rivelazione", () => {
    let s = quiz.init(config, ctx, 0);
    s = answer(s, "a", 1, 1_000);
    const hidden = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/correct/i);
    hidden(quiz.screenView(s));
    hidden(quiz.viewFor(s, "a", "t1"));
    hidden(quiz.viewFor(s, "b", "t2"));
    // la regia invece la vede
    expect(JSON.stringify(quiz.hostView(s).info)).toContain("correct");
    // alla rivelazione diventa pubblica
    const revealed = quiz.onHostCommand(s, { type: "next" }, 2_000);
    expect(JSON.stringify(quiz.screenView(revealed))).toContain("correctIndex");
  });

  it("anti-leak: la vista di un giocatore non espone le risposte degli altri", () => {
    let s = quiz.init(config, ctx, 0);
    s = answer(s, "a", 2, 1_000);
    expect(quiz.viewFor(s, "b", "t2")).toMatchObject({ myChoice: null });
    expect(JSON.stringify(quiz.screenView(s))).not.toContain('"choice"');
  });
});
