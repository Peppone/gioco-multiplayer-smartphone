import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, describe, expect, it } from "vitest";
import { ClientEvent, type GameAdminState, type GamePlayerState, type HostAck, type JoinResult, ServerEvent } from "@gioco/shared";

// Test di integrazione con il processo vero: si spegne il server a metà partita (senza chiusura ordinata)
// e lo si riavvia sullo stesso database, come dopo un blackout o un riavvio del PC.
const PORT = 3200 + Math.floor(Math.random() * 500);
const URL = `http://localhost:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), "gioco-restart-"));
const DB_FILE = join(dir, "test.sqlite");
const PASSWORD = "password-di-prova";

const procs: ChildProcess[] = [];
const sockets: Socket[] = [];

type Server = ChildProcess & { log: () => string };

function startServer(): Promise<Server> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: join(__dirname, ".."),
    env: { ...process.env, PORT: String(PORT), DB_FILE, NO_TUNNEL: "1", GIOCO_ROOT: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  procs.push(child);
  let out = "";
  const server = Object.assign(child, { log: () => out });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server non partito:
${out}`)), 30_000);
    child.stdout!.on("data", (chunk) => {
      out += String(chunk);
      if (out.includes("Gioco avviato")) {
        clearTimeout(timer);
        resolve(server);
      }
    });
    child.stderr!.on("data", (chunk) => (out += String(chunk)));
    child.on("exit", (code) => reject(new Error(`server terminato (${code}):
${out}`)));
  });
}

const open = (auth: object) => {
  const s = connect(URL, { auth, transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return s;
};
const emit = <T>(s: Socket, event: string, payload: unknown) => new Promise<T>((r) => s.emit(event, payload, r));
const post = async (path: string, body: unknown, token?: string) => {
  const res = await fetch(`${URL}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) });
  return (await res.json()) as any;
};
const put = async (path: string, body: unknown, token: string) =>
  (await fetch(`${URL}${path}`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) })).json() as Promise<any>;
const waitFor = async (cond: () => boolean, label: string) => {
  for (let i = 0; i < 300; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout: ${label}`);
};

afterAll(() => {
  sockets.forEach((s) => s.disconnect());
  procs.forEach((p) => p.kill("SIGKILL"));
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 500);
});

describe("riavvio del server a metà partita (processo reale)", () => {
  it("dopo lo spegnimento brusco la partita riprende: stato, risposte e punti non vanno persi", async () => {
    const a = await startServer();

    // ---- Allestimento e partita avviata ----
    const { token } = await post("/api/admin/setup", { password: PASSWORD });
    const team1 = await post("/api/admin/teams", { name: "Rossi", color: "#ef4444", emblem: "🔥" }, token);
    const team2 = await post("/api/admin/teams", { name: "Blu", color: "#3b82f6", emblem: "🌊" }, token);
    const ev = await post("/api/admin/events", { name: "Serata prova" }, token);
    await put(`/api/admin/events/${ev.id}/teams`, { teamIds: [team1.id, team2.id] }, token);
    const inst = await post("/api/admin/instances", { typeId: "quiz-multipla", title: "Quiz", config: { questions: [{ text: "Domanda?", options: ["a", "b"], correctIndex: 1, timeSec: 120 }] } }, token);
    const match = await post(`/api/admin/events/${ev.id}/matches`, { name: "Partita riavvio", mode: "classic" }, token);
    await post(`/api/admin/matches/${match.id}/rounds`, { instanceId: inst.id }, token);

    const tokens: string[] = [];
    const phones: Socket[] = [];
    for (const nick of ["Ada", "Bob"]) {
      const s = open({ role: "play" });
      await waitFor(() => s.connected, "connessione telefono");
      const res = await emit<JoinResult>(s, ClientEvent.Create, { nickname: nick, avatar: "🦊", color: "#112233" });
      if (!res.ok) throw new Error("profilo");
      tokens.push(res.token);
      phones.push(s);
      await put(`/api/admin/events/${ev.id}/players/${res.player.id}`, { teamId: nick === "Ada" ? team1.id : team2.id }, token);
    }

    const admin = open({ role: "admin", token });
    await waitFor(() => admin.connected, "connessione regia");
    expect(await emit<HostAck>(admin, ClientEvent.HostCommand, { type: "start", matchId: match.id })).toEqual({ ok: true });
    expect(await emit<HostAck>(admin, ClientEvent.HostCommand, { type: "engine", action: "next" })).toEqual({ ok: true });

    let ada: GamePlayerState | null = null;
    phones[0]!.on(ServerEvent.GamePlayer, (s: GamePlayerState) => (ada = s));
    phones[0]!.emit(ClientEvent.GameInput, { input: { type: "answer", choice: 1 }, clientTime: Date.now() }); // Ada risponde giusto
    await waitFor(() => (ada?.frame?.view as { myChoice?: number } | undefined)?.myChoice === 1, "risposta registrata");

    await new Promise((r) => setTimeout(r, 1_800)); // il salvataggio avviene entro 1 secondo
    sockets.splice(0).forEach((s) => s.disconnect());

    // ---- Spegnimento brusco (come un blackout): nessuna chiusura ordinata ----
    a.kill("SIGKILL");
    await new Promise((r) => a.once("exit", r));

    // ---- Riavvio sullo stesso database ----
    const b = await startServer();
    expect(b.log()).toContain("Partita in corso ripresa");

    // la regia rifà il login (le sessioni non sopravvivono) e trova la partita a metà
    const login = await post("/api/admin/login", { password: PASSWORD });
    const admin2 = open({ role: "admin", token: login.token });
    let adminState: GameAdminState | null = null;
    admin2.on(ServerEvent.GameAdmin, (s: GameAdminState) => (adminState = s));
    await waitFor(() => adminState !== null, "stato regia");
    expect(adminState).toMatchObject({ phase: "round", matchName: "Partita riavvio", roundNumber: 1 });

    // il telefono di Ada rientra con il token e ritrova la sua risposta
    const phone = open({ role: "play" });
    let player: GamePlayerState | null = null;
    phone.on(ServerEvent.GamePlayer, (s: GamePlayerState) => (player = s));
    await waitFor(() => phone.connected, "riconnessione");
    const back = await emit<JoinResult>(phone, ClientEvent.Resume, { token: tokens[0] });
    expect(back.ok).toBe(true);
    await waitFor(() => player !== null, "stato giocatore");
    expect((player!.frame!.view as { myChoice: number | null }).myChoice).toBe(1);

    // e la partita prosegue: la regia rivela e chiude il quiz, i punti vengono registrati
    expect(await emit<HostAck>(admin2, ClientEvent.HostCommand, { type: "plugin", command: { type: "next" } })).toEqual({ ok: true });
    expect(await emit<HostAck>(admin2, ClientEvent.HostCommand, { type: "plugin", command: { type: "next" } })).toEqual({ ok: true });
    await waitFor(() => (adminState as GameAdminState | null)?.phase === "results", "fine del round");
    const ranking = (adminState as unknown as GameAdminState).leaderboards!.players;
    expect(ranking[0]).toMatchObject({ name: "Ada" });
    expect(ranking[0]!.points).toBeGreaterThan(0);
  }, 90_000);
});

describe("password della regia dimenticata", () => {
  it("--reset-admin toglie solo la password: i dati restano e se ne può scegliere una nuova", async () => {
    const { openDb } = await import("./db.js");
    const { AdminAuth } = await import("./admin-auth.js");
    const { PlayerService } = await import("./players.js");
    const file = join(dir, "reset.sqlite");

    const first = openDb(file);
    expect(new AdminAuth(first.db).setup("vecchia-password").ok).toBe(true);
    expect(new PlayerService(first.db).create({ nickname: "Resta", avatar: "🦊", color: "#112233" }).ok).toBe(true);
    first.sqlite.close();

    // Il comando vero, come lo lancia «Reimposta password regia.bat»
    const out = await new Promise<{ code: number | null; text: string }>((resolve) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts", "--reset-admin"], {
        cwd: join(__dirname, ".."),
        env: { ...process.env, DB_FILE: file, NO_TUNNEL: "1", GIOCO_ROOT: dir },
        stdio: ["ignore", "pipe", "pipe"],
      });
      procs.push(child);
      let text = "";
      child.stdout!.on("data", (c) => (text += String(c)));
      child.stderr!.on("data", (c) => (text += String(c)));
      child.on("exit", (code) => resolve({ code, text }));
    });
    expect(out.code).toBe(0);
    expect(out.text).toContain("password della regia è stata rimossa");

    const after = openDb(file);
    const auth = new AdminAuth(after.db);
    expect(auth.isConfigured()).toBe(false);
    expect(auth.setup("nuova-password").ok).toBe(true); // si può sceglierne una nuova
    expect(auth.login("vecchia-password")).toMatchObject({ ok: false });
    expect(new PlayerService(after.db).list().map((p) => p.nickname)).toEqual(["Resta"]); // i profili sono ancora lì
    after.sqlite.close();
  }, 60_000);
});
