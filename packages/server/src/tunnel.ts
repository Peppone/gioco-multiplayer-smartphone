import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

export class TunnelManager {
  private child: ChildProcess | null = null;
  private info: TunnelInfo = { status: "off" };

  constructor(private readonly binary: string) {}

  get current(): TunnelInfo {
    return this.info;
  }

  start(port: number): void {
    this.info = { status: "starting" };
    const child = spawn(this.binary, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;

    const onData = (chunk: Buffer) => {
      const url = parseTunnelUrl(chunk.toString());
      if (url && this.info.status !== "ready") this.info = { status: "ready", url };
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData); // cloudflared scrive i log su stderr

    child.on("error", (err) => {
      const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
      this.info = {
        status: "error",
        error: missing ? "cloudflared non trovato (mettilo in bin/ o nel PATH)" : err.message,
      };
    });
    child.on("exit", (code) => {
      if (this.info.status !== "error") {
        this.info = { status: "error", error: `cloudflared terminato (codice ${code})` };
      }
      this.child = null;
    });
  }

  stop(): void {
    this.child?.kill();
    this.child = null;
  }
}
