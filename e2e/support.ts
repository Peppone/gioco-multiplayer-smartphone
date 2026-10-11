import { type APIRequestContext, type Browser, type BrowserContext, type Page, devices, expect } from "@playwright/test";

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
