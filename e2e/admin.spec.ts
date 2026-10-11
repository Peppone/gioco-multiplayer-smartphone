import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, adminToken, unique } from "./support";

test("accesso alla regia dalla UI: primo avvio o login, poi i pannelli", async ({ page, request }) => {
  await page.goto("/admin");
  const status = await (await request.get("/api/admin/status")).json();

  if (!status.configured) {
    // Primo avvio: si crea la password (i test e2e partono sempre da un database vuoto)
    await expect(page.getByRole("heading", { name: "Crea la password admin" })).toBeVisible();
    await page.getByPlaceholder("Password").fill("corta");
    await page.getByRole("button", { name: "Imposta e entra" }).click(); // minLength del campo: non invia
    await expect(page.getByRole("heading", { name: "Crea la password admin" })).toBeVisible();
    await page.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Imposta e entra" }).click();
  } else {
    await expect(page.getByRole("heading", { name: "Accesso regia" })).toBeVisible();
    await page.getByPlaceholder("Password").fill("password-sbagliata");
    await page.getByRole("button", { name: "Entra" }).click();
    await expect(page.getByText("Password errata.")).toBeVisible();
    await page.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Entra" }).click();
  }
  await expect(page.getByRole("heading", { name: "Regia" })).toBeVisible();
  for (const tab of ["Live", "Serate", "Libreria", "Squadre"]) {
    await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
  }

  // Uscire riporta al login
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page.getByRole("heading", { name: "Accesso regia" })).toBeVisible();
});

test("squadre e serate dalla UI: creazione, assegnazione dei giocatori ai team", async ({ page, request, browser }) => {
  const token = await adminToken(request);
  await page.addInitScript((t) => localStorage.setItem("gioco.admin.token", t), token);
  page.on("dialog", (d) => void d.accept());
  await page.goto("/admin");

  // Squadre
  const teamName = unique("Gialli");
  await page.getByRole("button", { name: "Squadre", exact: true }).click();
  await page.getByPlaceholder("Nome squadra").fill(teamName);
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page.locator(".list li", { hasText: teamName })).toBeVisible();
  // nome duplicato (anche con maiuscole diverse): rifiutato
  await page.getByPlaceholder("Nome squadra").fill(teamName.toUpperCase());
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page.locator(".error")).toContainText("Esiste già");

  // Serata con la squadra e un giocatore registrato dal telefono
  const { joinPlayer } = await import("./support");
  const nick = unique("Noa");
  await joinPlayer(browser, nick);

  const eventName = unique("Serata UI");
  await page.getByRole("button", { name: "Serate" }).click();
  await page.getByPlaceholder("Nome serata").fill(eventName);
  await page.getByRole("button", { name: "Crea serata" }).click();
  await expect(page.getByRole("heading", { name: eventName })).toBeVisible();

  // La casella è controllata dal server: si aggiorna dopo la risposta, quindi click + attesa (non check()).
  const chip = page.locator("label.chip", { hasText: teamName }).locator("input");
  await chip.click();
  await expect(chip).toBeChecked();
  const playerRow = page.locator(".list li", { hasText: nick });
  await playerRow.locator("select").selectOption({ index: 2 }); // 0 = fuori serata, 1 = senza team, 2 = prima squadra della serata
  await expect(playerRow.locator("select")).toHaveValue(/.+/);

  // Togliere la squadra dalla serata riporta il giocatore a «senza team»
  await chip.click();
  await expect(chip).not.toBeChecked();
  await expect(playerRow.locator("select")).toHaveValue("");
});
