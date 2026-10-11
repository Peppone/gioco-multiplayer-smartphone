import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface TestServer {
  url: string;
  port: number;
  process: ChildProcess;
  log: () => string;
  /** Uso di memoria del processo del server (MB), letto dal sistema operativo. */
  stop: () => void;
}

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/server");

/**
 * Avvia un server di prova isolato: database in una cartella temporanea, nessun tunnel, porta casuale.
 * Non tocca mai il database vero né un server già in esecuzione.
 */
export async function startTestServer(): Promise<TestServer> {
  const port = 3600 + Math.floor(Math.random() * 300);
  const dir = mkdtempSync(join(tmpdir(), "gioco-stress-"));
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(port), DB_FILE: join(dir, "stress.sqlite"), NO_TUNNEL: "1", GIOCO_ROOT: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stderr!.on("data", (c) => (out += String(c)));
  await new Promise<void>((resolveStart, reject) => {
    const timer = setTimeout(() => reject(new Error(`server di prova non partito:\n${out}`)), 30_000);
    child.stdout!.on("data", (c) => {
      out += String(c);
      if (out.includes("Gioco avviato")) (clearTimeout(timer), resolveStart());
    });
    child.on("exit", (code) => reject(new Error(`server di prova terminato (${code}):\n${out}`)));
  });
  return {
    url: `http://localhost:${port}`,
    port,
    process: child,
    log: () => out,
    stop: () => {
      child.kill("SIGKILL");
      setTimeout(() => rmSync(dir, { recursive: true, force: true }), 500);
    },
  };
}
