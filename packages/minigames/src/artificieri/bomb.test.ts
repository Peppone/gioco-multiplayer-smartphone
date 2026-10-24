import { describe, expect, it } from "vitest";
import { TEST_WORDS } from "./test-helpers.js";
import { type BombSetup, MODULES, buildManual, generateBomb, judgeModule } from "./bomb.js";
import { type ButtonData, type ButtonRules, RELEASE_TOLERANCE_MS, buttonMode, releaseOk, timerDigit } from "./modules/button.js";
import { type SymbolRules, type SymbolsData, SYMBOL_COLUMNS, SYMBOLS_PER_COLUMN, symbolOrder } from "./modules/symbols.js";
import { DIFFICULTIES, type Difficulty, MODULE_KINDS, type ModuleAction, type ModuleInstance } from "./modules/types.js";
import { type WireRule, type WireRules, describeWireCond, describeWireRule, isShadowedBy, matchingWireRule, wireSolution } from "./modules/wires.js";
import type { WiresData } from "./modules/wires.js";

const ALL = { modules: 6, enabled: MODULE_KINDS, content: { words: TEST_WORDS } };
/** I tre tipi della prima versione: per le istantanee e i titoli del manuale che non devono cambiare. */
const BASE = ["wires", "button", "symbols"] as const;
const SEEDS = 5000;

/** Tempo rimasto che la tolleranza non confonde: sta a metà di un secondo del timer, quindi ha una sola cifra. */
const msForDigit = (d: number) => 60_000 + ((d + 9) % 10) * 1000 + 500;

/** Azioni possibili su un modulo appena generato (il primo passo di qualsiasi soluzione). */
function firstSteps(mod: ModuleInstance): ModuleAction[] {
  if (mod.kind === "wires") return (mod.data as WiresData).wires.map((_, wire) => ({ type: "cut", wire }));
  if (mod.kind === "button") return [{ type: "tap" }, { type: "hold" }, { type: "release" }];
  if (mod.kind === "colors") return [0, 1, 2, 3].map((key) => ({ type: "press", key }));
  if (mod.kind === "maze") return (["up", "down", "left", "right"] as const).map((dir) => ({ type: "move", dir }));
  if (mod.kind === "word") return [{ type: "submit" }];
  return (mod.data as SymbolsData).symbols.map((_, key) => ({ type: "press", key }));
}

function play(setup: BombSetup, mod: ModuleInstance, actions: ModuleAction[], remainingMs = 90_000) {
  let cur = mod;
  const verdicts = [];
  for (const a of actions) {
    const out = judgeModule(setup, cur, a, remainingMs);
    verdicts.push(out.verdict);
    cur = out.module;
  }
  return { module: cur, verdicts };
}

describe.each(DIFFICULTIES)("generazione e giudizio (%s)", (difficulty: Difficulty) => {
  it(`per ${SEEDS} semi ogni modulo ha una sola soluzione, che il giudice accetta`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const setup = generateBomb(seed, { ...ALL, difficulty });
      for (const mod of setup.modules) {
        const sol = MODULES[mod.kind].solution({ data: mod.data, rules: setup.rules[mod.kind], edge: setup.edgework, progress: mod.progress, strikes: 0 });
        // dal primo passo, solo quello della soluzione non è un errore (nel labirinto e nella parola ci sono più mosse lecite)
        const fine = firstSteps(mod).filter((a) => judgeModule(setup, mod, a, msForDigit(0)).verdict !== "strike" && judgeModule(setup, mod, a, msForDigit(0)).verdict !== "ignored");
        if (mod.kind === "maze") expect(fine, `seme ${seed}, labirinto`).toContainEqual(sol.actions[0]);
        else if (mod.kind === "word") expect(fine, `seme ${seed}, parola: «Invia» subito sarebbe un errore`).toEqual([]);
        else expect(fine, `seme ${seed}, modulo ${mod.kind}`).toEqual([sol.actions[0]]);
        // la soluzione completa chiude il modulo, e solo all'ultimo passo
        const last = sol.actions.length - 1;
        const actions = sol.actions;
        const done = play(setup, mod, actions.slice(0, last), msForDigit(sol.releaseDigit ?? 0));
        expect(done.module.solved).toBe(false);
        const end = judgeModule(setup, done.module, actions[last]!, msForDigit(sol.releaseDigit ?? 0));
        expect(end.verdict, `seme ${seed}, modulo ${mod.kind}`).toBe("solved");
        expect(end.module.solved).toBe(true);
        // un modulo disinnescato non reagisce più
        expect(judgeModule(setup, end.module, actions[0]!, 90_000).verdict).toBe("ignored");
      }
    }
  });

  it("stesso seme, stessa bomba; seme diverso, bomba diversa", () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(generateBomb(seed, { ...ALL, difficulty })).toEqual(generateBomb(seed, { ...ALL, difficulty }));
    }
    const distinct = new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(generateBomb(i + 1, { ...ALL, difficulty }))));
    expect(distinct.size).toBe(200);
  });

  it("la bomba rispetta il numero di moduli e i tipi ammessi, con ogni tipo almeno una volta se ci stanno", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const setup = generateBomb(seed, { difficulty, modules: 4, enabled: ["wires", "symbols"] });
      expect(setup.modules).toHaveLength(4);
      expect(setup.modules.map((m) => m.id)).toEqual([0, 1, 2, 3]);
      expect(new Set(setup.modules.map((m) => m.kind))).toEqual(new Set(["wires", "symbols"]));
      expect(Object.keys(setup.rules).sort()).toEqual(["symbols", "wires"]);
    }
    expect(() => generateBomb(1, { difficulty, modules: 3, enabled: [] })).toThrow();
  });

  it("le regole di un tipo non dipendono dai tipi ammessi (aggiungerne uno non cambia gli altri)", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const solo = generateBomb(seed, { difficulty, modules: 3, enabled: ["wires"] });
      const all = generateBomb(seed, { ...ALL, difficulty, modules: 3 });
      expect(all.rules.wires).toEqual(solo.rules.wires);
      expect(all.edgework).toEqual(solo.edgework);
    }
  });
});

describe("fili", () => {
  it("l'ultima regola di ogni elenco non ha condizioni e i bersagli esistono sempre", () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 1000; seed++) {
        const setup = generateBomb(seed, { ...ALL, difficulty });
        const rules = setup.rules.wires as WireRules;
        rules.byCount.forEach((list, i) => {
          expect(list.at(-1)!.when).toEqual([]);
          expect(list.slice(0, -1).every((r) => r.when.length > 0)).toBe(true);
          for (const r of list) if (typeof r.cut.which === "number") expect(r.cut.which).toBeLessThanOrEqual(i + 3);
        });
        for (const mod of setup.modules.filter((m) => m.kind === "wires")) {
          const wires = (mod.data as WiresData).wires;
          const idx = wireSolution(wires, rules, setup.edgework);
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(wires.length);
        }
      }
    }
  });

  it("nello stesso elenco nessuna regola ripete le condizioni di un'altra né è oscurata da una precedente", () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 2000; seed++) {
        const rules = generateBomb(seed, { difficulty, modules: 3, enabled: ["wires"] }).rules.wires as WireRules;
        for (const list of rules.byCount) {
          list.forEach((r, i) => {
            if (r.when.length === 0) return;
            expect(isShadowedBy(r, list.slice(0, i)), `${difficulty} #${seed}: ${describeWireRule(r)}`).toBe(false);
          });
          const texts = list.slice(0, -1).map((r) => r.when.map(describeWireCond).sort().join(" e "));
          expect(new Set(texts).size).toBe(texts.length);
        }
      }
    }
  });

  it("isShadowedBy riconosce condizioni identiche e condizioni più larghe messe prima", () => {
    const rule = (when: WireRule["when"], color: "red" | "blue"): WireRule => ({ when, cut: { color, which: "first" } });
    const four = { type: "count", color: "red", op: "eq", n: 1 } as const;
    expect(isShadowedBy(rule([four], "blue"), [rule([four], "red")])).toBe(true);
    expect(isShadowedBy(rule([{ type: "count", color: "red", op: "gte", n: 3 }], "blue"), [rule([{ type: "count", color: "red", op: "gte", n: 2 }], "red")])).toBe(true);
    expect(isShadowedBy(rule([{ type: "count", color: "red", op: "gte", n: 2 }], "blue"), [rule([{ type: "count", color: "red", op: "gte", n: 3 }], "red")])).toBe(false);
    expect(isShadowedBy(rule([four, { type: "serial-odd" }], "blue"), [rule([four], "red")])).toBe(true);
    expect(isShadowedBy(rule([four], "blue"), [rule([four, { type: "serial-odd" }], "red")])).toBe(false);
    expect(isShadowedBy(rule([{ type: "last", color: "red" }], "blue"), [rule([{ type: "last", color: "blue" }], "red")])).toBe(false);
  });

  it("i fili sono 3–4 in facile, 3–5 in media e 3–6 in difficile, e tutte le regole scattano ogni tanto", () => {
    const limits = { facile: 4, media: 5, difficile: 6 };
    for (const difficulty of DIFFICULTIES) {
      const counts = new Set<number>();
      let fallback = 0;
      let total = 0;
      for (let seed = 1; seed <= 2000; seed++) {
        const setup = generateBomb(seed, { difficulty, modules: 3, enabled: ["wires"] });
        const rules = setup.rules.wires as WireRules;
        for (const mod of setup.modules) {
          const wires = (mod.data as WiresData).wires;
          counts.add(wires.length);
          total++;
          if (matchingWireRule(wires, rules, setup.edgework).when.length === 0) fallback++;
        }
      }
      expect([...counts].sort()).toEqual(Array.from({ length: limits[difficulty] - 2 }, (_, i) => i + 3));
      // se «altrimenti» valesse quasi sempre, le altre regole sarebbero decorazione
      expect(fallback / total, difficulty).toBeLessThan(0.6);
    }
  });
});

describe("pulsante", () => {
  it("tiene conto di colore, scritta e bordo, e può chiedere sia di premere sia di tenere", () => {
    const modes = new Set<string>();
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 1000; seed++) {
        const setup = generateBomb(seed, { difficulty, modules: 3, enabled: ["button"] });
        const rules = setup.rules.button as ButtonRules;
        expect(new Set(Object.values(rules.releaseDigit)).size).toBe(5);
        for (const mod of setup.modules) modes.add(buttonMode(mod.data as ButtonData, rules, setup.edgework));
      }
    }
    expect([...modes].sort()).toEqual(["hold", "tap"]);
  });

  it("il rilascio sulla cifra giusta vale, su un'altra no", () => {
    for (let d = 0; d < 10; d++) {
      expect(timerDigit(msForDigit(d))).toBe(d);
      for (let other = 0; other < 10; other++) expect(releaseOk(d, msForDigit(other)), `${d} / ${other}`).toBe(d === other);
    }
  });

  it("la tolleranza vale ±150 ms intorno al cambio di cifra e non oltre", () => {
    // a 61 000 ms il timer passa da 62 a 61: nei 150 ms intorno valgono sia la cifra 2 sia la 1
    expect(releaseOk(1, 61_000)).toBe(true);
    expect(releaseOk(2, 61_000)).toBe(true);
    expect(releaseOk(2, 61_000 - RELEASE_TOLERANCE_MS + 1)).toBe(true);
    expect(releaseOk(2, 61_000 - RELEASE_TOLERANCE_MS)).toBe(false);
    expect(releaseOk(1, 61_000 + RELEASE_TOLERANCE_MS)).toBe(true);
    expect(releaseOk(1, 61_000 + RELEASE_TOLERANCE_MS + 1)).toBe(false);
    expect(releaseOk(3, 61_000)).toBe(false);
  });

  it("tenere premuto quando va solo premuto è un errore; rilasciare senza aver tenuto non conta", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const setup = generateBomb(seed, { difficulty: "media", modules: 1, enabled: ["button"] });
      const mod = setup.modules[0]!;
      const mode = buttonMode(mod.data as ButtonData, setup.rules.button as ButtonRules, setup.edgework);
      expect(judgeModule(setup, mod, { type: "release" }, 50_000).verdict).toBe("ignored");
      if (mode === "tap") {
        expect(judgeModule(setup, mod, { type: "hold" }, 50_000).verdict).toBe("strike");
      } else {
        expect(judgeModule(setup, mod, { type: "tap" }, 50_000).verdict).toBe("strike");
        const held = judgeModule(setup, mod, { type: "hold" }, 50_000);
        expect(held.verdict).toBe("ok");
        // già tenuto: un altro «tieni» o un «premi» non contano
        expect(judgeModule(setup, held.module, { type: "hold" }, 50_000).verdict).toBe("ignored");
        expect(judgeModule(setup, held.module, { type: "tap" }, 50_000).verdict).toBe("ignored");
        // rilascio sbagliato: errore, e si può riprovare
        const digit = (setup.rules.button as ButtonRules).releaseDigit[(mod.data as ButtonData).strip];
        const wrong = judgeModule(setup, held.module, { type: "release" }, msForDigit((digit + 3) % 10));
        expect(wrong.verdict).toBe("strike");
        expect(wrong.module.solved).toBe(false);
        expect(judgeModule(setup, wrong.module, { type: "hold" }, 50_000).verdict).toBe("ok");
      }
    }
  });
});

describe("simboli", () => {
  it("6 colonne di 7 simboli distinti, e i simboli della bomba stanno in una sola colonna", () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 1000; seed++) {
        const setup = generateBomb(seed, { difficulty, modules: 3, enabled: ["symbols"] });
        const rules = setup.rules.symbols as SymbolRules;
        expect(rules.columns).toHaveLength(SYMBOL_COLUMNS);
        for (const col of rules.columns) {
          expect(col).toHaveLength(SYMBOLS_PER_COLUMN);
          expect(new Set(col).size).toBe(SYMBOLS_PER_COLUMN);
        }
        for (const mod of setup.modules) {
          const data = mod.data as SymbolsData;
          expect(data.symbols).toHaveLength(difficulty === "facile" ? 3 : 4);
          expect(new Set(data.symbols).size).toBe(data.symbols.length);
          expect(rules.columns.filter((col) => data.symbols.every((s) => col.includes(s)))).toHaveLength(1);
          // l'ordine di comparsa non è già quello giusto
          expect(symbolOrder(data, rules)).not.toEqual(data.symbols.map((_, i) => i));
        }
      }
    }
  });

  it("un tasto sbagliato è un errore e non avanza; un tasto già premuto non conta", () => {
    const setup = generateBomb(11, { difficulty: "media", modules: 1, enabled: ["symbols"] });
    const mod = setup.modules[0]!;
    const order = symbolOrder(mod.data as SymbolsData, setup.rules.symbols as SymbolRules);
    const wrong = order[1]!;
    const bad = judgeModule(setup, mod, { type: "press", key: wrong }, 0);
    expect(bad.verdict).toBe("strike");
    expect(bad.module.progress).toEqual({ pressed: [] });
    const first = judgeModule(setup, mod, { type: "press", key: order[0]! }, 0);
    expect(first.verdict).toBe("ok");
    expect(judgeModule(setup, first.module, { type: "press", key: order[0]! }, 0).verdict).toBe("ignored");
    expect(judgeModule(setup, first.module, { type: "press", key: 99 }, 0).verdict).toBe("ignored");
  });
});

describe("azioni estranee al modulo e stato", () => {
  it("un'azione di un altro tipo non conta e non cambia il modulo", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const setup = generateBomb(seed, { ...ALL, difficulty: "media" });
      for (const mod of setup.modules) {
        const foreign: ModuleAction[] =
          mod.kind === "wires"
            ? [{ type: "tap" }, { type: "press", key: 0 }, { type: "submit" }]
            : mod.kind === "button"
              ? [{ type: "cut", wire: 0 }, { type: "press", key: 0 }, { type: "move", dir: "up" }]
              : mod.kind === "symbols" || mod.kind === "colors"
                ? [{ type: "cut", wire: 0 }, { type: "tap" }, { type: "hold" }, { type: "submit" }, { type: "move", dir: "up" }]
                : [{ type: "cut", wire: 0 }, { type: "tap" }, { type: "hold" }, { type: "press", key: 0 }];
        for (const a of foreign) {
          const out = judgeModule(setup, mod, a, 60_000);
          expect(out.verdict).toBe("ignored");
          expect(out.module).toBe(mod);
        }
      }
    }
  });

  it("judgeModule non modifica il modulo ricevuto", () => {
    const setup = generateBomb(5, { ...ALL, difficulty: "media" });
    const before = JSON.stringify(setup);
    for (const mod of setup.modules) for (const a of firstSteps(mod)) judgeModule(setup, mod, a, 60_000);
    expect(JSON.stringify(setup)).toBe(before);
  });
});

describe("manuale", () => {
  it("le pagine sono numerate, il bordo è la prima e ci sono i tipi ammessi", () => {
    const setup = generateBomb(3, { difficulty: "difficile", modules: 4, enabled: BASE });
    const pages = buildManual(setup.rules);
    expect(pages.map((p) => p.id)).toEqual(pages.map((_, i) => i));
    expect(pages[0]!.title).toBe("Il bordo della bomba");
    expect(pages.map((p) => p.title)).toEqual(["Il bordo della bomba", "Fili (3 e 4 fili)", "Fili (5 e 6 fili)", "Pulsante: premere o tenere", "Pulsante: la striscia", "Simboli"]);
    const solo = buildManual(generateBomb(3, { difficulty: "facile", modules: 2, enabled: ["wires"] }).rules);
    expect(solo.map((p) => p.title)).toEqual(["Il bordo della bomba", "Fili (3 e 4 fili)"]);
    expect(buildManual(generateBomb(3, { difficulty: "media", modules: 2, enabled: ["wires"] }).rules).map((p) => p.title)).toEqual(["Il bordo della bomba", "Fili (3 e 4 fili)", "Fili (5 fili)"]);
  });

  it("ogni regola dei fili ha la sua riga nel testo, con le stesse parole della struttura", () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 200; seed++) {
        const setup = generateBomb(seed, { difficulty, modules: 2, enabled: ["wires"] });
        const rules = setup.rules.wires as WireRules;
        const pages = buildManual(setup.rules).filter((p) => p.title.startsWith("Fili"));
        const lists = pages.flatMap((p) => p.blocks.filter((b) => b.type === "list"));
        expect(lists).toHaveLength(rules.byCount.length);
        lists.forEach((l, i) => {
          if (l.type !== "list") return;
          expect(l.items).toEqual(rules.byCount[i]!.map(describeWireRule));
          expect(l.items.at(-1)).toMatch(/^Altrimenti: taglia /);
          for (const item of l.items) expect(item).not.toMatch(/undefined|NaN|\[object/);
        });
      }
    }
  });

  it("la tabella della striscia ha i 5 colori e le colonne dei simboli sono quelle delle regole", () => {
    const setup = generateBomb(8, { difficulty: "media", modules: 3, enabled: BASE });
    const pages = buildManual(setup.rules);
    const table = pages.flatMap((p) => p.blocks).find((b) => b.type === "table");
    expect(table?.type === "table" && table.rows.map((r) => r[0])).toEqual(["blu", "bianco", "giallo", "rosso", "verde"]);
    const sym = pages.flatMap((p) => p.blocks).find((b) => b.type === "symbols");
    expect(sym?.type === "symbols" && sym.columns).toEqual((setup.rules.symbols as SymbolRules).columns);
  });

  it("il manuale di un seme fisso non cambia (istantanea)", () => {
    const setup = generateBomb(2024, { difficulty: "media", modules: 4, enabled: BASE });
    expect(buildManual(setup.rules)).toMatchSnapshot();
    expect(setup.edgework).toMatchSnapshot();
  });
});
