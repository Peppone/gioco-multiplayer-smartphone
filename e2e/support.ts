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
export function captureSocketTraffic(page: Page): { text: () => string } {
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => frames.push(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8")));
  });
  return { text: () => frames.join("\n") };
}

export interface Client {
  context: BrowserContext;
  page: Page;
  traffic: { text: () => string };
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
  a: Client;
  b: Client;
  nickA: string;
  nickB: string;
  /** Termina la partita (se serve) e torna alla lobby: lascia il server pulito per gli altri test. */
  finish: () => Promise<void>;
}

/**
 * Allestisce una partita pronta: 2 squadre, 2 giocatori (Ada e Bob, uno per squadra), i round indicati,
 * schermo + regia + due telefoni aperti, partita avviata dal pannello Live (fase «pronta»).
 */
export async function createGame(
  browser: Browser,
  request: APIRequestContext,
  rounds: { typeId: string; title: string; theme?: string; config: unknown }[],
): Promise<GameSetup> {
  const token = await adminToken(request);
  const api = adminApi(request, token);

  const t1 = await api.call<{ id: string }>("post", "/teams", { name: unique("Rossi"), color: "#ef4444", emblem: "🔥" });
  const t2 = await api.call<{ id: string }>("post", "/teams", { name: unique("Blu"), color: "#3b82f6", emblem: "🌊" });
  const eventName = unique("Serata");
  const event = await api.call<{ id: string }>("post", "/events", { name: eventName });
  await api.call("put", `/events/${event.id}/teams`, { teamIds: [t1.id, t2.id] });
  const matchName = unique("Partita");
  const match = await api.call<{ id: string }>("post", `/events/${event.id}/matches`, { name: matchName, mode: "classic" });
  for (const r of rounds) {
    const inst = await api.call<{ id: string }>("post", "/instances", r);
    await api.call("post", `/matches/${match.id}/rounds`, { instanceId: inst.id });
  }

  const screen = await openScreen(browser);
  const nickA = unique("Ada");
  const nickB = unique("Bob");
  const a = await joinPlayer(browser, nickA);
  const b = await joinPlayer(browser, nickB);
  const players = await api.call<{ id: string; nickname: string }[]>("get", "/players");
  const idOf = (n: string) => players.find((p) => p.nickname === n)!.id;
  await api.call("put", `/events/${event.id}/players/${idOf(nickA)}`, { teamId: t1.id });
  await api.call("put", `/events/${event.id}/players/${idOf(nickB)}`, { teamId: t2.id });

  const admin = await openAdmin(browser, token);
  await admin.page.locator("select").first().selectOption({ label: eventName });
  await admin.page.locator("li", { hasText: matchName }).getByRole("button", { name: "Avvia" }).click();
  await expect(screen.page.getByText("Si comincia tra poco!")).toBeVisible();

  const finish = async () => {
    const end = admin.page.getByRole("button", { name: "Termina la partita" });
    if (await end.isVisible()) await end.click({ timeout: 5_000 });
    await admin.page.getByRole("button", { name: "Torna alla lobby" }).click({ timeout: 5_000 });
    await expect(screen.page.getByRole("heading", { name: "Gioco Ros" })).toBeVisible();
  };
  return { screen, admin, a, b, nickA, nickB, finish };
}

/**
 * `test` con il fixture `newGame`: allestisce una partita e, a fine test (anche se fallisce a metà),
 * la termina e torna alla lobby, così un errore non fa fallire a cascata i test successivi.
 */
export const test = base.extend<{ newGame: (rounds: Parameters<typeof createGame>[2]) => Promise<GameSetup> }>({
  newGame: async ({ browser, request }, use) => {
    const games: GameSetup[] = [];
    await use(async (rounds) => {
      const game = await createGame(browser, request, rounds);
      games.push(game);
      return game;
    });
    for (const game of games) await game.finish().catch(() => undefined);
  },
});
