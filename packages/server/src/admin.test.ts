import { beforeEach, describe, expect, it } from "vitest";
import type { EventDetail, TeamView } from "@gioco/shared";
import { AdminAuth } from "./admin-auth.js";
import { AdminService } from "./admin-service.js";
import { buildApp } from "./app.js";
import { eq } from "drizzle-orm";
import { openDb, players as playersTable } from "./db.js";
import { PlayerService } from "./players.js";

let now = 0;
let app: ReturnType<typeof buildApp>;
let players: PlayerService;
let database: ReturnType<typeof openDb>["db"];
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
  database = db;
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

  it("la sessione sopravvive al riavvio del server (stesso database) e scade comunque dopo 12 ore", () => {
    const { db } = openDb(":memory:");
    let t = 1_000_000;
    const first = new AdminAuth(db, () => t);
    const setup = first.setup("segretissima");
    if (!setup.ok) throw new Error("setup");

    const restarted = new AdminAuth(db, () => t); // nuova istanza = server riavviato
    expect(restarted.verify(setup.token)).toBe(true);
    expect(restarted.verify("token-inventato")).toBe(false);

    t += 12 * 60 * 60 * 1000 + 1;
    expect(restarted.verify(setup.token)).toBe(false);
  });

  it("«reimposta password» chiude anche le sessioni aperte, e il token non è nel database in chiaro", () => {
    const { db } = openDb(":memory:");
    const auth = new AdminAuth(db);
    const setup = auth.setup("segretissima");
    if (!setup.ok) throw new Error("setup");
    const rows = db.$client.prepare("select key, value from settings").all() as { key: string; value: string }[];
    expect(JSON.stringify(rows)).not.toContain(setup.token);

    auth.reset();
    expect(new AdminAuth(db).verify(setup.token)).toBe(false);
    expect(db.$client.prepare("select count(*) as n from settings").get()).toEqual({ n: 0 });
  });

  it("la password non compare nel database in chiaro", async () => {
    const { db } = openDb(":memory:");
    const auth = new AdminAuth(db);
    auth.setup("segretissima");
    const rows = db.$client.prepare("select value from settings").all() as { value: string }[];
    expect(rows[0]?.value).not.toContain("segretissima");
  });
});

describe("giocatori e PIN per la regia", () => {
  const mk = (nickname: string) => {
    const r = players.create({ nickname, avatar: "🦊", color: "#112233" });
    if (!r.ok) throw new Error("player");
    return r;
  };

  it("la regia legge i PIN dei giocatori, in ordine di nickname", async () => {
    const zeta = mk("Zeta");
    const ada = mk("Ada");
    const list = (await call("GET", "/api/admin/players/details")).json();
    expect(list.map((p: { nickname: string }) => p.nickname)).toEqual(["Ada", "Zeta"]);
    expect(list[0]).toMatchObject({ id: ada.player.id, pin: ada.pin });
    expect(list[1]).toMatchObject({ id: zeta.player.id, pin: zeta.pin });
  });

  it("i PIN non escono senza il login della regia né dalle liste normali", async () => {
    const r = mk("Ada");
    expect((await call("GET", "/api/admin/players/details", undefined, false)).statusCode).toBe(401);
    expect((await call("POST", `/api/admin/players/${r.player.id}/reset-pin`, undefined, false)).statusCode).toBe(401);
    const plain = await call("GET", "/api/admin/players");
    expect(plain.body).not.toContain(r.pin);
    expect(plain.body).not.toContain("pin");
  });

  it("«nuovo PIN»: il vecchio non vale più, il nuovo sì, e il telefono resta collegato", async () => {
    const r = mk("Ada");
    const res = await call("POST", `/api/admin/players/${r.player.id}/reset-pin`);
    expect(res.statusCode).toBe(200);
    const fresh = res.json().pin as string;
    expect(fresh).toMatch(/^\d{4}$/);
    expect((await call("GET", "/api/admin/players/details")).json()[0].pin).toBe(fresh);

    if (fresh !== r.pin) expect(players.recover("Ada", r.pin!)).toMatchObject({ ok: false });
    expect(players.recover("Ada", fresh)).toMatchObject({ ok: true });
    expect((await call("POST", "/api/admin/players/inesistente/reset-pin")).statusCode).toBe(404);
  });

  it("un profilo creato prima della funzione non ha un PIN leggibile, ma se ne può generare uno", async () => {
    const r = mk("Vecchio");
    database.update(playersTable).set({ pin: null }).where(eq(playersTable.id, r.player.id)).run();
    expect((await call("GET", "/api/admin/players/details")).json()[0].pin).toBeNull();
    expect((await call("POST", `/api/admin/players/${r.player.id}/reset-pin`)).json().pin).toMatch(/^\d{4}$/);
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
    const m2 = (await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "Buzzer" })).json();
    const m3 = (await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "Duello" })).json();
    expect([m1.order, m2.order, m3.order]).toEqual([1, 2, 3]);

    await call("DELETE", `/api/admin/matches/${m1.id}`);
    const detail = (await call("GET", `/api/admin/events/${ev.id}`)).json() as EventDetail;
    expect(detail.matches.map((m) => [m.name, m.order])).toEqual([["Buzzer", 1], ["Duello", 2]]);
  });

  it("eliminare la serata elimina partite e assegnazioni", async () => {
    const ev = await newEvent();
    await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "Quiz" });
    expect((await call("DELETE", `/api/admin/events/${ev.id}`)).statusCode).toBe(200);
    expect((await call("GET", `/api/admin/events/${ev.id}`)).statusCode).toBe(404);
  });
});

describe("libreria minigiochi", () => {
  const quiz = {
    questions: [{ text: "Domanda?", options: ["a", "b"], correctIndex: 1 }],
  };
  const mkInstance = async (title = "Quiz", config: unknown = quiz) =>
    call("POST", "/api/admin/instances", { typeId: "quiz-multipla", title, config });

  it("espone i tipi con lo schema JSON per generare il form", async () => {
    const types = (await call("GET", "/api/admin/minigame-types")).json() as {
      id: string;
      configJsonSchema: { properties: Record<string, { title?: string; default?: unknown }> };
    }[];
    const q = types.find((t) => t.id === "quiz-multipla")!;
    expect(q.configJsonSchema.properties.questions?.title).toBe("Domande");
    expect(q.configJsonSchema.properties.defaultTimeSec?.default).toBe(20);
    expect(types.map((t) => t.id)).toContain("buzzer");
  });

  it("crea un quiz applicando i valori predefiniti", async () => {
    const res = await mkInstance();
    expect(res.statusCode).toBe(201);
    expect(res.json().config).toMatchObject({ defaultTimeSec: 20, maxPoints: 1000, minPoints: 300 });
    expect(res.json().theme).toBe("gameshow");
  });

  it("rifiuta configurazioni non valide con un messaggio comprensibile", async () => {
    const badIndex = await mkInstance("X", { questions: [{ text: "D", options: ["a", "b"], correctIndex: 5 }] });
    expect(badIndex.statusCode).toBe(400);
    expect(badIndex.json().detail).toContain("risposta corretta");
    const noQuestions = await mkInstance("X", { questions: [] });
    expect(noQuestions.json().detail).toContain("questions");
    expect((await call("POST", "/api/admin/instances", { typeId: "boh", title: "X", config: {} })).statusCode).toBe(404);
  });

  it("modifica e non elimina un istanza usata in una partita", async () => {
    const inst = (await mkInstance()).json();
    const upd = await call("PUT", `/api/admin/instances/${inst.id}`, { typeId: "quiz-multipla", title: "Nuovo", theme: "retro80", config: quiz });
    expect(upd.json()).toMatchObject({ title: "Nuovo", theme: "retro80" });

    const ev = (await call("POST", "/api/admin/events", { name: "S" })).json();
    const m = (await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "P" })).json();
    await call("POST", `/api/admin/matches/${m.id}/rounds`, { instanceId: inst.id });
    expect((await call("DELETE", `/api/admin/instances/${inst.id}`)).statusCode).toBe(409);
  });

  it("riordina i round e rifiuta elenchi incompleti o a partita avviata", async () => {
    const a = (await mkInstance("A")).json();
    const b = (await mkInstance("B")).json();
    const ev = (await call("POST", "/api/admin/events", { name: "S" })).json();
    const m = (await call("POST", `/api/admin/events/${ev.id}/matches`, { name: "P" })).json();
    const r1 = (await call("POST", `/api/admin/matches/${m.id}/rounds`, { instanceId: a.id })).json()[0];
    const r2 = (await call("POST", `/api/admin/matches/${m.id}/rounds`, { instanceId: b.id })).json()[1];

    const swapped = await call("PUT", `/api/admin/matches/${m.id}/rounds/order`, { roundIds: [r2.id, r1.id] });
    expect(swapped.json().map((r: { title: string }) => r.title)).toEqual(["B", "A"]);

    expect((await call("PUT", `/api/admin/matches/${m.id}/rounds/order`, { roundIds: [r1.id] })).statusCode).toBe(400);
    expect((await call("PUT", `/api/admin/matches/${m.id}/rounds/order`, { roundIds: [r1.id, r1.id] })).statusCode).toBe(400);
  });
});

describe("duello e mazzi", () => {
  type TypeView = { id: string; kind: string; configJsonSchema: { properties?: Record<string, unknown> } };
  const types = async () => (await call("GET", "/api/admin/minigame-types")).json() as TypeView[];

  it("il duello è un minigioco con il suo modulo (senza sfidanti); il mazzo è un contenuto", async () => {
    const list = await types();
    const byId = Object.fromEntries(list.map((t) => [t.id, t]));
    expect(byId["quiz-multipla"]?.kind).toBe("minigame");
    expect(byId["knight-duel"]?.kind).toBe("minigame");
    const duelFields = Object.keys(byId["knight-duel"]!.configJsonSchema.properties!);
    expect(duelFields).toEqual(expect.arrayContaining(["kind", "pool", "hp", "winnerPoints"]));
    expect(duelFields).not.toContain("sideA");
    expect(byId["deck"]?.kind).toBe("content");
    expect(byId["deck"]!.configJsonSchema.properties).toHaveProperty("cards");
  });

  it("si crea un mazzo di carte dalla libreria, validato", async () => {
    const deckType = (await types()).find((t) => t.id === "deck")!;
    void deckType;
    const sample = (await call("GET", "/api/admin/minigame-types")).json().find((t: { id: string }) => t.id === "deck").sampleConfig;
    const ok = await call("POST", "/api/admin/instances", { typeId: "deck", title: "Il mio mazzo", config: sample });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().config.cards).toHaveLength(15);

    const dup = await call("POST", "/api/admin/instances", { typeId: "deck", title: "Doppioni", config: { cards: [sample.cards[0], sample.cards[0], sample.cards[1]] } });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().detail).toContain("diversi");

  });

  it("l'istanza del duello si crea dalla libreria, validata, con i valori predefiniti", async () => {
    const cfg = { pool: ["i1"], hp: 25 };
    const saved = await call("POST", "/api/admin/instances", { typeId: "knight-duel", title: "Duello", config: cfg });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().config).toMatchObject({ kind: "teams", hp: 25, maxBattles: 6 });

    expect((await call("POST", "/api/admin/instances", { typeId: "knight-duel", title: "X", config: { ...cfg, hp: 1 } })).statusCode).toBe(400);
    expect((await call("POST", "/api/admin/instances", { typeId: "knight-duel", title: "X", config: { pool: [] } })).statusCode).toBe(400);
  });
});
