import { expect, test } from "@playwright/test";
import { adminToken, joinPlayer, openScreen, unique } from "./support";

test("lo schermo mostra i QR e il giocatore compare in lobby", async ({ browser }) => {
  const screen = await openScreen(browser);
  await expect(screen.page.getByRole("heading", { name: "Gioco" })).toBeVisible();
  await expect(screen.page.getByText("Rete locale (Wi-Fi)")).toBeVisible();

  const nick = unique("Gina");
  const phone = await joinPlayer(browser, nick);
  await expect(screen.page.locator(".lobby li", { hasText: nick })).toBeVisible();
  // il telefono segnala la connessione e il ping
  await expect(phone.page.locator(".conn.ok")).toContainText("Connesso");
});

test("la pagina del telefono non ha scroll inutile (niente barre né overflow)", async ({ browser }) => {
  const phone = await joinPlayer(browser, unique("Zoe"));
  const m = await phone.page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    sh: document.documentElement.scrollHeight,
    ih: window.innerHeight,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  expect(m.sh).toBeLessThanOrEqual(m.ih);
});

test("le API della regia rifiutano chi non è autenticato", async ({ request }) => {
  expect((await request.get("/api/admin/teams")).status()).toBe(401);
  const token = await adminToken(request);
  const res = await request.get("/api/admin/teams", { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
});
