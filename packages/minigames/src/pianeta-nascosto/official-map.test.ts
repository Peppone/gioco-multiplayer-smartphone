import { describe, expect, it } from "vitest";
import { officialCodeFromFileName, parseOfficialMap } from "./official-map.js";

/**
 * Schema inventato nel formato dell'app (nessun file dell'app nel progetto). Codici: 0 vuoto, 1 asteroide,
 * 2 pianeta nano, 3 cometa, 4 nube di gas, 9 Pianeta X.
 * Settori: 1 ◍, 2 ◍, 3 ☄, 4 vuoto, 5 ☁, 6 ◌, 7 ☄, 8 ☁, 9 vuoto, 10 X, 11 ◍, 12 ◍.
 */
function sampleMap() {
  return {
    obj: { "1": 1, "2": 1, "3": 3, "4": 0, "5": 4, "6": 2, "7": 3, "8": 4, "9": 0, "10": 9, "11": 1, "12": 1 },
    conf: {
      A: { title: [1, 3], body: { type: "confClue1PlusXAdjacentY", X: 1, Y: 3 } },
      B: { title: [2, 1], body: { type: "confClueNoXWithin1Y", X: 2, Y: 1 } },
      C: { title: [1], body: { type: "confClueAllXWithinN", X: 1, Y: null, N: 4 } },
      D: { title: [4], body: { type: "confClueAllXWithinNY", X: 4, Y: 0, N: 2 } },
      E: { title: [2, 4], body: { type: "confClueNoXOppositeY", X: 2, Y: 4 } },
      F: { title: [4, 3], body: { type: "confClue1PlusXAdjacentY", X: 4, Y: 3 } },
      X1: { title: [9, 3], body: { type: "confClue9NotOppositeY", X: 9, Y: 3 } },
    } as Record<string, { title: number[]; body: { type: string; X: number | null; Y: number | null; N?: number } }>,
    info: {
      A: {
        "1": [{ "1": 3 }, { "4": 4 }, { "6": 1 }, { "9": 2 }],
        "2": [{ "2": 4 }, { "5": 3 }, { "8": 1 }, { "12": 2 }],
        "3": [{ "3": 1 }, { "7": 2 }, { "10": 4 }, { "11": 3 }],
      },
    } as Record<string, Record<string, Record<string, number>[]>>,
  };
}

describe("pianeta-nascosto: schemi dell'app ufficiale", () => {
  it("il codice partita viene dal nome del file", () => {
    expect(officialCodeFromFileName("J9B3.json")).toBe("J9B3");
    expect(officialCodeFromFileName("C:\\maps\\a2a2.json")).toBe("A2A2");
    expect(officialCodeFromFileName("manifest.json")).toBeNull();
    expect(officialCodeFromFileName("J9B3.txt")).toBeNull();
  });

  it("legge sistema, ricerche, conferenze e fatti iniziali", () => {
    const r = parseOfficialMap("T3S7", sampleMap());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { system, warnings } = r;
    expect(warnings).toEqual([]);
    expect(system.mode).toBe("standard");
    expect(system.sky[9]).toBe("planetX");
    expect(system.sky.slice(0, 4)).toEqual(["asteroid", "asteroid", "comet", "empty"]);
    expect(system.research.map((x) => x.letter)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(system.research[0]!.clue).toEqual({ kind: "someAdjacent", a: "asteroid", b: "comet" });
    expect(system.research[2]!.clue).toEqual({ kind: "band", a: "asteroid", n: 4 });
    expect(system.research[3]!.clue).toEqual({ kind: "allWithin", a: "gas", b: "empty", n: 2 });
    expect(system.conferences).toEqual([{ id: "X1", clue: { kind: "xNotOpposite", b: "comet" } }]);
    // Una serie, 3 blocchi da 4 fatti: «il settore 1 non contiene una cometa»…
    expect(system.facts).toHaveLength(1);
    expect(system.facts[0]!.map((b) => b.length)).toEqual([4, 4, 4]);
    expect(system.facts[0]![0]![0]).toEqual({ sector: 1, absent: "comet" });
  });

  it("rifiuta una regola che non vale nel sistema", () => {
    const map = sampleMap();
    // Il settore opposto al Pianeta X (10) è il 4, vuoto: «non è opposto a un settore vuoto» è falso.
    map.conf.X1 = { title: [9], body: { type: "confClue9NotOppositeY", X: 9, Y: 0 } };
    const r = parseOfficialMap("T3S7", map);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("X1: la regola non vale nel sistema");
  });

  it("rifiuta un sistema che viola le regole di posizione", () => {
    const map = sampleMap();
    map.obj["3"] = 0;
    map.obj["4"] = 3; // cometa nel settore 4, che non è primo
    const r = parseOfficialMap("T3S7", map);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("cometa nel settore 4"))).toBe(true);
  });

  it("rifiuta tipi di regola sconosciuti, conferenze mancanti e ricerche sul Pianeta X", () => {
    const map = sampleMap();
    map.conf.A = { title: [1], body: { type: "confClueSomethingNew", X: 1, Y: null } };
    map.conf.B = { title: [9, 1], body: { type: "confClue9NotOppositeY", X: 9, Y: 1 } };
    delete map.conf.X1;
    const r = parseOfficialMap("T3S7", map);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("A: regola non riconosciuta (confClueSomethingNew)");
      expect(r.errors).toContain("B: una ricerca non può riguardare il Pianeta X");
      expect(r.errors).toContain("X1: mancante");
    }
  });

  it("rifiuta fatti iniziali falsi o sul Pianeta X e blocchi incompleti", () => {
    const map = sampleMap();
    map.info.A!["1"]![0] = { "1": 1 }; // il settore 1 contiene proprio un asteroide
    map.info.A!["2"]![0] = { "2": 9 }; // fatto sul Pianeta X
    map.info.A!["3"] = map.info.A!["3"]!.slice(0, 3);
    const r = parseOfficialMap("T3S7", map);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("fatti A.1: il settore 1 contiene proprio asteroid");
      expect(r.errors.some((e) => e.startsWith("fatti A.2: fatto non valido"))).toBe(true);
      expect(r.errors).toContain("fatti A.3: servono 4 fatti");
    }
  });

  it("un'etichetta diversa dalla regola è solo un avviso: vale la regola", () => {
    const map = sampleMap();
    map.conf.X1 = { title: [9, 1], body: { type: "confClue9NotOppositeY", X: 9, Y: 3 } };
    const r = parseOfficialMap("T3S7", map);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual(["X1: l'etichetta dell'app non corrisponde alla regola, si usa quella ricavata dalla regola"]);
  });

  it("rifiuta file con un formato diverso e codici non validi", () => {
    const r = parseOfficialMap("bad", { obj: [], conf: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]).toBe("codice partita non valido: «bad»");
      expect(r.errors.some((e) => e.startsWith("formato:"))).toBe(true);
    }
  });
});
