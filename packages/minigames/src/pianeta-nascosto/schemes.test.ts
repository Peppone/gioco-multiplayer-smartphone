import { afterEach, describe, expect, it } from "vitest";
import { clueText } from "./clues.js";
import { fakeOfficialMap } from "./official-map.fixtures.js";
import { parseOfficialMap } from "./official-map.js";
import { importedSchemes } from "./schemes.js";
import { generateFacts, generateSystem, xCandidates } from "./system.js";
import { autoPlay, ctxFor, plugin, start } from "./test-helpers.js";

/** Uno schema inventato nel formato dell'app, riletto dal lettore (nessun file dell'app nel progetto). */
function scheme(code: string, mode: "standard" | "expert", seed: number) {
  const system = generateSystem(mode, seed);
  const parsed = parseOfficialMap(code, fakeOfficialMap(system, generateFacts(system.sky, mode, seed, 5)));
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return { system, imported: parsed.system };
}

afterEach(() => importedSchemes.clear());

describe("pianeta-nascosto: schemi dell'app ufficiale", () => {
  it("lo schema fatto dal generatore si rilegge identico (ricerche, conferenze, fatti)", () => {
    for (const mode of ["standard", "expert"] as const) {
      const { system, imported } = scheme("T1ST", mode, 3);
      expect(imported.sky).toEqual(system.sky);
      expect(imported.research.map((r) => clueText(r.clue))).toEqual(system.topics.map((t) => clueText(t.clue)));
      expect(imported.conferences.map((c) => clueText(c.clue))).toEqual(system.conferences.map((c) => clueText(c.clue)));
      expect(imported.facts).toHaveLength(5);
    }
  });

  it("con source «official» il round usa il sistema, le regole e i fatti dello schema", () => {
    const a = scheme("AAA1", "standard", 11);
    const b = scheme("BBB2", "standard", 12);
    importedSchemes.replace([a.imported, b.imported]);
    const s = start({ source: "official", code: "bbb2" }); // il codice si normalizza in maiuscolo
    expect(s.schemeCode).toBe("BBB2");
    expect(s.sky).toEqual(b.imported.sky);
    expect(s.topics.map((t) => t.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(s.conferences).toHaveLength(1);
    expect(s.observatories.every((o) => o.facts.length === 8)).toBe(true);
    // senza codice: uno tra gli importati, sempre lo stesso per lo stesso seme
    const r1 = start({ source: "official" }, 5);
    const r2 = start({ source: "official" }, 5);
    expect(["AAA1", "BBB2"]).toContain(r1.schemeCode);
    expect(r2.schemeCode).toBe(r1.schemeCode);
    expect(start({ source: "generated" }).schemeCode).toBeNull();
  });

  it("la modalità segue quella dello schema; il livello di una squadra si cambia anche con gli schemi", () => {
    importedSchemes.replace([scheme("EXP1", "expert", 21).imported]);
    let s = start({ source: "official", code: "EXP1", mode: "standard" });
    expect(s.mode).toBe("expert");
    expect(s.sky).toHaveLength(18);
    expect(s.cfg.mode).toBe("expert");
    const id = s.observatories[0]!.id;
    s = plugin.onHostCommand(s, plugin.commandSchema.parse({ type: "set-difficulty", teamId: id, difficulty: "youth" }), 1);
    expect(s.observatories.find((o) => o.id === id)!.facts).toHaveLength(12);
  });

  it("buildConfig: senza schemi importati o con un codice sconosciuto l'avvio è rifiutato", () => {
    const roster = { players: ctxFor(1).players, teams: ctxFor(1).teams };
    const build = (raw: object) => plugin.buildConfig!(raw, () => undefined, roster);
    const none = build({ source: "official" });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error).toContain("Nessuno schema importato");
    importedSchemes.replace([scheme("AAA1", "standard", 11).imported]);
    expect(build({ source: "official" }).ok).toBe(true);
    expect(build({ source: "official", code: "ZZZ9" }).ok).toBe(false);
    expect(build({ source: "official", mode: "expert" }).ok).toBe(false); // nessuno schema Esperto
    expect(build({ source: "official", code: "AAA1" }).ok).toBe(true);
    expect(build({ source: "official", code: "toolong" }).ok).toBe(false);
    expect(build({ source: "generated" }).ok).toBe(true);
  });

  it("una partita intera con uno schema importato si conclude; il codice è solo della regia sbloccata", () => {
    importedSchemes.replace([scheme("AAA1", "standard", 11).imported]);
    const s0 = start({ source: "official", bots: 1, turnSeconds: 0, theorySeconds: 0 });
    expect(JSON.stringify(plugin.hostView(s0).info)).not.toContain("AAA1");
    expect(JSON.stringify(plugin.screenView(s0))).not.toContain("AAA1");
    expect(JSON.stringify(plugin.viewFor(s0, "a1", "ta"))).not.toContain("AAA1");
    const opened = plugin.onHostCommand(s0, plugin.commandSchema.parse({ type: "unlock-solution" }), 1);
    expect(JSON.stringify(plugin.hostView(opened).info)).toContain("AAA1");
    const { s } = autoPlay(s0);
    expect(s.phase).toBe("done");
    expect(s.publicLog.filter((l) => l.ok === false || l.text.includes("sbagliata"))).toEqual([]);
  });

  it("lo schema riletto resta deducibile con le sue regole", () => {
    const { system, imported } = scheme("AAA1", "standard", 11);
    const clues = [...imported.research.map((r) => r.clue), ...imported.conferences.map((c) => c.clue)];
    expect(xCandidates(imported.sky, clues)).toEqual([system.sky.indexOf("planetX") + 1]);
  });
});
