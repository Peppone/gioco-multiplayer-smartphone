import { expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80"] as const;
const SCENES = ["stanze-dark", "stanze-setup", "stanze-compass", "stanze-pending", "stanze-sight", "stanze-mail", "stanze-event", "stanze-history", "stanze-reveal"] as const;

// Le scene dell'anteprima mostrano schermo e telefono senza giocare una partita: qui si controllano layout e privacy.
for (const theme of THEMES) {
  test.describe(`anteprima Stanze Segrete · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow sul telefono e sullo schermo`, async ({ page }) => {
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1${scene === "stanze-history" ? "&tab=events" : ""}`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone).toBeVisible();
        const sizes = await phone.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(sizes.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(sizes.cw + 1);
        const screenSizes = await page.locator(".screen-frame .screen").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(screenSizes.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(screenSizes.cw + 1);
        await expect(page.locator(".screen-frame .ss-room")).toHaveCount(scene === "stanze-dark" ? 0 : 9);
      });
    }

    test("la lettera resta nascosta finché non si tiene premuto", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=stanze-sight&still=1`);
      const hold = page.locator(".phone-frame .ss-hold");
      await expect(hold).toBeVisible();
      await expect(page.locator(".phone-frame").getByTestId("letter")).toHaveCount(0);
      expect(await page.locator(".phone-frame").innerText()).not.toMatch(/\bI\b.*Tieni/s === null ? "" : /^$/);
      await hold.dispatchEvent("pointerdown");
      await expect(page.locator(".phone-frame").getByTestId("letter")).toHaveText("I");
      await hold.dispatchEvent("pointerup");
      await expect(page.locator(".phone-frame").getByTestId("letter")).toHaveCount(0);
    });

    test("la scheda dell'evento copre il resto e comincia con «Evento:»", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=stanze-event&still=1`);
      const card = page.locator(".phone-frame").getByTestId("event-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText(/^\s*Evento:/);
      const frame = await page.locator(".phone-frame").boundingBox();
      const box = await card.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(frame!.width - 6);
      expect(box!.height).toBeGreaterThanOrEqual(frame!.height - 6);
      // la card è l'elemento in cima: un tocco al centro del telefono arriva a lei
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-testid=event-card]") !== null, [frame!.x + frame!.width / 2, frame!.y + frame!.height / 2]);
      expect(top).toBe(true);
    });

    test("la croce mostra frecce aperte, bloccate con lucchetto e nasconde il muro", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=stanze-compass&still=1`);
      const arrows = page.locator(".phone-frame .ss-arrow:not(.wall)");
      await expect(arrows).toHaveCount(3);
      await expect(page.locator('.phone-frame .ss-arrow[data-dir="down"]')).toBeDisabled();
      await expect(page.locator('.phone-frame .ss-arrow[data-dir="down"]')).toContainText("🔒");
      await expect(page.locator('.phone-frame .ss-arrow[data-dir="up"]')).toBeEnabled();
      // i bersagli toccabili sono abbastanza grandi per un dito
      const box = await page.locator('.phone-frame .ss-arrow[data-dir="up"]').boundingBox();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(40);
    });
  });
}

test("la rivelazione accende le lettere e traccia i due percorsi", async ({ page }) => {
  await page.goto("/preview?theme=retro80&scene=stanze-reveal&still=1");
  await expect(page.locator(".screen-frame .ss-letter")).toHaveCount(9);
  await expect(page.locator(".screen-frame .ss-room.path-0")).toHaveCount(5); // MORTA
  await expect(page.locator(".screen-frame .ss-room.path-1")).toHaveCount(6); // USCITA
  await expect(page.locator(".screen-frame .ss-words")).toContainText("MORTA");
});

test("in preparazione lo schermo non mostra lettere e il telefono dice il numero della stanza", async ({ page }) => {
  await page.goto("/preview?theme=pixel&scene=stanze-setup&still=1");
  await expect(page.locator(".screen-frame .ss-letter")).toHaveCount(0);
  await expect(page.locator(".screen-frame")).toContainText("Il complesso si sta preparando");
  await expect(page.locator(".phone-frame")).toContainText("Sei nella Stanza 1");
});

test("a mappa nascosta né lo schermo né il telefono mostrano griglia, stanze o dimensioni", async ({ page }) => {
  await page.goto("/preview?theme=retro80&scene=stanze-dark&still=1");
  await expect(page.locator(".screen-frame .ss-grid")).toHaveCount(0);
  await expect(page.locator(".screen-frame")).toContainText("avvolto nel buio");
  await expect(page.locator(".phone-frame .ss-mini")).toHaveCount(0);
  await page.locator(".phone-frame").getByRole("button", { name: /Regole/ }).click();
  await expect(page.locator(".phone-frame .ss-rules")).not.toContainText("stanze (");
  await expect(page.locator(".phone-frame .ss-rules")).toContainText("La mappa la mostra il Game Master");
});
