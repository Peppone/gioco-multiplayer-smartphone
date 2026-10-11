import { expect, test } from "@playwright/test";
import { joinPlayer, openScreen, unique } from "./support";

test("le reazioni del telefono volano sullo schermo con il nome del giocatore", async ({ browser }) => {
  const screen = await openScreen(browser);
  const nick = unique("Lia");
  const phone = await joinPlayer(browser, nick);

  await phone.page.getByRole("button", { name: "🔥" }).click();
  const flying = screen.page.locator(".reaction", { hasText: "🔥" });
  await expect(flying).toBeVisible();
  await expect(flying).toContainText(nick);
});

test("il server limita le reazioni: al massimo 5 in 5 secondi per giocatore", async ({ browser }) => {
  const screen = await openScreen(browser);
  const phone = await joinPlayer(browser, unique("Max"));

  for (let i = 0; i < 12; i++) await phone.page.getByRole("button", { name: "👏" }).click();
  await expect(screen.page.locator(".reaction").first()).toBeVisible();
  await screen.page.waitForTimeout(500);
  expect(await screen.page.locator(".reaction").count()).toBeLessThanOrEqual(5);
});

test("le reazioni non arrivano agli altri telefoni", async ({ browser }) => {
  const a = await joinPlayer(browser, unique("Ada"));
  const b = await joinPlayer(browser, unique("Bob"));
  await a.page.getByRole("button", { name: "😂" }).click();
  await a.page.waitForTimeout(500);
  await expect(b.page.locator(".reaction")).toHaveCount(0);
  expect(b.traffic.text()).not.toContain("😂");
});
