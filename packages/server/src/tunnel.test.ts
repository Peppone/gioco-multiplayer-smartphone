import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TunnelManager, parseTunnelUrl } from "./tunnel.js";

describe("parseTunnelUrl", () => {
  it("estrae l'URL dalla riga di log di cloudflared", () => {
    const line = "2026-10-11T10:00:00Z INF |  https://random-words-here.trycloudflare.com  |";
    expect(parseTunnelUrl(line)).toBe("https://random-words-here.trycloudflare.com");
  });

  it("ignora righe senza URL", () => {
    expect(parseTunnelUrl("INF Registered tunnel connection")).toBeNull();
    expect(parseTunnelUrl("https://api.trycloudflare.com/tunnel")).toBe("https://api.trycloudflare.com");
  });
});

const dirs: string[] = [];
const procs: ChildProcess[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "gioco-tunnel-"));
  dirs.push(d);
  return d;
};
const sleeper = () => {
  const p = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  procs.push(p);
  return p;
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  procs.splice(0).forEach((p) => p.kill("SIGKILL"));
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

describe("tunnel rimasto acceso da una sessione precedente", () => {
  it("al riavvio spegne il cloudflared annotato e cancella il file", async () => {
    const pidFile = join(tmp(), "cloudflared.pid");
    const orphan = sleeper();
    writeFileSync(pidFile, String(orphan.pid));
    const tm = new TunnelManager("irrilevante", { pidFile, isCloudflared: () => true });
    expect(tm.reapStale()).toBe(true);
    await wait(300);
    expect(alive(orphan.pid!)).toBe(false);
    expect(existsSync(pidFile)).toBe(false);
  });

  it("non spegne un processo che non è cloudflared (PID riusato) e ripulisce comunque il file", async () => {
    const pidFile = join(tmp(), "cloudflared.pid");
    const other = sleeper();
    writeFileSync(pidFile, String(other.pid));
    const tm = new TunnelManager("irrilevante", { pidFile, isCloudflared: () => false });
    expect(tm.reapStale()).toBe(false);
    await wait(200);
    expect(alive(other.pid!)).toBe(true);
    expect(existsSync(pidFile)).toBe(false);
  });

  it("file assente, vuoto o con un PID già morto: nessun errore", () => {
    const dir = tmp();
    const tm = new TunnelManager("x", { pidFile: join(dir, "nope.pid"), isCloudflared: () => true });
    expect(tm.reapStale()).toBe(false);
    writeFileSync(join(dir, "vuoto.pid"), "");
    expect(new TunnelManager("x", { pidFile: join(dir, "vuoto.pid"), isCloudflared: () => true }).reapStale()).toBe(false);
    writeFileSync(join(dir, "morto.pid"), "99999999");
    expect(new TunnelManager("x", { pidFile: join(dir, "morto.pid"), isCloudflared: () => true }).reapStale()).toBe(false);
  });
});

describe("riavvio automatico del tunnel", () => {
  it("se cloudflared si ferma da solo lo riavvia con attese crescenti, finché non si spegne il server", async () => {
    let spawned = 0;
    // `node tunnel ...` termina subito con errore: simula un cloudflared che cade di continuo.
    const tm = new TunnelManager(process.execPath, { backoffMs: [20, 40], onSpawn: () => spawned++ });
    tm.start(3000);
    await wait(700);
    expect(spawned).toBeGreaterThanOrEqual(3);
    expect(tm.current.status).toBe("error");
    tm.stop();
    const after = spawned;
    await wait(300);
    expect(spawned).toBe(after); // dopo lo stop non riparte più
  });

  it("se il programma manca non insiste", async () => {
    let spawned = 0;
    const tm = new TunnelManager("programma-che-non-esiste-xyz", { backoffMs: [10], onSpawn: () => spawned++ });
    tm.start(3000);
    await wait(300);
    expect(spawned).toBe(1);
    expect(tm.current).toMatchObject({ status: "error", error: expect.stringContaining("non trovato") });
    tm.stop();
  });
});
