import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importedSchemes } from "@gioco/minigames";
import { fakeOfficialMap } from "@gioco/minigames/src/pianeta-nascosto/official-map.fixtures";
import { generateFacts, generateSystem } from "@gioco/minigames/src/pianeta-nascosto/system";
import { AdminAuth } from "./admin-auth.js";
import { AdminService } from "./admin-service.js";
import { buildApp } from "./app.js";
import { openDb } from "./db.js";
import { SchemeLibrary } from "./pianeta-schemi.js";

let root = "";
let source = "";
let library: SchemeLibrary;

/** Scrive in `source` uno schema inventato nel formato dell'app (nessun file dell'app nel progetto). */
function writeScheme(code: string, mode: "standard" | "expert", seed: number, mutate?: (m: Record<string, any>) => void) {
  const system = generateSystem(mode, seed);
  const map = fakeOfficialMap(system, generateFacts(system.sky, mode, seed, 5));
  mutate?.(map);
  writeFileSync(join(source, `${code}.json`), JSON.stringify(map));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gioco-schemi-"));
  source = join(root, "app", "maps");
  mkdirSync(source, { recursive: true });
  library = new SchemeLibrary(join(root, "pianeta-schemi"));
  importedSchemes.clear();
});

afterEach(() => {
  importedSchemes.clear();
  rmSync(root, { recursive: true, force: true });
});

describe("schemi dell'app ufficiale: importazione", () => {
  it("salva gli schemi validi, scarta i rifiutati con il motivo e ignora gli altri file", () => {
    writeScheme("AAA1", "standard", 1);
    writeScheme("EXP2", "expert", 2);
    writeScheme("BAD3", "standard", 3, (m) => {
      m.obj["1"] = 9; // due Pianeti X: viola le regole di posizione
    });
    writeFileSync(join(source, "NONJ.json"), "questo non è json");
    writeFileSync(join(source, "manifest.json"), "{}");
    writeFileSync(join(source, "note.txt"), "ciao");
    const result = library.importFrom(source);
    if ("error" in result) throw new Error(result.error);
    expect(result).toMatchObject({ imported: 2, rejected: 2, ignored: 2, total: { standard: 1, expert: 1 } });
    expect(result.problems.some((p) => p.startsWith("BAD3: "))).toBe(true);
    expect(importedSchemes.get("AAA1")?.mode).toBe("standard");
    expect(importedSchemes.get("EXP2")?.mode).toBe("expert");
    expect(importedSchemes.get("BAD3")).toBeUndefined();
    expect(readdirSync(join(root, "pianeta-schemi")).sort()).toEqual(["AAA1.json", "EXP2.json"]);
  });

  it("gli schemi sopravvivono a un riavvio (si ricaricano dalla cartella) e si possono cancellare", () => {
    writeScheme("AAA1", "standard", 1);
    library.importFrom(source);
    importedSchemes.clear();
    expect(new SchemeLibrary(join(root, "pianeta-schemi")).load()).toEqual({ standard: 1, expert: 0 });
    expect(library.clear()).toEqual({ standard: 0, expert: 0 });
    expect(readdirSync(join(root, "pianeta-schemi"))).toEqual([]);
    expect(importedSchemes.count("standard")).toBe(0);
  });

  it("cartella inesistente o file al posto della cartella: errore chiaro, nulla cambia", () => {
    expect(library.importFrom(join(root, "non-c-e"))).toEqual({ error: "Cartella non trovata o non leggibile." });
    writeFileSync(join(root, "file.txt"), "x");
    expect(library.importFrom(join(root, "file.txt"))).toEqual({ error: "Il percorso non è una cartella." });
    expect(existsSync(join(root, "pianeta-schemi"))).toBe(true);
    expect(library.status()).toEqual({ standard: 0, expert: 0 });
  });

  it("una nuova importazione aggiunge senza perdere i precedenti", () => {
    writeScheme("AAA1", "standard", 1);
    library.importFrom(source);
    rmSync(join(source, "AAA1.json"));
    writeScheme("BBB2", "standard", 2);
    const result = library.importFrom(source);
    if ("error" in result) throw new Error(result.error);
    expect(result.total.standard).toBe(2);
  });
});

describe("schemi dell'app ufficiale: rotte della regia", () => {
  it("richiedono il login; importano, riportano lo stato e cancellano", async () => {
    const { db } = openDb(":memory:");
    const app = buildApp({ port: 3000, lanAddress: null, getTunnel: () => ({ status: "off" }), admin: { auth: new AdminAuth(db), service: new AdminService(db) }, schemes: library });
    try {
      const token = (await app.inject({ method: "POST", url: "/api/admin/setup", payload: { password: "segretissima" } })).json().token;
      const auth = { authorization: `Bearer ${token}` };
      expect((await app.inject({ method: "GET", url: "/api/admin/pianeta-schemi" })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url: "/api/admin/pianeta-schemi/import", payload: { folder: source } })).statusCode).toBe(401);
      writeScheme("AAA1", "standard", 1);
      const imported = await app.inject({ method: "POST", url: "/api/admin/pianeta-schemi/import", headers: auth, payload: { folder: source } });
      expect(imported.statusCode).toBe(200);
      expect(imported.json()).toMatchObject({ imported: 1, total: { standard: 1, expert: 0 } });
      expect((await app.inject({ method: "GET", url: "/api/admin/pianeta-schemi", headers: auth })).json()).toEqual({ standard: 1, expert: 0 });
      const missing = await app.inject({ method: "POST", url: "/api/admin/pianeta-schemi/import", headers: auth, payload: { folder: join(root, "no") } });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().detail).toContain("Cartella non trovata");
      expect((await app.inject({ method: "POST", url: "/api/admin/pianeta-schemi/import", headers: auth, payload: {} })).statusCode).toBe(400);
      expect((await app.inject({ method: "DELETE", url: "/api/admin/pianeta-schemi", headers: auth })).json()).toEqual({ standard: 0, expert: 0 });
    } finally {
      await app.close();
    }
  });
});
