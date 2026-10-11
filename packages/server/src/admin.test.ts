import { beforeEach, describe, expect, it } from "vitest";
import type { EventDetail, TeamView } from "@gioco/shared";
import { AdminAuth } from "./admin-auth.js";
import { AdminService } from "./admin-service.js";
import { buildApp } from "./app.js";
import { openDb } from "./db.js";
import { PlayerService } from "./players.js";

let now = 0;
let app: ReturnType<typeof buildApp>;
let players: PlayerService;
let token = "";

const call = (method: string, url: string, body?: unknown, auth = true) =>
  app.inject({
    method: method as "GET",
    url,
    payload: body as object | undefined,
    headers: auth && token ? { authorization: `Bearer ${token}` } : {},
  });

beforeEach(async () => {
  now = 1_000;
  const { db } = openDb(":memory:");
  players = new PlayerService(db, () => now);
  app = buildApp({
    port: 3000,
    lanAddress: null,
    getTunnel: () => ({ status: "off" }),
    admin: { auth: new AdminAuth(db, () => now), service: new AdminService(db, () => now) },
  });
  const res = await call("POST", "/api/admin/setup", { password: "segretissima" }, false);
  token = res.json().token;
});

const newTeam = async (name: string, color = "#ff0000"): Promise<TeamView> =>
  (await call("POST", "/api/admin/teams", { name, color, emblem: "🔥" })).json();

describe("autenticazione admin", () => {
  it("la prima configurazione è consentita una volta sola", async () => {
    expect((await call("GET", "/api/admin/status", undefined, false)).json()).toEqual({ configured: true });
    const again = await call("POST", "/api/admin/setup", { password: "altrapassword" }, false);
    expect(again.statusCode).toBe(409);
  });

  it("rifiuta password corte e richieste senza token", async () => {
    expect((await call("POST", "/api/admin/login", { password: "x" }, false)).statusCode).toBe(400);
    expect((await call("GET", "/api/admin/teams", undefined, false)).statusCode).toBe(401);
    token = "falso";
    expect((await call("GET", "/api/admin/teams")).statusCode).toBe(401);
  });

  it("login corretto o errato, con blocco dopo 5 errori", async () => {
    expect((await call("POST", "/api/admin/login", { password: "segretissima" }, false)).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) {
      expect((await call("POST", "/api/admin/login", { password: "sbagliata1" }, false)).statusCode).toBe(401);
    }
    expect((await call("POST", "/api/admin/login", { password: "segretissima" }, false)).statusCode).toBe(429);
    now += 61_000;
    expect((await call("POST", "/api/admin/login", { password: "segretissima" }, false)).statusCode).toBe(200);
  });

  it("la sessione scade dopo 12 ore", async () => {
    now += 12 * 60 * 60 * 1000 + 1;
    expect((await call("GET", "/api/admin/teams")).statusCode).toBe(401);
  });

  it("la password non compare nel database in chiaro", async () => {
    const { db } = openDb(":memory:");
    const auth = new AdminAuth(db);
    auth.setup("segretissima");
    const rows = db.$client.prepare("select value from settings").all() as { value: string }[];
    expect(rows[0]?.value).not.toContain("segretissima");
  });
});

describe("squadre", () => {
  it("CRUD con nomi unici (senza distinguere le maiuscole)", async () => {
    const rossi = await newTeam("Rossi");
    expect((await call("POST", "/api/admin/teams", { name: "ROSSI", color: "#00ff00", emblem: "x" })).statusCode).toBe(409);
    const upd = await call("PUT", `/api/admin/teams/${rossi.id}`, { name: "Rossi 2", color: "#00ff00", emblem: "x" });
    expect(upd.json().name).toBe("Rossi 2");
    expect((await call("DELETE", `/api/admin/teams/${rossi.id}`)).statusCode).toBe(200);
    expect((await call("GET", "/api/admin/teams")).json()).toEqual([]);
    expect((await call("DELETE", `/api/admin/teams/${rossi.id}`)).statusCode).toBe(404);
  });

  it("rifiuta colori non validi", async () => {
    const res = await call("POST", "/api/admin/teams", { name: "A", color: "rosso", emblem: "x" });
    expect(res.statusCode).toBe(400);
  });
});

describe("serate, team e giocatori", () => {
  const newEvent = async () => (await call("POST", "/api/admin/events", { name: "Venerdì" })).json();
  const mkPlayer = (nickname: string) => {
    const r = players.create({ nickname, avatar: "🦊", color: "#112233" });
    if (!r.ok) throw new Error("player");
    return r.player.id;
  };

  it("crea la serata in bozza e la cambia di stato", async () => {
    const ev = await newEvent();
    expect(ev.status).toBe("draft");
    const patched = await call("PATCH", `/api/admin/events/${ev.id}`, { status: "live" });
    expect(patched.json().status).toBe("live");
    expect((await call("PATCH", `/api/admin/events/${ev.id}`, { status: "boh" })).statusCode).toBe(400);
  });

  it("assegna i giocatori solo a team presenti nella serata", async () => {
    const ev = await newEvent();
    const a = await newTeam("A");
    const b = await newTeam("B");
    const p = mkPlayer("Gina");

    await call("PUT", `/api/admin/events/${ev.id}/teams`, { teamIds: [a.id] });
    const ok = await call("PUT", `/api/admin/events/${ev.id}/players/${p}`, { teamId: a.id });
    expect((ok.json() as EventDetail).players).toEqual([{ playerId: p, teamId: a.id }]);

    const bad = await call("PUT", `/api/admin/events/${ev.id}/players/${p}`, { teamId: b.id });
    expect(bad.statusCode).toBe(409);
  });

  it("togliere un team dalla serata lascia i suoi giocatori senza team", async () => {
    const ev = await newEvent();
    const a = await newTeam("A");
    const p = mkPlayer("Gina");
    await call("PUT", `/api/admin/events/${ev.id}/teams`, { teamIds: [a.id] });
    await call("PUT", `/api/admin/events/${ev.id}/players/${p}`, { teamId: a.id });
    const res = await call("PUT", `/api/admin/events/${ev.id}/teams`, { teamIds: [] });
    expect((res.json() as EventDetail).players).toEqual([{ playerId: p, teamId: null }]);
  });

  it("eliminare un team lo toglie dalle serate", async () => {
    const ev = await newEvent();
    const a = await newTeam("A");
    const p = mkPlayer("Gina");
    await call("PUT", `/api/admin/events/${ev.id}/teams`, { teamIds: [a.id] });
    await call("PUT", `/api/admin/events/${ev.id}/players/${p}`, { teamId: a.id });
    await call("DELETE", `/api/admin/teams/${a.id}`);
    const detail = (await call("GET", `/api/admin/events/${ev.id}`)).json() as EventDetail;
    expect(detail.teamIds).toEqual([]);
    expect(detail.players[0]?.teamId).toBeNull();
  });

  it("team o giocatori inesistenti danno 404", async () => {
    const ev = await newEvent();
    expect((await call("PUT", `/api/admin/events/${ev.id}/teams`, { teamIds: ["nope"] })).statusCode).toBe(404);
    expect((await call("PUT", `/api/admin/events/${ev.id}/players/nope`, { teamId: null })).statusCode).toBe(404);
    expect((await call("GET", "/api/admin/events/nope")).statusCode).toBe(404);
  });

  it("le partite sono numerate e si rinumerano dopo una cancellazione", async () => {
    const ev = await newEvent();
    const m1 = (await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "Quiz" })).json();
    const m2 = (await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "Buzzer", mode: "classic" })).json();
    const m3 = (await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "Duello", mode: "knight-duel" })).json();
    expect([m1.order, m2.order, m3.order]).toEqual([1, 2, 3]);

    await call("DELETE", `/api/admin/matches/${m1.id}`);
    const detail = (await call("GET", `/api/admin/events/${ev.id}`)).json() as EventDetail;
    expect(detail.matches.map((m) => [m.name, m.order])).toEqual([["Buzzer", 1], ["Duello", 2]]);
    expect(detail.matches[1]?.mode).toBe("knight-duel");
  });

  it("eliminare la serata elimina partite e assegnazioni", async () => {
    const ev = await newEvent();
    await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "Quiz" });
    expect((await call("DELETE", `/api/admin/events/${ev.id}`)).statusCode).toBe(200);
    expect((await call("GET", `/api/admin/events/${ev.id}`)).statusCode).toBe(404);
  });
});
