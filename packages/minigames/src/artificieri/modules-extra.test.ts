import { describe, expect, it } from "vitest";
import { cellXY, distances, shortestPath, step } from "../maze.js";
import { MODULES, buildManual, generateBomb, judgeModule } from "./bomb.js";
import { artificieri as plugin } from "./index.js";
import { LAMPS, LAMP_NAME, type ColorsData, type ColorsRules, STRIKE_TABLES, colorToPress } from "./modules/colors.js";
import { MAZES_IN_MANUAL, MAZE_SIZE, type MazeData, type MazeRules, mazeFor } from "./modules/maze.js";
import { DIFFICULTIES, type Difficulty, type ModuleInstance } from "./modules/types.js";
import { MIN_WORDS, WHEEL_LETTERS, type WordData, type WordRules, normalizeWord5, targetOf, usableWords } from "./modules/word.js";
import { TEST_WORDS, only } from "./test-helpers.js";

const SEEDS = 3000;
const gen = (seed: number, kind: string, difficulty: Difficulty, modules = 1) => generateBomb(seed, { difficulty, modules, enabled: [kind as never], content: { words: TEST_WORDS } });
const sol = (s: ReturnType<typeof gen>, m: ModuleInstance, strikes = 0) => MODULES[m.kind].solution({ data: m.data, rules: s.rules[m.kind], edge: s.edgework, progress: m.progress, strikes });

describe.each(DIFFICULTIES)("Colori (%s)", (difficulty) => {
  const LENGTH = { facile: 3, media: 4, difficile: 5 }[difficulty];

  it(`sequenza di ${LENGTH} lampi, mai tutti uguali; la soluzione a passi la chiude solo all'ultimo tasto`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = gen(seed, "colors", difficulty);
      const m = s.modules[0]!;
      const data = m.data as ColorsData;
      expect(data.sequence).toHaveLength(LENGTH);
      expect(new Set(data.sequence).size, `seme ${seed}`).toBeGreaterThan(1);
      const actions = sol(s, m).actions;
      // 1 + 2 + … + L tasti: ripete la sequenza dall'inizio a ogni passo
      expect(actions).toHaveLength((LENGTH * (LENGTH + 1)) / 2);
      let cur = m;
      actions.forEach((a, i) => {
        const out = judgeModule(s, cur, a, 0, 0);
        expect(out.verdict, `seme ${seed}, tasto ${i}`).toBe(i === actions.length - 1 ? "solved" : "ok");
        cur = out.module;
      });
    }
  });

  it("un tasto sbagliato è un errore e riporta all'inizio del passo, senza cambiare passo", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = gen(seed, "colors", difficulty);
      let m = s.modules[0]!;
      const keys = sol(s, m).actions.map((a) => (a as { key: number }).key);
      // si arriva al passo 2 (due lampi) e si sbaglia a metà
      for (const k of keys.slice(0, 1)) m = judgeModule(s, m, { type: "press", key: k }, 0, 0).module;
      expect(m.progress).toEqual({ stage: 1, entered: 0 });
      m = judgeModule(s, m, { type: "press", key: keys[1]! }, 0, 0).module;
      expect(m.progress).toEqual({ stage: 1, entered: 1 });
      const wrong = (keys[2]! + 1) % 4;
      const bad = judgeModule(s, m, { type: "press", key: wrong }, 0, 0);
      expect(bad.verdict).toBe("strike");
      expect(bad.module.progress).toEqual({ stage: 1, entered: 0 });
    }
  });
});

describe("Colori: la tabella cambia con errori e vocali", () => {
  it("ogni tabella è una permutazione dei 4 colori", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const rules = gen(seed, "colors", "media").rules.colors as ColorsRules;
      expect(rules.map).toHaveLength(2);
      for (const byVowel of rules.map) {
        expect(byVowel).toHaveLength(STRIKE_TABLES);
        for (const table of byVowel) expect([...table].sort()).toEqual([0, 1, 2, 3]);
      }
    }
  });

  it("il colore da premere dipende davvero dagli errori (e il giudice usa quelli della bomba)", () => {
    let differs = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = gen(seed, "colors", "difficile");
      const m = s.modules[0]!;
      const rules = s.rules.colors as ColorsRules;
      const seen = (m.data as ColorsData).sequence[0]!;
      const k0 = colorToPress(rules, s.edgework, 0, seen);
      const k2 = colorToPress(rules, s.edgework, 2, seen);
      expect(colorToPress(rules, s.edgework, 7, seen), "da 2 errori in su è la stessa tabella").toBe(k2);
      // il giudice premia il tasto della tabella corretta per gli errori fatti
      expect(judgeModule(s, m, { type: "press", key: k2 }, 0, 2).verdict).not.toBe("strike");
      expect(judgeModule(s, m, { type: "press", key: k0 }, 0, 0).verdict).not.toBe("strike");
      if (k0 !== k2) {
        differs++;
        expect(judgeModule(s, m, { type: "press", key: k0 }, 0, 2).verdict).toBe("strike");
      }
    }
    expect(differs, "le tabelle devono differire spesso").toBeGreaterThan(100);
  });

  it("il testo del manuale ha le due tabelle, con gli stessi colori della struttura", () => {
    const s = gen(5, "colors", "media");
    const rules = s.rules.colors as ColorsRules;
    const page = buildManual(s.rules).find((p) => p.title === "Colori")!;
    const tables = page.blocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(2);
    tables.forEach((t, v) => {
      if (t.type !== "table") return;
      expect(t.head).toEqual(["Errori", ...LAMPS.map((l) => `Vedi ${LAMP_NAME[l]}`)]);
      expect(t.rows.map((r) => r[0])).toEqual(["0", "1", "2 o più"]);
      t.rows.forEach((row, strikes) => row.slice(1).forEach((cell, seen) => expect(cell).toBe(`premi ${LAMP_NAME[LAMPS[rules.map[v]![strikes]![seen]!]!]}`)));
    });
  });
});

describe.each(DIFFICULTIES)("Labirinto (%s)", (difficulty) => {
  it(`nove labirinti con segni diversi; ogni bomba ne ha uno solo; la soluzione arriva e non sbatte`, () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const s = gen(seed, "maze", difficulty);
      const rules = s.rules.maze as MazeRules;
      expect(rules.mazes).toHaveLength(MAZES_IN_MANUAL);
      const pairs = rules.mazes.map((m) => m.marks.join(","));
      expect(new Set(pairs).size, `seme ${seed}: segni ripetuti`).toBe(MAZES_IN_MANUAL);
      const m = s.modules[0]!;
      const data = m.data as MazeData;
      expect(rules.mazes.filter((x) => x.marks.join(",") === data.marks.join(",")), "un solo labirinto con questi segni").toHaveLength(1);
      const maze = { w: MAZE_SIZE, h: MAZE_SIZE, cells: mazeFor(rules, data.marks).cells };
      const dist = distances(maze, data.start)[data.goal]!;
      expect(dist, `seme ${seed}: partenza e arrivo vicini`).toBeGreaterThanOrEqual({ facile: 5, media: 7, difficile: 9 }[difficulty] - 5);
      // la soluzione è un percorso valido, e il modulo si chiude solo all'ultima mossa
      const actions = sol(s, m).actions;
      expect(actions).toHaveLength(dist);
      let cur = m;
      actions.forEach((a, i) => {
        const out = judgeModule(s, cur, a, 0);
        expect(out.verdict, `seme ${seed}, mossa ${i}`).toBe(i === actions.length - 1 ? "solved" : "ok");
        cur = out.module;
      });
    }
  });
});

describe("Labirinto: muri, bordi e manuale", () => {
  it("contro un muro (o il bordo) è un errore e non ci si muove; le mosse libere spostano", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = gen(seed, "maze", "media");
      const rules = s.rules.maze as MazeRules;
      const m = s.modules[0]!;
      const data = m.data as MazeData;
      const maze = { w: MAZE_SIZE, h: MAZE_SIZE, cells: mazeFor(rules, data.marks).cells };
      for (const dir of ["up", "down", "left", "right"] as const) {
        const out = judgeModule(s, m, { type: "move", dir }, 0);
        const next = step(maze, data.start, dir);
        if (next === null) {
          expect(out.verdict).toBe("strike");
          expect(out.module.progress).toEqual({ pos: data.start });
        } else {
          expect(out.verdict).toBe(next === data.goal ? "solved" : "ok");
          expect(out.module.progress).toEqual({ pos: next });
        }
      }
    }
  });

  it("il manuale ha 3 pagine da 3 labirinti, con le stesse celle e gli stessi segni delle regole", () => {
    const s = gen(9, "maze", "facile");
    const rules = s.rules.maze as MazeRules;
    const pages = buildManual(s.rules).filter((p) => p.title.startsWith("Labirinti"));
    expect(pages.map((p) => p.title)).toEqual(["Labirinti 1–3", "Labirinti 4–6", "Labirinti 7–9"]);
    const mazes = pages.flatMap((p) => p.blocks.flatMap((b) => (b.type === "mazes" ? b.mazes : [])));
    expect(mazes).toEqual(rules.mazes);
    // i segni sono nelle celle (non sullo stesso punto) e il percorso esiste in ogni labirinto
    for (const mz of mazes) {
      expect(mz.marks[0]).not.toBe(mz.marks[1]);
      const maze = { w: MAZE_SIZE, h: MAZE_SIZE, cells: mz.cells };
      expect(shortestPath(maze, 0, MAZE_SIZE * MAZE_SIZE - 1)).not.toBeNull();
      expect(cellXY(maze, mz.marks[1]).x).toBeLessThan(MAZE_SIZE);
    }
  });
});

describe("Parola", () => {
  it("normalizza le parole: maiuscole senza accenti, solo di 5 lettere, senza doppioni", () => {
    expect(normalizeWord5("città")).toBe("CITTA");
    expect(normalizeWord5("  pizza")).toBeNull();
    expect(normalizeWord5("Perché")).toBeNull();
    expect(normalizeWord5("a-bcd")).toBeNull();
    expect(normalizeWord5("sei")).toBeNull();
    expect(usableWords(["Pizza", "PIZZA", "pizzà", "mare", "Libro", "tre parole", "Città"])).toEqual(["PIZZA", "LIBRO", "CITTA"]);
  });

  it("con meno di MIN_WORDS parole il modulo non si genera, e senza contenuto neppure", () => {
    expect(() => generateBomb(1, { difficulty: "media", modules: 1, enabled: ["word"], content: { words: TEST_WORDS.slice(0, MIN_WORDS - 1) } })).toThrow(/almeno 12 parole/);
    expect(() => generateBomb(1, { difficulty: "media", modules: 1, enabled: ["word"] })).toThrow(/almeno 12 parole/);
    expect(() => generateBomb(1, { difficulty: "media", modules: 1, enabled: ["word"], content: { words: TEST_WORDS.slice(0, MIN_WORDS) } })).not.toThrow();
  });

  describe.each(DIFFICULTIES)("(%s)", (difficulty) => {
    const LIST = { facile: 12, media: 20, difficile: 30 }[difficulty];
    it(`elenco di ${LIST} parole in ordine alfabetico; una sola si compone con le rotelle e non sta nei dati`, () => {
      for (let seed = 1; seed <= 1500; seed++) {
        const s = gen(seed, "word", difficulty);
        const rules = s.rules.word as WordRules;
        expect(rules.words).toHaveLength(LIST);
        expect(rules.words).toEqual([...rules.words].sort());
        const m = s.modules[0]!;
        const data = m.data as WordData;
        expect("target" in data, "la parola giusta non deve stare nei dati (la TV è pubblica)").toBe(false);
        expect(data.wheels).toHaveLength(5);
        for (const wheel of data.wheels) {
          expect(wheel).toHaveLength(WHEEL_LETTERS);
          expect(new Set(wheel).size).toBe(WHEEL_LETTERS);
        }
        const fit = rules.words.filter((w) => [...w].every((ch, i) => data.wheels[i]!.includes(ch)));
        expect(fit, `seme ${seed}: parole componibili`).toHaveLength(1);
        expect(targetOf(data, rules)).toBe(fit[0]);
        // all'inizio le rotelle non compongono la parola giusta
        const initial = (m.progress as { pos: number[] }).pos.map((p, i) => data.wheels[i]![p]).join("");
        expect(initial).not.toBe(fit[0]);
      }
    });

    it("la soluzione gira le rotelle per la via più corta e «Invia» chiude il modulo", () => {
      for (let seed = 1; seed <= 500; seed++) {
        const s = gen(seed, "word", difficulty);
        const m = s.modules[0]!;
        const actions = sol(s, m).actions;
        expect(actions.at(-1)).toEqual({ type: "submit" });
        expect(actions.length - 1, "al massimo 3 scatti per rotella").toBeLessThanOrEqual(15);
        let cur = m;
        actions.forEach((a, i) => {
          const out = judgeModule(s, cur, a, 0);
          expect(out.verdict, `seme ${seed}, azione ${i}`).toBe(i === actions.length - 1 ? "solved" : "ok");
          cur = out.module;
        });
      }
    });
  });

  it("girare non è mai un errore (anche oltre il giro); «Invia» con la parola sbagliata sì; rotelle inesistenti si ignorano", () => {
    const s = gen(3, "word", "media");
    let m = s.modules[0]!;
    const start = [...(m.progress as { pos: number[] }).pos];
    for (let k = 0; k < 6; k++) {
      const out = judgeModule(s, m, { type: "spin", wheel: 2, delta: 1 }, 0);
      expect(out.verdict).toBe("ok");
      m = out.module;
    }
    expect((m.progress as { pos: number[] }).pos).toEqual(start);
    const back = judgeModule(s, m, { type: "spin", wheel: 0, delta: -1 }, 0);
    expect((back.module.progress as { pos: number[] }).pos[0]).toBe((start[0]! + 5) % 6);
    expect(judgeModule(s, m, { type: "submit" }, 0).verdict).toBe("strike");
    expect(judgeModule(s, m, { type: "spin", wheel: 5, delta: 1 }, 0).verdict).toBe("ignored");
    expect(judgeModule(s, m, { type: "spin", wheel: -1, delta: 1 }, 0).verdict).toBe("ignored");
  });

  it("il manuale elenca tutte le parole dell'elenco", () => {
    const s = gen(4, "word", "media");
    const page = buildManual(s.rules).find((p) => p.title === "Parole")!;
    const block = page.blocks.find((b) => b.type === "words");
    expect(block?.type === "words" && block.words).toEqual((s.rules.word as WordRules).words);
  });
});

describe("configurazione con le parole", () => {
  const lookup = (words: string[]) => (id: string) => (id === "lista" ? { typeId: "word-list", title: "Parole", theme: "gameshow" as const, config: { words } } : undefined);
  const roster = { players: [], teams: [] };

  it("senza il modulo «Parola» non servono parole (è spento di default)", () => {
    expect(plugin.libraryConfigSchema!.safeParse({}).success).toBe(true);
    expect(plugin.configSchema.parse({}).enabledModules.word).toBe(false);
    expect(plugin.buildConfig!({}, () => undefined, roster).ok).toBe(true);
  });

  it("con il modulo acceso serve una lista (o parole proprie) con almeno 12 parole di 5 lettere", () => {
    const on = { enabledModules: only("wires", "word") };
    expect(plugin.libraryConfigSchema!.safeParse(on).success).toBe(false);
    expect(plugin.libraryConfigSchema!.safeParse({ ...on, wordList: "lista" }).success).toBe(true);
    expect(plugin.libraryConfigSchema!.safeParse({ ...on, words: TEST_WORDS.slice(0, 12) }).success).toBe(true);
    const ok = plugin.buildConfig!({ ...on, wordList: "lista", words: ["Extra"] }, lookup(TEST_WORDS), roster);
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.config.words).toEqual([...TEST_WORDS, "Extra"]);
    const few = plugin.buildConfig!({ ...on, wordList: "lista" }, lookup(["PIZZA", "LIBRO", "lunghissima"]), roster);
    expect(few.ok).toBe(false);
    expect(!few.ok && few.error).toContain("almeno 12 parole");
    const missing = plugin.buildConfig!({ ...on, wordList: "boh" }, lookup(TEST_WORDS), roster);
    expect(!missing.ok && missing.error).toContain("Lista di parole");
  });

  it("una partita col modulo «Parola» parte e le viste non contengono né la lista né la parola giusta", () => {
    const config = plugin.buildConfig!({ enabledModules: only("word"), modules: 3, betSeconds: 0, wordList: "lista" }, lookup(TEST_WORDS), roster);
    expect(config.ok).toBe(true);
    if (!config.ok) return;
    const ctx = { players: [{ id: "a", nickname: "A", teamId: "t" }, { id: "b", nickname: "B", teamId: "t" }, { id: "c", nickname: "C", teamId: "u" }], teams: [{ id: "t", name: "T" }, { id: "u", name: "U" }], seed: 5 };
    let s = plugin.init(config.config, ctx, 1_000);
    s = plugin.onHostCommand(s, { type: "start" }, 1_100);
    expect(s.phase).toBe("defuse");
    const targets = s.bomb!.modules.map((m) => targetOf(m.data as WordData, s.bomb!.rules.word as WordRules));
    // gli esperti hanno il manuale (con l'elenco): le altre viste no
    const views = s.players.map((p) => plugin.viewFor(s, p, null) as { me: { role: string } | null });
    const everything = JSON.stringify([plugin.screenView(s), ...views.filter((v) => v.me?.role !== "expert")]);
    for (const t of targets) expect(everything.includes(`"${t}"`), `la parola ${t} è in una vista`).toBe(false);
    for (const w of (s.bomb!.rules.word as WordRules).words) expect(everything.includes(`"${w}"`), `«${w}» è in una vista`).toBe(false);
  });
});

describe("il piano si ricalcola a ogni passo", () => {
  // I bot e la regia leggono `solution()` dopo ogni azione: deve valere dallo stato corrente, non solo da quello iniziale.
  it.each(["wires", "symbols", "colors", "maze", "word"] as const)("%s: seguendo sempre solo la prima azione si risolve senza errori", (kind) => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 300; seed++) {
        const s = gen(seed, kind, difficulty);
        let m = s.modules[0]!;
        for (let step = 0; step < 80 && !m.solved; step++) {
          const action = sol(s, m).actions[0]!;
          const out = judgeModule(s, m, action, 0, 0);
          expect(out.verdict, `${kind} seme ${seed}, passo ${step}`).not.toBe("strike");
          expect(out.verdict, `${kind} seme ${seed}, passo ${step}: azione ignorata`).not.toBe("ignored");
          m = out.module;
        }
        expect(m.solved, `${kind} seme ${seed} difficoltà ${difficulty}`).toBe(true);
      }
    }
  });
});
