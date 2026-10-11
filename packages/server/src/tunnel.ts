import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TunnelInfo } from "@gioco/shared";

const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/** Estrae l'URL del Quick Tunnel da una riga di output di `cloudflared`. */
export function parseTunnelUrl(line: string): string | null {
  return TUNNEL_URL.exec(line)?.[0] ?? null;
}

/** Cerca `cloudflared` in `bin/` (accanto al progetto), altrimenti nel PATH. */
export function findCloudflared(rootDir: string): string {
  const exe = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
  const local = resolve(rootDir, "bin", exe);
  return existsSync(local) ? local : "cloudflared";
}

/** Il processo con questo PID è davvero `cloudflared`? (Evita di spegnere un altro programma se il PID è stato riusato.) */
export function isCloudflaredProcess(pid: number): boolean {
  try {
    const out =
      process.platform === "win32"
        ? execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true })
        : execFileSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" });
    return /cloudflared/i.test(out);
  } catch {
    return false;
  }
}

export interface TunnelOptions {
  /** File dove si annota il PID di cloudflared: se il server muore di colpo, al riavvio si spegne il tunnel rimasto. */
  pidFile?: string;
  isCloudflared?: (pid: number) => boolean;
  /** Attese (ms) tra un riavvio automatico e l'altro quando cloudflared si ferma da solo; l'ultima si ripete. */
  backoffMs?: number[];
  onSpawn?: () => void;
}

export class TunnelManager {
  private child: ChildProcess | null = null;
  private info: TunnelInfo = { status: "off" };
  private stopped = false;
  private failures = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private port = 0;

  constructor(
    private readonly binary: string,
    private readonly opts: TunnelOptions = {},
  ) {}

  get current(): TunnelInfo {
    return this.info;
  }

  /** Spegne un cloudflared rimasto acceso da una sessione precedente (arresto brusco, finestra chiusa). */
  reapStale(): boolean {
    const file = this.opts.pidFile;
    if (!file || !existsSync(file)) return false;
    let killed = false;
    const pid = Number(readFileSync(file, "utf8").trim());
    if (Number.isInteger(pid) && pid > 0 && (this.opts.isCloudflared ?? isCloudflaredProcess)(pid)) {
      try {
        process.kill(pid);
        killed = true;
      } catch {
        /* già terminato */
      }
    }
    rmSync(file, { force: true });
    return killed;
  }

  start(port: number): void {
    this.port = port;
    this.stopped = false;
    this.reapStale();
    this.spawnTunnel();
  }

  private spawnTunnel(): void {
    this.info = { status: "starting" };
    this.opts.onSpawn?.();
    const child = spawn(this.binary, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${this.port}`], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;
    if (this.opts.pidFile && child.pid) writeFileSync(this.opts.pidFile, String(child.pid));

    const onData = (chunk: Buffer) => {
      const url = parseTunnelUrl(chunk.toString());
      if (url && this.info.status !== "ready") {
        this.info = { status: "ready", url };
        this.failures = 0;
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData); // cloudflared scrive i log su stderr

    child.on("error", (err) => {
      const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
      this.info = { status: "error", error: missing ? "cloudflared non trovato (mettilo in bin/ o nel PATH)" : err.message };
      this.stopped = this.stopped || missing; // se manca il programma è inutile riprovare
    });
    child.on("exit", (code) => {
      this.child = null;
      if (this.opts.pidFile) rmSync(this.opts.pidFile, { force: true });
      if (this.stopped) return;
      if (this.info.status !== "error") this.info = { status: "error", error: `cloudflared terminato (codice ${code})` };
      this.scheduleRestart();
    });
  }

  /** Il tunnel può cadere (rete assente per un po'): si riprova da soli, con attese crescenti. */
  private scheduleRestart(): void {
    const steps = this.opts.backoffMs ?? [3_000, 6_000, 12_000, 30_000];
    const wait = steps[Math.min(this.failures, steps.length - 1)]!;
    this.failures++;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopped) this.spawnTunnel();
    }, wait);
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.child?.kill();
    this.child = null;
    if (this.opts.pidFile) rmSync(this.opts.pidFile, { force: true });
  }
}
