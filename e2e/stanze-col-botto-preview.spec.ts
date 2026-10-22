import { expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80", "boom"] as const;
const SCENES = ["scb-pairing", "scb-deal", "scb-round", "scb-round-full", "scb-offer", "scb-swap", "scb-known", "scb-lock", "scb-leaders", "scb-hostages", "scb-travel", "scb-gamble", "scb-reveal"] as const;

// Le scene dell'anteprima mostrano schermo e telefono senza giocare una partita: qui si controllano layout e privacy.
for (const theme of THEMES) {
  test.describe(`anteprima Stanze col botto · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow sul telefono e sullo schermo`, async ({ page }) => {
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone).toBeVisible();
        const sizes = await phone.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
        expect(sizes.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(sizes.cw + 1);
        const screen = await page.locator(".screen-frame .screen").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
        expect(screen.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(screen.cw + 1);
        expect(screen.sh, "overflow verticale dello schermo").toBeLessThanOrEqual(screen.ch + 1);
      });
    }

    test("con 15 persone in una stanza e nomi lunghi l'elenco sta in una schermata, senza scorrere", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-round-full&still=1`);
      const phone = page.locator(".phone-frame .controller");
      const names = phone.getByTestId("scb-names").locator("button");
      await expect(names).toHaveCount(14); // 15 meno sé stessi
      const sizes = await phone.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
      expect(sizes.sh, "il telefono non deve scorrere").toBeLessThanOrEqual(sizes.ch + 1);
      for (const box of await names.evaluateAll((els) => els.map((e) => ({ over: e.scrollWidth > e.clientWidth + 1 })))) expect(box.over).toBe(false);
    });

    test("lo schermo con 30 nomi li mostra tutti, quindici per stanza", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-round-full&still=1`);
      const screen = page.locator(".screen-frame");
      await expect(screen.getByTestId("scb-room-0").locator("li")).toHaveCount(15);
      await expect(screen.getByTestId("scb-room-1").locator("li")).toHaveCount(15);
    });

    test("la carta resta nascosta finché non si tiene premuto", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-round&still=1`);
      const phone = page.locator(".phone-frame");
      const hold = phone.getByTestId("scb-hold");
      await expect(hold).toBeVisible();
      await expect(phone.getByTestId("scb-secret")).toHaveCount(0);
      expect(await phone.innerText()).not.toMatch(/Presidente/i);
      await hold.dispatchEvent("pointerdown");
      await expect(phone.getByTestId("scb-secret")).toContainText("Presidente");
      await hold.dispatchEvent("pointerup");
      await expect(phone.getByTestId("scb-secret")).toHaveCount(0);
    });

    test("le carte viste di altri non compaiono nella schermata principale, solo dietro il pulsante", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-known&still=1`);
      const phone = page.locator(".phone-frame");
      expect(await phone.innerText()).not.toMatch(/Bombarolo/i);
      await expect(phone.getByTestId("scb-known-open")).toContainText("(1)");
      await phone.getByTestId("scb-known-open").click();
      await expect(phone.getByTestId("scb-known")).toContainText("Dario");
      await expect(phone.getByTestId("scb-known")).toContainText("Bombarolo");
    });

    test("toccando un nome si apre il foglio con le azioni permesse", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-round&still=1`);
      const phone = page.locator(".phone-frame");
      await phone.getByTestId("scb-player-p0").click();
      const sheet = phone.getByTestId("scb-sheet");
      await expect(sheet).toBeVisible();
      for (const id of ["vote", "reveal-card", "reveal-color", "share-card", "share-color"]) await expect(sheet.getByTestId(`scb-action-${id}`)).toBeVisible();
      // non è il leader e c'è già un leader: niente nomina, niente passaggio di carica, niente ostaggi
      for (const id of ["appoint", "abdicate", "hostage"]) await expect(sheet.getByTestId(`scb-action-${id}`)).toHaveCount(0);
    });

    test("il leader sceglie gli ostaggi dal foglio e conferma", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-hostages&still=1`);
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("scb-hostage-bar")).toContainText("Ostaggi (1/2)");
      await phone.getByTestId("scb-player-p4").click();
      await expect(phone.getByTestId("scb-action-hostage")).toContainText("Scegli come ostaggio");
      await expect(phone.getByTestId("scb-confirm")).toBeDisabled();
    });

    test("proposta di scambio a tutto schermo con Accetta e Rifiuta", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-offer&still=1`);
      const offer = page.locator(".phone-frame").getByTestId("scb-offer");
      await expect(offer).toContainText("Dario vuole scambiare la carta con te");
      await expect(offer.getByTestId("scb-offer-accept")).toBeVisible();
      await expect(offer.getByTestId("scb-offer-decline")).toBeVisible();
    });

    test("scambio di persona: il pulsante apre il QR personale, la scelta carta/colore e lo scanner; niente overflow", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-swap&still=1`);
      const phone = page.locator(".phone-frame");
      const open = phone.getByTestId("scb-swap-open");
      await expect(open).toHaveAttribute("data-pending", "true"); // un compagno mi ha già inquadrato
      await open.click();
      const dialog = phone.getByTestId("scb-swap");
      await expect(dialog.getByTestId("scb-swap-qr")).toHaveAttribute("data-code", "K7M2P9");
      await expect(dialog.getByTestId("scb-swap-qr").locator("svg")).toBeVisible();
      await expect(dialog.getByTestId("scb-swap-in")).toContainText("Dario ti ha inquadrato");
      await expect(dialog.getByTestId("scb-swap-kind-card")).toHaveAttribute("aria-pressed", "true");
      await dialog.getByTestId("scb-swap-kind-color").click();
      await expect(dialog.getByTestId("scb-swap-kind-color")).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByTestId("scb-swap-scan")).toBeVisible();
      const body = await dialog.locator(".gf-rules-body").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(body.sw, "overflow orizzontale del dialogo").toBeLessThanOrEqual(body.cw + 1);
    });

    test("senza il QR di scambio (scena normale) non c'è il pulsante «Scambia di persona»", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-round&still=1`);
      await expect(page.locator(".phone-frame").getByTestId("scb-swap-open")).toHaveCount(0);
    });

    test("abbinamento con i QR: due codici sullo schermo e il campo del codice sul telefono", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-pairing&still=1`);
      const screen = page.locator(".screen-frame");
      await expect(screen.getByTestId("scb-qr-0")).toContainText("Salotto");
      await expect(screen.getByTestId("scb-qr-0").locator("svg")).toBeVisible();
      await expect(screen.getByTestId("scb-qr-1")).toContainText("Cucina");
      await expect(screen.getByTestId("scb-unassigned")).toContainText("Nadia");
      const phone = page.locator(".phone-frame");
      await expect(phone.getByRole("textbox", { name: "Codice della stanza" })).toBeVisible();
      await expect(phone.getByTestId("scb-scan")).toBeVisible();
    });

    test("lo schermo non mostra né carte né leader nascosti prima del blocco", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-round&still=1`);
      const text = await page.locator(".screen-frame").innerText();
      expect(text).not.toMatch(/Presidente|Bombarolo|Squadra Blu|Squadra Rossa|★/);
    });

    test("dopo il blocco lo schermo mostra i due leader; con uno solo bloccato aspetta", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-leaders&still=1`);
      const screen = page.locator(".screen-frame");
      await expect(screen.getByTestId("scb-leader-0")).toContainText("Carla");
      await expect(screen.getByTestId("scb-leader-1")).toContainText("Luca");
      await expect(screen.getByTestId("scb-hostages")).toContainText("pronto ✓");
      await page.goto(`/preview?theme=${theme}&scene=scb-lock&still=1`);
      await expect(page.locator(".screen-frame").getByTestId("scb-lock")).toContainText("Cucina");
    });

    test("ostaggio in viaggio: il telefono dice dove andare e lo schermo mostra lo scambio", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-travel&still=1`);
      await expect(page.locator(".phone-frame").getByTestId("scb-travel")).toContainText("Vai in Cucina");
      const exchange = page.locator(".screen-frame").getByTestId("scb-exchange");
      await expect(exchange.locator("li")).toHaveCount(2);
      await expect(exchange).toContainText("Salotto → Cucina");
    });

    test("rivelazione: botto, carte di tutti e squadra vincitrice", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-reveal&still=1`);
      const screen = page.locator(".screen-frame");
      await expect(screen.getByTestId("scb-boom")).toHaveAttribute("data-boom", "yes");
      await expect(screen.getByTestId("scb-outcome")).toContainText("ROSSA");
      await expect(screen.locator("li[data-special='true']")).toHaveCount(2);
      await expect(screen.locator(".scb-cards li")).toHaveCount(12);
    });

    test("previsione del Giocatore d'azzardo: due pulsanti, uno per squadra", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=scb-gamble&still=1`);
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("scb-gamble-blue")).toBeVisible();
      await expect(phone.getByTestId("scb-gamble-red")).toBeVisible();
    });
  });
}

test("il tema boom ha il suo font, i suoi colori e i suoni", async ({ page }) => {
  await page.goto("/preview?theme=boom&scene=scb-reveal&still=1");
  const style = await page.locator(".screen-frame .screen").evaluate((el) => {
    const s = getComputedStyle(el);
    return { font: s.fontFamily, bg: s.getPropertyValue("--team-red").trim() };
  });
  expect(style.font).toContain("Montserrat");
  expect(style.bg).toBe("#c8202f");
  const sounds = await page.evaluate(async () => (await Promise.all(["start", "reveal", "fanfare"].map((n) => fetch(`/sounds/boom/${n}.wav`).then((r) => r.status)))));
  expect(sounds).toEqual([200, 200, 200]);
});
