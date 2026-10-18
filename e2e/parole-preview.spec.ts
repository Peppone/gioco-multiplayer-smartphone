import { expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80"] as const;
const SCENES = ["pm-word", "pm-night", "pm-questions", "pm-questions-player", "pm-grace", "pm-seer-hunt", "pm-vote", "pm-runoff", "pm-reveal"] as const;

// Le scene dell'anteprima mostrano schermo e telefono senza giocare una partita: qui si controllano layout e privacy.
for (const theme of THEMES) {
  test.describe(`anteprima Parole Mannare · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow sul telefono e sullo schermo`, async ({ page }) => {
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone).toBeVisible();
        const sizes = await phone.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
        expect(sizes.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(sizes.cw + 1);
        // La schermata del Sindaco con 12 giocatori sta in una pagina, senza scorrimento.
        if (scene === "pm-questions") expect(sizes.sh, "il telefono del Sindaco non deve scorrere").toBeLessThanOrEqual(sizes.ch + 1);
        const screen = await page.locator(".screen-frame .screen").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
        expect(screen.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(screen.cw + 1);
        expect(screen.sh, "overflow verticale dello schermo").toBeLessThanOrEqual(screen.ch + 1);
      });
    }

    test("telefono del Sindaco: 11 nomi e 6 gettoni trascinabili, senza gesti che rubano il trascinamento", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pm-questions&still=1`);
      const chips = page.locator(".phone-frame .pm-chip");
      await expect(chips).toHaveCount(11 + 6);
      for (const touchAction of await chips.evaluateAll((els) => els.map((e) => getComputedStyle(e).touchAction))) expect(touchAction).toBe("none");
      const style = await chips.first().evaluate((e) => ({ select: getComputedStyle(e).userSelect, callout: getComputedStyle(e).getPropertyValue("-webkit-touch-callout") }));
      expect(style.select).toBe("none");
    });

    test("telefono del Sindaco: i gettoni esauriti sono disabilitati nel DOM, gli altri no", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pm-questions&still=1`);
      // nella scena «Ci sei quasi» è usato, tutti gli altri gettoni sono disponibili
      await expect(page.locator('.phone-frame [data-dd="token:close"]')).toHaveAttribute("data-disabled", "true");
      await expect(page.locator('.phone-frame [data-dd="token:close"]')).toHaveAttribute("aria-disabled", "true");
      for (const t of ["yes", "no", "maybe", "far", "correct"]) await expect(page.locator(`.phone-frame [data-dd="token:${t}"]`)).toHaveAttribute("data-disabled", "false");
    });

    test("telefono del Sindaco: tocco-tocco su un nome e su un gettone, «Esatto» chiede conferma", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pm-questions&still=1`);
      const phone = page.locator(".phone-frame");
      // il pulsante «Annulla» mostra cosa annullerà
      await expect(phone.getByTestId("pm-undo")).toContainText("Ci sei quasi a Carla");
      const name = phone.locator('[data-dd="player:p0"]');
      await name.click();
      await expect(name).toHaveAttribute("data-selected", "true");
      await name.click();
      await expect(name).toHaveAttribute("data-selected", "false");
      await name.click();
      await phone.locator('[data-dd="token:correct"]').click();
      await expect(phone.getByTestId("pm-confirm")).toContainText("Anna ha indovinato?");
    });

    test("ruolo e parola restano nascosti finché non si tiene premuto", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pm-night&still=1`);
      const phone = page.locator(".phone-frame");
      const hold = phone.getByTestId("pm-hold");
      await expect(hold).toBeVisible();
      await expect(phone.getByTestId("pm-secret")).toHaveCount(0);
      expect(await phone.innerText()).not.toContain("Faro");
      await hold.dispatchEvent("pointerdown");
      await expect(phone.getByTestId("pm-secret")).toContainText("Lupo");
      await expect(phone.getByTestId("pm-secret")).toContainText("Faro");
      await hold.dispatchEvent("pointerup");
      await expect(phone.getByTestId("pm-secret")).toHaveCount(0);
    });

    test("lo schermo mostra un riassunto per ogni giocatore e le riserve", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pm-questions&still=1`);
      const screen = page.locator(".screen-frame");
      await expect(screen.locator(".pm-board-row")).toHaveCount(12);
      await expect(screen.getByTestId("pm-reserves")).toContainText("Sì/No: 23");
      await expect(screen.getByTestId("pm-reserves")).toContainText("Forse: 9");
      await expect(screen.locator('[data-player="p3"]')).toContainText("✅ 4");
      // lo schermo non mostra mai ruoli né parola durante le domande
      const text = await screen.innerText();
      expect(text).not.toMatch(/Lupo|Veggente|Faro/);
    });

    test("ballottaggio: lo schermo e il telefono mostrano solo i candidati pari", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pm-runoff&still=1`);
      await expect(page.locator(".screen-frame").getByTestId("pm-runoff").locator("li")).toHaveText(["Anna", "Luca"]);
      await expect(page.locator(".phone-frame .pm-vote-grid button")).toHaveText(["Anna", "Luca"]);
      await expect(page.locator(".screen-frame h2")).toContainText("Ballottaggio");
    });

    test("rivelazione: ruoli di tutti e fazione vincitrice", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pm-reveal&still=1`);
      const screen = page.locator(".screen-frame");
      await expect(screen.locator(".pm-role-row")).toHaveCount(12);
      await expect(screen.locator('.pm-role-row[data-role="werewolf"]')).toHaveCount(3);
      await expect(screen.locator("h2")).toContainText("VILLAGGIO");
    });
  });
}
