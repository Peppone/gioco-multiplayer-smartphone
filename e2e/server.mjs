// Avvia un server di prova per i test e2e: client buildato, database vuoto, nessun tunnel, porta dedicata.
// Con più worker Playwright ne avvia uno per worker (E2E_INDEX 0, 1, …): ognuno ha porta e database suoi,
// così le partite di worker diversi non si toccano. Il client si compila una volta sola (dal server 0).
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const index = Number(process.env.E2E_INDEX ?? 0);
const run = process.env.E2E_RUN ?? "solo";
const base = join(root, "data", "e2e");
const dbDir = join(base, `server-${index}`);
const dbFile = join(dbDir, "test.sqlite");
/** Segnale «client compilato» di questa esecuzione: gli altri server aspettano che esista. */
const built = join(base, `client-built-${run}`);

// Database nuovo a ogni esecuzione (mai quello vero in data/gioco.sqlite).
rmSync(dbDir, { recursive: true, force: true });
mkdirSync(dbDir, { recursive: true });

if (index === 0) {
  for (const name of readdirSync(base)) if (name.startsWith("client-built-")) rmSync(join(base, name), { force: true });
  execSync("pnpm --filter @gioco/client build", { cwd: root, stdio: "ignore" });
  writeFileSync(built, "");
} else {
  // La compilazione svuota la cartella del client: si parte solo quando è finita.
  while (!existsSync(built)) await new Promise((r) => setTimeout(r, 200));
}

const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: join(root, "packages", "server"),
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.E2E_PORT ?? "3100", DB_FILE: dbFile, NO_TUNNEL: "1" },
});

const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
