import { describe, expect, it } from "vitest";
import type { AnyMinigame, MinigameContext } from "@gioco/shared";
import { minigames } from "./index.js";

const ctx: MinigameContext = {
  players: [
    { id: "a", nickname: "Ada", teamId: "t1" },
    { id: "b", nickname: "Bob", teamId: "t2" },
  ],
  teams: [
    { id: "t1", name: "Rossi" },
    { id: "t2", name: "Blu" },
  ],
  seed: 42,
};

// Controlli validi per QUALSIASI plugin registrato: un plugin nuovo li eredita senza scrivere nulla.
describe.each(Object.values(minigames))("contratto del plugin «$id»", (plugin: AnyMinigame) => {
  const config = plugin.configSchema.parse(plugin.sampleConfig);

  it("la configurazione di esempio è valida e ha titolo, tema e id in minuscolo con trattini", () => {
    expect(plugin.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(plugin.title.length).toBeGreaterThan(2);
    expect(["gameshow", "pixel", "manga", "retro80", "boom"]).toContain(plugin.defaultTheme);
  });

  it("init è deterministico e lo stato è serializzabile in JSON (serve per gli snapshot)", () => {
    const a = plugin.init(config, ctx, 1_000);
    const b = plugin.init(config, ctx, 1_000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it("onTick non cambia lo stato (stesso oggetto) quando non c'è nulla da fare, e non muta l'input", () => {
    const s = plugin.init(config, ctx, 1_000);
    const before = JSON.stringify(s);
    expect(plugin.onTick(s, 1_001)).toBe(s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("le viste sono JSON puro e la vista della regia espone azioni", () => {
    const s = plugin.init(config, ctx, 1_000);
    for (const view of [plugin.screenView(s), plugin.viewFor(s, "a", "t1"), plugin.hostView(s)]) {
      expect(JSON.parse(JSON.stringify(view))).toBeDefined();
    }
    const host = plugin.hostView(s);
    expect(Array.isArray(host.actions)).toBe(true);
    expect(host.actions.every((x) => typeof x.id === "string" && typeof x.label === "string")).toBe(true);
  });

  it("i dati non validi sono respinti dagli schemi di input e di comando", () => {
    expect(plugin.inputSchema.safeParse({ type: "boh" }).success).toBe(false);
    expect(plugin.inputSchema.safeParse(null).success).toBe(false);
    expect(plugin.commandSchema.safeParse({ type: "boh" }).success).toBe(false);
  });

  it("chi non è in serata non può influenzare il round", () => {
    const s = plugin.init(config, ctx, 1_000);
    // qualunque input valido dello schema, inviato da un estraneo, lascia lo stato identico nei dati
    const samples = [{ type: "answer", choice: 0, value: true }, { type: "buzz" }, { type: "guess", value: 1 }, { type: "vote", option: 0 }];
    for (const raw of samples) {
      const parsed = plugin.inputSchema.safeParse(raw);
      if (!parsed.success) continue;
      const next = plugin.onInput(s, "estraneo", parsed.data, { receivedAt: 1_100, claimedTime: 1_050, rtt: 30 });
      expect(JSON.stringify(next)).toBe(JSON.stringify(s));
    }
  });

  it("un round si può portare a termine con i soli comandi della regia e produce punteggi coerenti", () => {
    let s = plugin.init(config, ctx, 1_000);
    let now = 1_000;
    // Si esegue ogni azione abilitata, preferendo quelle che avanzano; 500 passi sono più che sufficienti.
    for (let i = 0; i < 500 && !plugin.isFinished(s); i++) {
      now += 30_000;
      s = plugin.onTick(s, now);
      if (plugin.isFinished(s)) break;
      const action = plugin.hostView(s).actions.find((a) => a.enabled && !a.danger) ?? plugin.hostView(s).actions.find((a) => a.enabled);
      if (!action) break;
      s = plugin.onHostCommand(s, { type: action.id }, now);
    }
    expect(plugin.isFinished(s), "il round deve poter finire").toBe(true);
    const ranking = plugin.result(s).ranking;
    expect(ranking.map((r) => r.playerId).sort()).toEqual(["a", "b"]);
    for (const d of plugin.scores(s)) expect(Number.isInteger(d.points)).toBe(true);
    // a round finito le viste non devono rompersi
    expect(() => [plugin.screenView(s), plugin.viewFor(s, "a", "t1"), plugin.hostView(s)]).not.toThrow();
  });
});
