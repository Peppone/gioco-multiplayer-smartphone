import { describe, expect, it } from "vitest";
import type { AnyMinigame, MinigameContext } from "@gioco/shared";
import { roundMinigames } from "../../../packages/minigames/src/index.js";
import { createKnightDuel, duelModeSchema, DEFAULT_DECK } from "../../../packages/minigames/src/knight-duel/index.js";
import { decide, makeRnd } from "./strategy.js";

const ctx: MinigameContext = {
  players: [
    { id: "r1", nickname: "Rosa", teamId: "t1" },
    { id: "r2", nickname: "Rino", teamId: "t1" },
    { id: "b1", nickname: "Bea", teamId: "t2" },
    { id: "b2", nickname: "Beppe", teamId: "t2" },
  ],
  teams: [{ id: "t1", name: "Rossi" }, { id: "t2", name: "Blu" }],
  seed: 5,
};
const meta = { receivedAt: 100, claimedTime: 90, rtt: 20 };

/** Il bot deve produrre input che il plugin accetta davvero e che cambiano lo stato: altrimenti nello stress test non farebbe nulla. */
describe("strategia dei bot", () => {
  for (const plugin of Object.values(roundMinigames) as AnyMinigame[]) {
    it(`${plugin.id}: gli input dei bot sono validi e vengono registrati`, () => {
      const state = plugin.init(plugin.configSchema.parse(plugin.sampleConfig), ctx, 0);
      // Per il buzzer serve prima che la regia apra le prenotazioni.
      const ready = plugin.id === "buzzer" ? plugin.onHostCommand(state, { type: "open" }, 10) : state;
      const rnd = makeRnd(1);
      let touched = 0;
      for (const p of ctx.players) {
        // il buzzer è a caso: si prova finché un bot decide di prenotarsi
        for (let attempt = 0; attempt < 20; attempt++) {
          const d = decide(plugin.id, plugin.viewFor(ready, p.id, p.teamId), rnd);
          if (!d) continue;
          for (const input of d.inputs) {
            const parsed = plugin.inputSchema.safeParse(input);
            expect(parsed.success, `input rifiutato dallo schema: ${JSON.stringify(input)}`).toBe(true);
            if (parsed.success && JSON.stringify(plugin.onInput(ready, p.id, parsed.data, meta)) !== JSON.stringify(ready)) touched++;
          }
          break;
        }
      }
      expect(touched, "almeno un bot deve riuscire a influenzare il minigioco").toBeGreaterThan(0);
    });
  }

  it("non agisce due volte nella stessa situazione né quando ha già risposto", () => {
    const quiz = roundMinigames["quiz-multipla"]!;
    const s0 = quiz.init(quiz.configSchema.parse(quiz.sampleConfig), ctx, 0);
    const d = decide("quiz-multipla", quiz.viewFor(s0, "r1", "t1"), makeRnd(1))!;
    const s1 = quiz.onInput(s0, "r1", d.inputs[0], meta);
    expect(decide("quiz-multipla", quiz.viewFor(s1, "r1", "t1"), makeRnd(1))).toBeNull(); // già risposto
    expect(decide("quiz-multipla", { phase: "reveal" }, makeRnd(1))).toBeNull();
    expect(decide("minigioco-sconosciuto", {}, makeRnd(1))).toBeNull();
  });

  it("duello: minigioco avvolto in «child», poi voto del draft e della battaglia, con input accettati dal plugin", () => {
    const duel = createKnightDuel(roundMinigames);
    const vf = roundMinigames["vero-falso"]!;
    const cfg = {
      mode: duelModeSchema.parse({ sideA: "t1", sideB: "t2", pool: ["vf"], hp: 12, minigamesPerBattle: 1, maxBattles: 2, draftSeconds: 20, battleSeconds: 20 }),
      pool: [{ instanceId: "vf", title: "Raffica", typeId: "vero-falso", theme: "retro80" as const, config: vf.configSchema.parse({ statements: [{ text: "x", answer: true }], timeSec: 6, revealSec: 1 }) }],
      deck: DEFAULT_DECK,
    };
    let s = duel.init(cfg, ctx, 0);
    const rnd = makeRnd(3);
    const act = (now: number) => {
      for (const p of ctx.players) {
        const frame = duel.viewFor(s, p.id, p.teamId) as Record<string, any>;
        const d = decide("knight-duel", frame, rnd);
        for (const input of d?.inputs ?? []) {
          const parsed = duel.inputSchema.safeParse(input);
          expect(parsed.success, JSON.stringify(input)).toBe(true);
          if (parsed.success) s = duel.onInput(s, p.id, parsed.data, { ...meta, receivedAt: now, claimedTime: now - 10 });
        }
      }
    };

    act(100);
    s = duel.onTick(duel.onTick(s, 300), 1_500); // minigioco concluso
    expect(s.phase).toBe("draft");
    act(1_600); // sceglie il team vincitore...
    s = duel.onTick(s, 1_650); // ...e il draft passa all'altro
    act(1_700);
    s = duel.onTick(s, 1_750);
    expect(s.phase).toBe("battle"); // i due team hanno votato e confermato il draft
    act(1_800);
    s = duel.onTick(s, 1_900);
    expect(s.phase).toBe("battle-result"); // tutti hanno confermato: lo scontro si risolve senza attendere il tempo
  });
});
