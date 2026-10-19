import { describe, expect, it } from "vitest";
import { agentiSegreti, normalizeWord } from "@gioco/minigames";
import { AdminService } from "./admin-service.js";
import { openDb } from "./db.js";
import { AGENTI_WORDS_TITLE, seedLibrary } from "./library-seed.js";
import { AGENTI_SEGRETI_WORDS } from "./seed-words.js";

function world() {
  const { db } = openDb(":memory:");
  const admin = new AdminService(db);
  return { db, library: admin.library };
}

describe("contenuto iniziale della libreria", () => {
  it("al primo avvio crea nel database la lista di parole di Agenti Segreti, una volta sola", () => {
    const { db, library } = world();
    const id = seedLibrary(db, library);
    expect(id).not.toBeNull();
    const list = library.listInstances().filter((i) => i.typeId === "word-list");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, title: AGENTI_WORDS_TITLE });
    expect((list[0]!.config as { words: string[] }).words).toEqual(AGENTI_SEGRETI_WORDS);
    // al riavvio non si duplica
    expect(seedLibrary(db, library)).toBeNull();
    expect(library.listInstances().filter((i) => i.typeId === "word-list")).toHaveLength(1);
  });

  it("se la regia la modifica o la elimina, il riavvio non la rimette com'era", () => {
    const { db, library } = world();
    const id = seedLibrary(db, library)!;
    library.updateInstance(id, { title: "Le mie parole", config: { words: ["Uno", "Due"] } });
    expect(seedLibrary(db, library)).toBeNull();
    expect(library.listInstances().find((i) => i.id === id)!.config).toEqual({ words: ["Uno", "Due"] });
    expect(library.deleteInstance(id).ok).toBe(true);
    expect(seedLibrary(db, library)).toBeNull();
    expect(library.listInstances().some((i) => i.typeId === "word-list")).toBe(false);
  });

  it("un'istanza di Agenti Segreti che riferisce la lista parte con quelle parole", () => {
    const { db, library } = world();
    const id = seedLibrary(db, library)!;
    const inst = library.createInstance({ typeId: "agenti-segreti", title: "Agenti", config: { wordList: id, gridSize: "5x5" } });
    expect(inst.ok).toBe(true);
    const lookup = (instanceId: string) => {
      const row = library.getInstance(instanceId);
      return row && { typeId: row.typeId, title: row.title, theme: row.theme as "retro80", config: JSON.parse(row.configJson) as unknown };
    };
    const built = agentiSegreti.buildConfig!(inst.ok ? inst.value.config : null, lookup, { players: [], teams: [] });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.config.words).toEqual(AGENTI_SEGRETI_WORDS);
  });
});

describe("parole d'esempio di Agenti Segreti", () => {
  it("300 parole diverse, corte, e nessuna (da 4 lettere in su) contenuta in un'altra", () => {
    const words = AGENTI_SEGRETI_WORDS.map(normalizeWord);
    expect(words).toHaveLength(300);
    expect(new Set(words).size).toBe(300);
    expect(Math.max(...words.map((w) => w.length))).toBeLessThanOrEqual(10);
    for (const a of words) for (const b of words) if (a !== b && a.length >= 4) expect(b.includes(a), `${a} dentro ${b}`).toBe(false);
  });
});
