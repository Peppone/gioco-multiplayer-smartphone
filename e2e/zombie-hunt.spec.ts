import { expect } from "@playwright/test";
import { test } from "./support";

test("zombie hunt: ruoli segreti, morso allo sfidante, schermo senza ruoli, classifica finale", async ({ newGame }) => {
  const g = await newGame([
    {
      typeId: "zombie-hunt",
      title: "Zombie e2e",
      theme: "pixel",
      config: { rounds: 1, turnSec: 60, revealSec: 2, zombieCount: 1, vaccineCount: 0 },
    },
  ]);
  const { screen, admin, a, b } = g;

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.locator('main.screen[data-theme="pixel"]')).toBeVisible();
  await expect(screen.page.getByText("Turno 1 di 1")).toBeVisible();
  await expect(a.page.getByText(/Turno 1 \/ 1/)).toBeVisible();

  // Con due giocatori uno è zombie e l'altro umano: ognuno lo sa solo del proprio telefono.
  const aIsZombie = await a.page.getByText("sei uno ZOMBIE").isVisible();
  const [zombie, human] = aIsZombie ? [a, b] : [b, a];
  await expect(zombie.page.getByText("sei uno ZOMBIE")).toBeVisible();
  await expect(human.page.getByText("sei UMANO")).toBeVisible();
  // Lo zombie sceglie: morde oppure si mimetizza con una carta. L'umano non ha il pulsante «Morsica».
  await expect(zombie.page.getByRole("button", { name: /Morsica/ })).toBeVisible();
  await expect(zombie.page.locator(".zh-card").first()).toBeVisible();
  await expect(human.page.getByRole("button", { name: /Morsica/ })).toHaveCount(0);

  // L'umano gioca una carta: lo schermo conta la scelta ma non vede ruoli né carte.
  // (le carte fuori seme sono disabilitate se ne ha del seme del turno)
  await expect(human.page.locator(".zh-turn-suit [data-suit]").first()).toBeVisible();
  await human.page.locator(".zh-card:not([disabled])").first().click();
  await expect(screen.page.getByText("Scelte arrivate: 1")).toBeVisible();
  for (const c of [screen, human]) expect(c.traffic.text()).not.toMatch(/"zombieNames"/);
  expect(screen.traffic.text()).not.toMatch(/"role"|"cards"|"choice"/);

  // Il turno aspetta anche lo zombie: finché non sceglie non si rivela (e dallo schermo non si distinguono).
  await expect(screen.page.getByText("Esiti del turno")).toHaveCount(0);
  await zombie.page.getByRole("button", { name: /Morsica/ }).click();

  // Hanno scelto tutti: si rivela da sola.
  await expect(human.page.getByText(/era uno ZOMBIE/)).toBeVisible();
  await expect(zombie.page.getByText(/Hai infettato/)).toBeVisible();
  await expect(screen.page.getByText("Esiti del turno")).toBeVisible();
  await expect(screen.page.locator(".zh-stat", { hasText: "infettati" })).toContainText("1");

  // Un solo turno: dopo la pausa la partita finisce e arriva la classifica.
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  await expect(screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li")).toHaveCount(2);
});
