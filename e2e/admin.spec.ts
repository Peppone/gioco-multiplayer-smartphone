import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, adminToken, joinPlayer, openAdmin, unique } from "./support";

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

test("regia aperta con un token non più valido: si torna al login invece di restare vuoti", async ({ page, request }) => {
  await adminToken(request); // assicura che la password esista (il database e2e parte vuoto)
  await page.addInitScript(() => localStorage.setItem("gioco.admin.token", "token-ormai-scaduto"));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Accesso regia" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("gioco.admin.token"))).toBeNull();

  // E col login si rientra normalmente.
  await page.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entra" }).click();
  await expect(page.getByRole("heading", { name: "Regia" })).toBeVisible();
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

test("giocatori: la regia vede l'elenco, mostra il PIN che il telefono ha ricevuto e ne genera uno nuovo", async ({ browser, request }) => {
  const nick = unique("Pin");
  const phone = await joinPlayer(browser, nick);
  const shownOnPhone = (await phone.page.locator(".pin-box strong").innerText()).trim();
  expect(shownOnPhone).toMatch(/^\d{4}$/);

  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Giocatori", exact: true }).click();
  const row = page.locator(".list.players li", { hasText: nick });
  await expect(row).toBeVisible();

  // Il PIN sta nascosto finché non lo si chiede, e alla regia compare lo stesso che ha visto il giocatore.
  await expect(row.getByLabel(`PIN di ${nick}`)).toHaveText("••••");
  expect(await page.content()).not.toContain(shownOnPhone + "</code>");
  await row.getByRole("button", { name: "Mostra PIN" }).click();
  await expect(row.getByLabel(`PIN di ${nick}`)).toHaveText(shownOnPhone);
  await row.getByRole("button", { name: "Nascondi" }).click();
  await expect(row.getByLabel(`PIN di ${nick}`)).toHaveText("••••");

  // La ricerca filtra l'elenco.
  await page.getByLabel("Cerca giocatore").fill("zzz-nessuno");
  await expect(page.getByText("Nessun giocatore con questo nome.")).toBeVisible();
  await page.getByLabel("Cerca giocatore").fill(nick.toUpperCase());
  await expect(row).toBeVisible();

  // Nuovo PIN: si legge subito e il PIN vecchio non vale più per rientrare da un altro telefono.
  await row.getByRole("button", { name: "Nuovo PIN" }).click();
  await expect(row.getByLabel(`PIN di ${nick}`)).toHaveText(/^\d{4}$/); // il nuovo PIN si legge subito, senza «Mostra»

  // Il PIN non passa dallo schermo né dagli altri telefoni: solo dalla regia autenticata.
  expect((await request.get("/api/admin/players/details")).status()).toBe(401);
  expect((await request.get("/api/admin/players")).status()).toBe(401);
});
