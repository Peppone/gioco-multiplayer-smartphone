import { describe, expect, it } from "vitest";
import { makeRng } from "../knight-duel/rng.js";
import { DEFAULT_ADJECTIVES, DEFAULT_NOUNS, SELECTOR_VALUES, isFeminine, makeName, withArticle } from "./names.js";
import { type Control, SLIDER_MAX, makePanels, nextOrder, orderText, pickTarget, valueCount, valueText } from "./panels.js";
import { type CrewScore, crewPoints, distanceOf, rankCrews } from "./scoring.js";

describe("nomi dei comandi", () => {
  it("gli elenchi d'esempio sono lunghi, senza doppioni e fatti di parole di 3–20 lettere", () => {
    for (const list of [DEFAULT_NOUNS, DEFAULT_ADJECTIVES]) {
      expect(list.length).toBeGreaterThanOrEqual(60);
      expect(new Set(list).size).toBe(list.length);
      for (const w of list) expect(w, w).toMatch(/^[A-ZÀ-Ý][a-zà-ÿ]{2,19}$/);
    }
    expect(DEFAULT_NOUNS.length * DEFAULT_ADJECTIVES.length).toBeGreaterThan(3000);
    expect(new Set(SELECTOR_VALUES).size).toBe(SELECTOR_VALUES.length);
  });

  it("gli aggettivi si accordano con il genere del sostantivo", () => {
    expect(makeName("Valvola", "Gelatinoso")).toBe("Valvola Gelatinosa");
    expect(makeName("Defibrillatore", "Quantico")).toBe("Defibrillatore Quantico");
    expect(makeName("Ugello", "Morbido")).toBe("Ugello Morbido");
    expect(makeName("Leva", "Cortese")).toBe("Leva Cortese");
    expect(makeName("Pompa", "Zen")).toBe("Pompa Zen");
    expect(isFeminine("Turbina")).toBe(true);
    expect(isFeminine("Reattore")).toBe(false);
    expect(isFeminine("Condensazione")).toBe(true);
  });

  it("l'articolo giusto: il, lo, la, l'", () => {
    expect(withArticle("Reattore Quantico")).toBe("il Reattore Quantico");
    expect(withArticle("Valvola Gelatinosa")).toBe("la Valvola Gelatinosa");
    expect(withArticle("Ugello Morbido")).toBe("l'Ugello Morbido");
    expect(withArticle("Antenna Pigra")).toBe("l'Antenna Pigra");
    expect(withArticle("Scudo Magnetico")).toBe("lo Scudo Magnetico");
    expect(withArticle("Zaino Cosmico")).toBe("lo Zaino Cosmico");
    expect(withArticle("Brodo Cosmico")).toBe("il Brodo Cosmico");
  });
});

const panels = (seed: number, members = ["a", "b", "c", "d"], perPanel = 4, taken = new Set<string>()) =>
  makePanels({ members, perPanel, nouns: DEFAULT_NOUNS, adjectives: DEFAULT_ADJECTIVES, seed, taken, idPrefix: "x-" });

describe("pannelli", () => {
  it("ogni giocatore ha i suoi comandi, con id e nomi diversi, e sostantivi diversi (finché bastano)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const members = Array.from({ length: 1 + (seed % 8) }, (_, i) => `m${i}`);
      const perPanel = 3 + (seed % 4);
      const cs = panels(seed, members, perPanel);
      expect(cs).toHaveLength(members.length * perPanel);
      expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
      expect(new Set(cs.map((c) => c.name)).size, `seme ${seed}: nomi`).toBe(cs.length);
      expect(new Set(cs.map((c) => c.name.split(" ")[0])).size, `seme ${seed}: sostantivi`).toBe(cs.length);
      for (const m of members) expect(cs.filter((c) => c.owner === m)).toHaveLength(perPanel);
    }
  });

  it("i comandi hanno valori validi: cursore 0–5, selettore da 3 o 4 parole diverse, interruttore e pulsante a zero", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const c of panels(seed)) {
        kinds.add(c.kind);
        if (c.kind === "slider") expect(c.value).toBeGreaterThanOrEqual(0), expect(c.value).toBeLessThanOrEqual(SLIDER_MAX);
        if (c.kind === "selector") {
          expect([3, 4]).toContain(c.options.length);
          expect(new Set(c.options).size).toBe(c.options.length);
          expect(c.value).toBeLessThan(c.options.length);
        } else expect(c.options).toEqual([]);
        if (c.kind === "toggle" || c.kind === "button") expect(c.value).toBe(0);
      }
    }
    expect([...kinds].sort()).toEqual(["button", "selector", "slider", "toggle"]);
  });

  it("è deterministico, e i nomi degli altri equipaggi (`taken`) non si ripetono", () => {
    expect(panels(5)).toEqual(panels(5));
    expect(panels(5)).not.toEqual(panels(6));
    const first = panels(9);
    const taken = new Set(first.map((c) => c.name));
    const second = panels(10, ["e", "f", "g", "h"], 4, taken);
    for (const c of second) expect(taken.has(c.name), c.name).toBe(false);
  });

  it("anche con tanti comandi e pochi nomi (elenchi personalizzati) i nomi restano diversi", () => {
    const cs = makePanels({ members: ["a", "b", "c", "d", "e", "f", "g", "h"], perPanel: 6, nouns: DEFAULT_NOUNS.slice(0, 8), adjectives: DEFAULT_ADJECTIVES.slice(0, 8), seed: 1, taken: new Set(), idPrefix: "y-" });
    expect(cs).toHaveLength(48);
    expect(new Set(cs.map((c) => c.name)).size).toBe(48);
  });
});

describe("ordini", () => {
  const control = (kind: Control["kind"], value: number, options: string[] = []): Control => ({ id: "c1", name: "Valvola Gelatinosa", kind, owner: "a", options, value });

  it("il valore chiesto è sempre diverso da quello attuale", () => {
    const rng = makeRng(3);
    for (let i = 0; i < 5000; i++) {
      for (const c of [control("button", i % 7), control("toggle", i % 2), control("slider", i % 6), control("selector", i % 3, ["A", "B", "C"]), control("selector", i % 4, ["A", "B", "C", "D"])]) {
        const target = pickTarget(c, rng);
        expect(target).not.toBe(c.value);
        if (c.kind === "button") expect(target).toBe(c.value + 1);
        else {
          expect(target).toBeGreaterThanOrEqual(0);
          expect(target).toBeLessThan(valueCount(c));
        }
      }
    }
  });

  it("il testo dell'ordine dice cosa fare, con l'articolo e il nome del comando", () => {
    expect(orderText(control("button", 0), 1)).toBe("Premi la Valvola Gelatinosa!");
    expect(orderText(control("toggle", 0), 1)).toBe("Accendi la Valvola Gelatinosa!");
    expect(orderText(control("toggle", 1), 0)).toBe("Spegni la Valvola Gelatinosa!");
    expect(orderText(control("slider", 1), 3)).toBe("Porta la Valvola Gelatinosa a 3!");
    expect(orderText(control("selector", 0, ["TURBO", "ECO", "SALTO"]), 2)).toBe("Imposta la Valvola Gelatinosa su SALTO!");
    expect(valueText(control("toggle", 1), 1)).toBe("acceso");
    expect(valueText(control("slider", 2), 4)).toBe("4");
    expect(valueText(control("selector", 0, ["TURBO", "ECO"]), 1)).toBe("ECO");
    expect(valueText(control("button", 0), 1)).toBe("premuto");
  });

  const crew = (seed: number, members = ["a", "b", "c", "d"]) => panels(seed, members, 4);

  it("circa l'ownShare% degli ordini è sul proprio pannello, gli altri su un compagno", () => {
    let own = 0;
    let total = 0;
    for (let id = 1; id <= 4000; id++) {
      const controls = crew(1 + (id % 5));
      const holder = ["a", "b", "c", "d"][id % 4]!;
      const o = nextOrder({ controls, busy: new Set(), holder, ownShare: 20, seed: 7, id, now: 1000, seconds: 12 })!;
      const c = controls.find((x) => x.id === o.controlId)!;
      total++;
      if (c.owner === holder) own++;
      expect(o.holder).toBe(holder);
      expect(o.deadline).toBe(1000 + 12_000);
      expect(o.issuedAt).toBe(1000);
      expect(o.text).toContain(c.name);
      expect(o.target).not.toBe(c.value);
    }
    expect(own / total).toBeGreaterThan(0.17);
    expect(own / total).toBeLessThan(0.23);
    // ownShare 0 e 50
    const none = Array.from({ length: 500 }, (_, id) => nextOrder({ controls: crew(2), busy: new Set(), holder: "a", ownShare: 0, seed: 1, id, now: 0, seconds: 5 })!);
    expect(none.every((o) => crew(2).find((c) => c.id === o.controlId)!.owner !== "a")).toBe(true);
  });

  it("evita i comandi che un altro ordine sta già chiedendo, e con un solo membro l'ordine è sul proprio pannello", () => {
    const controls = crew(4);
    const busy = new Set(controls.filter((c) => c.owner !== "a").slice(0, -1).map((c) => c.id));
    const free = controls.filter((c) => c.owner !== "a" && !busy.has(c.id))[0]!;
    for (let id = 1; id <= 100; id++) {
      const o = nextOrder({ controls, busy, holder: "a", ownShare: 0, seed: 1, id, now: 0, seconds: 5 })!;
      expect(o.controlId).toBe(free.id);
    }
    const solo = makePanels({ members: ["a"], perPanel: 4, nouns: DEFAULT_NOUNS, adjectives: DEFAULT_ADJECTIVES, seed: 2, taken: new Set(), idPrefix: "z-" });
    for (let id = 1; id <= 50; id++) expect(solo.find((c) => c.id === nextOrder({ controls: solo, busy: new Set(), holder: "a", ownShare: 0, seed: 1, id, now: 0, seconds: 5 })!.controlId)!.owner).toBe("a");
    expect(nextOrder({ controls: [], busy: new Set(), holder: "a", ownShare: 20, seed: 1, id: 1, now: 0, seconds: 5 })).toBeNull();
  });
});

describe("classifica e punti", () => {
  const c = (id: string, members: number, progress: number, done: number, hull: number): CrewScore => ({ id, members, progress, done, hull });

  it("l'avanzamento è per membro: una squadra piccola non è battuta da una grande solo perché ha più ordini", () => {
    expect(distanceOf(c("a", 2, 10, 10, 100))).toBe(5);
    expect(distanceOf(c("b", 8, 24, 24, 100))).toBe(3);
    expect(rankCrews([c("grande", 8, 24, 24, 100), c("piccola", 2, 10, 10, 100)])).toEqual(["piccola", "grande"]);
    expect(distanceOf(c("v", 0, 5, 5, 100))).toBe(0);
  });

  it("a parità di strada conta lo scafo, poi gli ordini, poi l'id", () => {
    // stessa strada: b ha più scafo di a; c ha lo stesso scafo di b ma meno ordini
    expect(rankCrews([c("a", 4, 8, 8, 60), c("b", 4, 8, 8, 90), c("c", 4, 8, 7, 90)])).toEqual(["b", "c", "a"]);
    expect(rankCrews([c("z", 4, 4, 4, 50), c("a", 4, 4, 4, 50)])).toEqual(["a", "z"]);
  });

  it("i punti: ordini, scafo, podio (solo tra squadre)", () => {
    const cfg = { stepPoints: 10, hullBonus: 100, podiumPoints: [150, 100, 50] };
    expect(crewPoints(cfg, c("a", 4, 12, 12, 75), 0, true)).toBe(120 + 75 + 150);
    expect(crewPoints(cfg, c("a", 4, 12, 12, 75), 2, true)).toBe(120 + 75 + 50);
    expect(crewPoints(cfg, c("a", 4, 12, 12, 75), 3, true)).toBe(120 + 75);
    expect(crewPoints(cfg, c("a", 4, 12, 12, 75), 0, false)).toBe(120 + 75);
    expect(crewPoints(cfg, c("a", 4, 0, 0, 0), 5, true)).toBe(0);
    expect(crewPoints({ ...cfg, hullBonus: 33 }, c("a", 4, 1, 1, 50), 9, false)).toBe(10 + 17);
  });
});
