import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { importedSchemes } from "@gioco/minigames";
import { xCandidates } from "@gioco/minigames/src/pianeta-nascosto/system";
import { pianetaConfigSchema, pianetaNascosto as plugin } from "@gioco/minigames/src/pianeta-nascosto/index";
import { SchemeLibrary } from "./pianeta-schemi.js";

/**
 * Prova facoltativa con gli schemi VERI dell'app ufficiale: si attiva solo indicando la cartella (`PIANETA_SCHEMI_APP`, es. la
 * cartella `assets/www/assets/maps` di una copia dell'app, estratta fuori dal progetto). Senza, viene saltata. Gli schemi non
 * stanno mai nel progetto: la prova li importa in una cartella temporanea e la cancella.
 *   PIANETA_SCHEMI_APP=C:\\percorso\\maps pnpm vitest run packages/server/src/pianeta-schemi-reali.test.ts
 */
const folder = process.env.PIANETA_SCHEMI_APP;
/** Gli schemi dell'app dove le regole lasciano più di un settore per il Pianeta X (il robot deve tentare il più probabile). */
const ambiguous: string[] = [];
const dir = folder ? mkdtempSync(join(tmpdir(), "gioco-schemi-reali-")) : "";
afterAll(() => {
  importedSchemes.clear();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!folder)("Il Pianeta Nascosto con gli schemi veri dell'app ufficiale", () => {
  it("l'importatore del server li legge tutti: nessun rifiuto, Base ed Esperto come nell'app", { timeout: 300_000 }, () => {
    const t = Date.now();
    const files = readdirSync(folder!).filter((n) => /^[A-Z0-9]{4}\.json$/i.test(n)).length;
    const result = new SchemeLibrary(dir).importFrom(folder!);
    if ("error" in result) throw new Error(result.error);
    console.log(`schemi: ${files} file, importati ${result.imported}, rifiutati ${result.rejected} (${result.problems.join(" | ")}), ignorati ${result.ignored}, avvisi ${result.warnings}, Base ${result.total.standard}, Esperto ${result.total.expert}, ${((Date.now() - t) / 1000).toFixed(1)} s`);
    expect(result.rejected).toBe(0);
    expect(result.imported).toBe(files);
    expect(result.total.standard + result.total.expert).toBe(files);
  });

  it("ogni schema, con tutte le sue ricerche e conferenze, lascia un solo settore per il Pianeta X (come il nostro generatore)", { timeout: 300_000 }, () => {
    let notUnique = 0;
    const examples: string[] = [];
    let total = 0;
    for (const mode of ["standard", "expert"] as const) {
      for (const code of importedSchemes.codes(mode)) {
        const s = importedSchemes.get(code)!;
        total++;
        const found = xCandidates(s.sky, [...s.research.map((r) => r.clue), ...s.conferences.map((c) => c.clue)]);
        if (found.length !== 1 || found[0] !== s.sky.indexOf("planetX") + 1) {
          notUnique++;
          ambiguous.push(code);
          if (examples.length < 5) examples.push(`${code}:${found.length}`);
        }
      }
    }
    expect(notUnique, "schemi ambigui (l'app ne ha pochi)").toBeLessThan(total / 100);
    console.log(`deducibilità: ${total - notUnique}/${total} schemi con un solo settore per il Pianeta X ${examples.join(" ")}`);
    expect(total).toBeGreaterThan(0);
  });

  it("un campione di schemi veri si gioca fino in fondo con i robot, senza teorie né localizzazioni sbagliate", { timeout: 900_000 }, () => {
    const picks: [string, "standard" | "expert"][] = ambiguous.map((c) => [c, importedSchemes.get(c)!.mode]);
    for (const [mode, n] of [["standard", 40], ["expert", 16]] as const) {
      const codes = importedSchemes.codes(mode);
      for (let i = 0; i < n; i++) picks.push([codes[Math.floor((i * codes.length) / n)]!, mode]);
    }
    const stats = { standard: { days: 0, games: 0, worst: 0 }, expert: { days: 0, games: 0, worst: 0 } };
    for (const [i, [code, mode]] of picks.entries()) {
      const cfg = pianetaConfigSchema.parse({ source: "official", code, bots: 3, turnSeconds: 0, theorySeconds: 0 });
      let s = plugin.init(cfg, { players: [], teams: [], seed: 700 + i }, 0);
      expect(s.schemeCode).toBe(code);
      expect(s.mode).toBe(mode);
      s = plugin.onHostCommand(s, { type: "start" }, 0);
      let now = 0;
      for (let k = 0; k < 20_000 && s.phase !== "done"; k++) {
        now += 1000;
        const t = performance.now();
        s = plugin.onTick(s, now);
        stats[mode].worst = Math.max(stats[mode].worst, performance.now() - t);
        if (["conference", "reveal", "final"].includes(s.phase)) s = plugin.onHostCommand(s, { type: "next" }, now);
      }
      expect(s.phase, code).toBe("done");
      expect(s.publicLog.filter((l) => l.text.includes("sbagliata")), code).toEqual([]);
      // Una localizzazione fallita è ammessa solo dove le regole non bastano a distinguere i settori.
      if (!ambiguous.includes(code)) expect(s.publicLog.filter((l) => l.ok === false), code).toEqual([]);
      expect(s.publicLog.some((l) => l.ok === true), `${code}: qualcuno ha localizzato`).toBe(true);
      stats[mode].games++;
      stats[mode].days += Math.max(...s.observatories.map((o) => o.time));
    }
    for (const m of ["standard", "expert"] as const) console.log(`${m}: ${stats[m].games} partite, ${(stats[m].days / stats[m].games).toFixed(1)} giorni in media, onTick max ${Math.round(stats[m].worst)} ms`);
  });
});
