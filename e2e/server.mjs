// Avvia un server di prova per i test e2e: client buildato, database vuoto, nessun tunnel, porta dedicata.
import { execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = join(root, "data", "e2e");
const dbFile = join(dbDir, "test.sqlite");

// Database nuovo a ogni esecuzione (mai quello vero in data/gioco.sqlite).
rmSync(dbDir, { recursive: true, force: true });
mkdirSync(dbDir, { recursive: true });

execSync("pnpm --filter @gioco/client build", { cwd: root, stdio: "ignore" });

const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: join(root, "packages", "server"),
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.E2E_PORT ?? "3100", DB_FILE: dbFile, NO_TUNNEL: "1" },
});

const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
