import { type APIRequestContext, type Browser, type BrowserContext, type Page, devices, expect, test as base } from "@playwright/test";

export const ADMIN_PASSWORD = "e2e-password-123";
const ADMIN_TOKEN_KEY = "gioco.admin.token";

/** Token admin: imposta la password al primo uso, poi fa login (il database è lo stesso per tutta l'esecuzione). */
export async function adminToken(request: APIRequestContext): Promise<string> {
  const status = await (await request.get("/api/admin/status")).json();
  const res = await request.post(status.configured ? "/api/admin/login" : "/api/admin/setup", {
    data: { password: ADMIN_PASSWORD },
  });
  expect(res.ok(), "login admin").toBe(true);
  return (await res.json()).token as string;
}

/** Client REST della regia già autenticato. */
export function adminApi(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const call = async <T = unknown>(method: "get" | "post" | "put" | "delete" | "patch", path: string, data?: unknown): Promise<T> => {
    const res = await request[method](`/api/admin${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} → ${res.status()}`).toBe(true);
    return (await res.json()) as T;
  };
  return { call };
}

let counter = 0;
/** Nome univoco per giocatori, squadre, serate (il database è condiviso tra i test). */
export const unique = (base: string) => `${base}${Date.now().toString(36).slice(-4)}${counter++}`;

/**
 * Registra ogni frame WebSocket ricevuto dalla pagina: serve a dimostrare che certi dati
 * (risposta corretta, risposta segreta) non transitano mai verso schermo e telefoni.
 * Va collegato prima che la pagina si connetta.
 */
export function captureSocketTraffic(page: Page): Traffic {
  const frames: string[] = [];
  const sent: { at: number; payload: string }[] = [];
  const text = (p: string | Buffer) => (typeof p === "string" ? p : p.toString("utf8"));
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => frames.push(text(f.payload)));
    ws.on("framesent", (f) => sent.push({ at: Date.now(), payload: text(f.payload) }));
  });
  return { text: () => frames.join("\n"), sent: () => [...sent] };
}

export interface Traffic {
  /** Frame ricevuti dalla pagina, uno per riga. */
  text: () => string;
  /** Frame inviati dalla pagina, con l'istante di invio: per controllare quanti input parte e quanto spesso. */
  sent: () => { at: number; payload: string }[];
}

export interface Client {
  context: BrowserContext;
  page: Page;
  traffic: Traffic;
}

async function open(browser: Browser, options: Parameters<Browser["newContext"]>[0], path: string, init?: (c: BrowserContext) => Promise<void>): Promise<Client> {
  const context = await browser.newContext(options);
  await init?.(context);
  const page = await context.newPage();
  const traffic = captureSocketTraffic(page);
  await page.goto(path);
  return { context, page, traffic };
}

/** Telefono emulato (Pixel 7: viewport, touch e user agent mobile) con il profilo appena creato. */
export async function joinPlayer(browser: Browser, nickname: string): Promise<Client> {
  const client = await open(browser, { ...devices["Pixel 7"] }, "/play");
  await client.page.getByPlaceholder("Nome").fill(nickname);
  await client.page.getByRole("button", { name: "Entra" }).click();
  await expect(client.page.getByRole("heading", { name: nickname })).toBeVisible();
  return client;
}

/** Pagina della regia già autenticata (inietta il token come farebbe un login). */
export async function openAdmin(browser: Browser, token: string): Promise<Client> {
  const client = await open(browser, { viewport: { width: 1200, height: 900 } }, "/admin", (c) =>
    c.addInitScript(([key, value]) => localStorage.setItem(key!, value!), [ADMIN_TOKEN_KEY, token]),
  );
  client.page.on("dialog", (d) => void d.accept()); // i pulsanti pericolosi chiedono conferma con confirm()
  return client;
}

/** Schermo condiviso (TV): viewport 1080p. */
export function openScreen(browser: Browser): Promise<Client> {
  return open(browser, { viewport: { width: 1920, height: 1080 } }, "/screen");
}

export interface GameSetup {
  screen: Client;
  admin: Client;
  /** Primo giocatore della squadra Rossi e primo della squadra Blu (le partite classiche ne hanno uno per squadra). */
  a: Client;
  b: Client;
  nickA: string;
  nickB: string;
  /** Tutti i telefoni di ciascuna squadra (nei duelli sono più di uno). */
  reds: Client[];
  blues: Client[];
  teams: { red: { id: string; name: string }; blue: { id: string; name: string } };
  /** Termina la partita (se serve) e torna alla lobby: lascia il server pulito per gli altri test. */
  finish: () => Promise<void>;
}

export interface GameOptions {
  /** Giocatori per squadra (default 1). */
  playersPerTeam?: number;
  /** Se presente la partita ha come unico round un duello: minigiochi del pool e impostazioni (il pool si compila da solo). */
  duel?: { pool: { typeId: string; title: string; theme?: string; config: unknown }[]; config?: Record<string, unknown> };
}

/**
 * Allestisce una partita pronta: 2 squadre con i giocatori (Ada, Bob… uno o più per squadra), i round indicati
 * (o la configurazione del duello), schermo + regia + telefoni aperti, partita avviata dal pannello Live (fase «pronta»).
 */
export async function createGame(
  browser: Browser,
  request: APIRequestContext,
  rounds: { typeId: string; title: string; theme?: string; config: unknown }[],
  options: GameOptions = {},
): Promise<GameSetup> {
  const token = await adminToken(request);
  const api = adminApi(request, token);
  const perTeam = options.playersPerTeam ?? 1;

  const redName = unique("Rossi");
  const blueName = unique("Blu");
  const t1 = await api.call<{ id: string }>("post", "/teams", { name: redName, color: "#ef4444", emblem: "🔥" });
  const t2 = await api.call<{ id: string }>("post", "/teams", { name: blueName, color: "#3b82f6", emblem: "🌊" });
  const eventName = unique("Serata");
  const event = await api.call<{ id: string }>("post", "/events", { name: eventName });
  await api.call("put", `/events/${event.id}/teams`, { teamIds: [t1.id, t2.id] });
  const matchName = unique("Partita");
  const match = await api.call<{ id: string }>("post", `/events/${event.id}/matches`, { name: matchName });

  if (options.duel) {
    // Il duello è un'istanza della libreria aggiunta come round; gli sfidanti sono le due squadre della serata.
    const pool: string[] = [];
    for (const inst of options.duel.pool) pool.push((await api.call<{ id: string }>("post", "/instances", inst)).id);
    const duel = await api.call<{ id: string }>("post", "/instances", { typeId: "knight-duel", title: unique("Duello"), config: { pool, ...options.duel.config } });
    await api.call("post", `/matches/${match.id}/rounds`, { instanceId: duel.id });
  } else {
    for (const r of rounds) {
      const inst = await api.call<{ id: string }>("post", "/instances", r);
      await api.call("post", `/matches/${match.id}/rounds`, { instanceId: inst.id });
    }
  }

  const screen = await openScreen(browser);
  const reds: Client[] = [];
  const blues: Client[] = [];
  const nicks: { nick: string; team: string }[] = [];
  for (let i = 0; i < perTeam; i++) {
    const rn = unique(i === 0 ? "Ada" : "Rosa");
    const bn = unique(i === 0 ? "Bob" : "Bea");
    reds.push(await joinPlayer(browser, rn));
    blues.push(await joinPlayer(browser, bn));
    nicks.push({ nick: rn, team: t1.id }, { nick: bn, team: t2.id });
  }
  const players = await api.call<{ id: string; nickname: string }[]>("get", "/players");
  for (const { nick, team } of nicks) {
    const id = players.find((p) => p.nickname === nick)!.id;
    await api.call("put", `/events/${event.id}/players/${id}`, { teamId: team });
  }

  const admin = await openAdmin(browser, token);
  await admin.page.locator("select").first().selectOption({ label: eventName });
  await admin.page.locator("li", { hasText: matchName }).getByRole("button", { name: "Avvia" }).click();
  await expect(screen.page.getByText("Si comincia tra poco!")).toBeVisible();

  const finish = async () => {
    const end = admin.page.getByRole("button", { name: "Termina la partita" });
    if (await end.isVisible()) await end.click({ timeout: 5_000 });
    await admin.page.getByRole("button", { name: "Torna alla lobby" }).click({ timeout: 5_000 });
    await expect(screen.page.getByRole("heading", { name: "Gioco" })).toBeVisible();
  };
  return {
    screen,
    admin,
    a: reds[0]!,
    b: blues[0]!,
    nickA: nicks[0]!.nick,
    nickB: nicks[1]!.nick,
    reds,
    blues,
    teams: { red: { id: t1.id, name: redName }, blue: { id: t2.id, name: blueName } },
    finish,
  };
}

/**
 * `test` con il fixture `newGame`: allestisce una partita e, a fine test (anche se fallisce a metà),
 * la termina e torna alla lobby, così un errore non fa fallire a cascata i test successivi.
 */
export const test = base.extend<{ newGame: (rounds: Parameters<typeof createGame>[2], options?: GameOptions) => Promise<GameSetup> }>({
  newGame: async ({ browser, request }, use) => {
    const games: GameSetup[] = [];
    await use(async (rounds, options) => {
      const game = await createGame(browser, request, rounds, options);
      games.push(game);
      return game;
    });
    for (const game of games) await game.finish().catch(() => undefined);
  },
});

/** Ultima vista del minigioco/duello ricevuta da una pagina (dai frame WebSocket): per ispezionare lo stato filtrato. */
export function lastPlayerView(traffic: { text: () => string }): Record<string, any> | null {
  const lines = traffic.text().split("\n").filter((l) => l.startsWith('42["game:player"'));
  const last = lines[lines.length - 1];
  if (!last) return null;
  const payload = JSON.parse(last.slice(2))[1] as { frame?: { view?: Record<string, any> } };
  return payload.frame?.view ?? null;
}
