import { type Locator, expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80", "boom"] as const;
const SCENES = ["pdc-ready", "pdc-play", "pdc-six", "pdc-blackout", "pdc-alarm", "pdc-stopped", "pdc-jump", "pdc-final"] as const;
/** Scene in cui il telefono deve stare in una schermata, senza scorrere. */
const NO_SCROLL = new Set(["pdc-ready", "pdc-play", "pdc-stopped", "pdc-jump", "pdc-final"]);

const sizes = (l: Locator) => l.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));

for (const theme of THEMES) {
  test.describe(`anteprima Plancia di Comando · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow sul telefono e sullo schermo`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone.locator(".pdc-ctrl")).toBeVisible();
        const p = await sizes(phone);
        expect(p.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(p.cw + 1);
        if (NO_SCROLL.has(scene)) expect(p.sh, "il telefono non deve scorrere").toBeLessThanOrEqual(p.ch + 1);
        const s = await sizes(page.locator(".screen-frame .screen"));
        expect(s.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(s.cw + 1);
        expect(s.sh, "overflow verticale dello schermo").toBeLessThanOrEqual(s.ch + 1);
        expect(errors).toEqual([]);
      });
    }

    test("TV: 4 astronavi con scafo, passi e ultimo ordine eseguito; niente ordini in corso", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pdc-play&still=1`);
      const tv = page.locator(".screen-frame");
      const lanes = tv.getByTestId("pdc-lane");
      await expect(lanes).toHaveCount(4);
      await expect(tv.getByTestId("pdc-ship")).toHaveCount(4);
      await expect(tv.getByTestId("pdc-hull").first()).toHaveText("100%");
      await expect(tv.getByTestId("pdc-sector")).toContainText("Settore 3/5");
      await expect(tv.getByTestId("pdc-timer")).toBeVisible();
      await expect(tv.getByTestId("pdc-last").first()).toContainText("Flusso Ionico");
      // la TV non mostra gli ordini che i giocatori stanno ancora leggendo
      await expect(tv.getByTestId("pdc-order")).toHaveCount(0);
      // le astronavi avanzano in ordine di distanza
      const xs = await tv.getByTestId("pdc-ship").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
      expect(xs[0]!).toBeGreaterThan(xs[3]!);
    });

    test("telefono: ordine con barra, tocchi da pollice, cursore e selettore", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pdc-play&still=1`);
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("pdc-order-text")).toHaveText("Imposta il Reattore Beta su 4");
      await expect(phone.getByRole("progressbar")).toBeVisible();
      const controls = phone.getByTestId("pdc-control");
      await expect(controls).toHaveCount(4);
      await expect(controls.nth(0)).toHaveAttribute("data-kind", "button");
      await expect(phone.getByRole("switch")).toHaveAttribute("aria-checked", "true");
      await expect(phone.locator("input[type=range]")).toHaveCount(1);
      await expect(phone.getByRole("radio")).toHaveCount(3);
      for (const c of await controls.all()) {
        const box = (await c.boundingBox())!;
        expect(box.height, "comando troppo basso per il pollice").toBeGreaterThanOrEqual(44 * 0.55);
      }
      for (const b of await phone.getByTestId("pdc-control").locator("button").all()) {
        expect(await b.evaluate((el) => getComputedStyle(el).touchAction), "touch-action").toBe("manipulation");
      }
      // niente riepilogo dei compagni né avanzamento sul telefono
      await expect(phone.getByTestId("pdc-lane")).toHaveCount(0);
    });

    test("6 comandi coi nomi più lunghi: tutti visibili, nessun nome tagliato", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pdc-six&still=1`);
      const phone = page.locator(".phone-frame");
      const controls = phone.getByTestId("pdc-control");
      await expect(controls).toHaveCount(6);
      for (const c of await controls.all()) {
        const names = c.locator(".pdc-name");
        const s = await sizes(names);
        expect(s.sw, "nome del comando tagliato").toBeLessThanOrEqual(s.cw + 1);
        const box = (await c.boundingBox())!;
        expect(box.height).toBeGreaterThan(0);
      }
      await expect(phone.getByTestId("pdc-order-text")).toContainText("Stabilizzatore Magnetico Dorsale");
    });

    test("blackout: banner e pannello con le sole iniziali; allarme: pulsante rosso", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pdc-blackout&still=1`);
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("pdc-event")).toContainText("BLACKOUT");
      await expect(phone.getByTestId("pdc-control").first().locator(".pdc-name")).toHaveText("C.Q.R.");
      await expect(page.locator(".screen-frame").getByTestId("pdc-lane").first()).toHaveAttribute("data-event", "blackout");
      await page.goto(`/preview?theme=${theme}&scene=pdc-alarm&still=1`);
      const alarm = page.locator(".phone-frame").getByTestId("pdc-alarm");
      await expect(alarm).toBeVisible();
      await expect(alarm).toBeEnabled();
      const box = (await alarm.boundingBox())!;
      expect(box.height, "pulsante allarme").toBeGreaterThanOrEqual(44 * 0.55);
      await expect(page.locator(".screen-frame").getByTestId("pdc-event")).toContainText("ALLARME");
    });

    test("astronave ferma, salto e classifica finale", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pdc-stopped&still=1`);
      await expect(page.locator(".phone-frame").getByTestId("pdc-status")).toContainText("ferma");
      await expect(page.locator(".phone-frame").getByTestId("pdc-control")).toHaveCount(0);
      await expect(page.locator(".screen-frame").getByTestId("pdc-lane").first()).toHaveAttribute("data-stopped", "true");
      await page.goto(`/preview?theme=${theme}&scene=pdc-jump&still=1`);
      await expect(page.locator(".screen-frame").getByTestId("pdc-jump")).toContainText("settore 3");
      await expect(page.locator(".phone-frame").getByTestId("pdc-status")).toContainText("pannelli nuovi");
      await page.goto(`/preview?theme=${theme}&scene=pdc-final&still=1`);
      const rows = page.locator(".screen-frame").getByTestId("pdc-final").locator("li");
      await expect(rows).toHaveCount(4);
      await expect(rows.first()).toContainText("1° Rossi");
      await expect(page.locator(".phone-frame").getByTestId("pdc-result")).toContainText("1° posto");
    });

    test("regole: il telefono apre il dialogo con i numeri della partita", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pdc-play&still=1`);
      await page.locator(".phone-frame").getByTestId("pdc-rules").click();
      const dialog = page.locator(".phone-frame").getByTestId("pdc-rules-dialog");
      await expect(dialog).toContainText("5 settori da 1 minuto");
      await expect(dialog).toContainText("danneggia lo scafo del 5%");
      await dialog.getByRole("button", { name: "Ho capito" }).click();
      await expect(dialog).toHaveCount(0);
    });
  });
}
