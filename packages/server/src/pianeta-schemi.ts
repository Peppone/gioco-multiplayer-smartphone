import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminError } from "@gioco/shared";
import { importedSchemes, officialCodeFromFileName, parseOfficialMap } from "@gioco/minigames";
import type { AdminAuth } from "./admin-auth.js";

/**
 * Schemi dell'app ufficiale di *The Search for Planet X* per «Il Pianeta Nascosto» (piano, §3.10 bis). Non stanno nel progetto né nel
 * pacchetto: la regia indica la cartella della propria copia dell'app (di solito `assets/www/assets/maps`) e qui si salvano,
 * accanto al database (`<data>/pianeta-schemi`), solo i file che superano i controlli. Ogni avvio li ricarica.
 */
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 20_000;

export interface ImportSummary {
  /** Schemi letti e salvati in questa importazione. */
  imported: number;
  /** File che non sono schemi (nome diverso da un codice di 4 caratteri). */
  ignored: number;
  /** Schemi rifiutati (formato diverso, regola falsa…), con il motivo dei primi. */
  rejected: number;
  problems: string[];
  /** Avvisi non bloccanti (es. etichetta dell'app diversa dalla regola). */
  warnings: number;
  total: SchemeStatus;
}

export interface SchemeStatus {
  standard: number;
  expert: number;
}

const importInputSchema = z.object({ folder: z.string().trim().min(1).max(500) });

export class SchemeLibrary {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  status(): SchemeStatus {
    return { standard: importedSchemes.count("standard"), expert: importedSchemes.count("expert") };
  }

  /** Rilegge gli schemi salvati (all'avvio e dopo ogni importazione); un file rovinato si salta. */
  load(): SchemeStatus {
    const list = [];
    for (const name of readdirSync(this.dir)) {
      const code = officialCodeFromFileName(name);
      if (!code) continue;
      try {
        const parsed = parseOfficialMap(code, JSON.parse(readFileSync(join(this.dir, name), "utf8")));
        if (parsed.ok) list.push(parsed.system);
      } catch {
        /* file illeggibile: lo schema non c'è */
      }
    }
    importedSchemes.replace(list);
    return this.status();
  }

  /** Importa dalla cartella indicata gli schemi validi; gli altri si contano e si descrivono. */
  importFrom(folder: string): ImportSummary | { error: string } {
    const source = resolve(folder);
    let names: string[];
    try {
      if (!statSync(source).isDirectory()) return { error: "Il percorso non è una cartella." };
      names = readdirSync(source);
    } catch {
      return { error: "Cartella non trovata o non leggibile." };
    }
    if (names.length > MAX_FILES) return { error: `Troppi file nella cartella (più di ${MAX_FILES}).` };
    const summary: ImportSummary = { imported: 0, ignored: 0, rejected: 0, problems: [], warnings: 0, total: this.status() };
    for (const name of names) {
      const code = officialCodeFromFileName(name);
      if (!code) {
        summary.ignored++;
        continue;
      }
      const file = join(source, name);
      const reject = (why: string) => {
        summary.rejected++;
        if (summary.problems.length < 5) summary.problems.push(`${code}: ${why}`);
      };
      try {
        if (statSync(file).size > MAX_FILE_BYTES) {
          reject("file troppo grande");
          continue;
        }
        const text = readFileSync(file, "utf8");
        const parsed = parseOfficialMap(code, JSON.parse(text));
        if (!parsed.ok) {
          reject(parsed.errors[0] ?? "schema non valido");
          continue;
        }
        writeFileSync(join(this.dir, `${code}.json`), text);
        summary.imported++;
        summary.warnings += parsed.warnings.length;
      } catch {
        reject("file non leggibile o non JSON");
      }
    }
    summary.total = this.load();
    return summary;
  }

  /** Cancella tutti gli schemi importati. */
  clear(): SchemeStatus {
    for (const name of readdirSync(this.dir)) if (officialCodeFromFileName(name)) rmSync(join(this.dir, name), { force: true });
    return this.load();
  }
}

export function registerSchemeRoutes(app: FastifyInstance, auth: AdminAuth, library: SchemeLibrary): void {
  void app.register(async (api) => {
    api.addHook("onRequest", async (req, reply) => {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (!auth.verify(token)) return reply.code(401).send({ error: "unauthorized" satisfies AdminError });
    });
    api.get("/api/admin/pianeta-schemi", async () => library.status());
    api.post("/api/admin/pianeta-schemi/import", async (req, reply) => {
      const body = importInputSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid" satisfies AdminError, detail: "Indica la cartella degli schemi." });
      const result = library.importFrom(body.data.folder);
      if ("error" in result) return reply.code(400).send({ error: "invalid" satisfies AdminError, detail: result.error });
      return result;
    });
    api.delete("/api/admin/pianeta-schemi", async () => library.clear());
  });
}
