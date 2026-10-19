import { type Locator, expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80", "boom"] as const;
const SCENES = ["pc-ready", "pc-run", "pc-nav", "pc-nav-doors", "pc-frozen", "pc-level-end", "pc-turn", "pc-watch", "pc-final"] as const;
/** Scene in cui il telefono sta in una schermata, senza scorrere: la croce e la mappa si usano mentre si guarda la TV. */
const NO_SCROLL = new Set(["pc-ready", "pc-run", "pc-nav", "pc-nav-doors", "pc-frozen", "pc-turn", "pc-watch"]);

const sizes = (l: Locator) => l.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));

for (const theme of THEMES) {
  test.describe(`anteprima Pilota alla cieca · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow sul telefono e sullo schermo`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone.locator(".pc-ctrl")).toBeVisible();
        const p = await sizes(phone);
        expect(p.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(p.cw + 1);
        if (NO_SCROLL.has(scene)) expect(p.sh, "il telefono non deve scorrere").toBeLessThanOrEqual(p.ch + 1);
        const s = await sizes(page.locator(".screen-frame .screen"));
        expect(s.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(s.cw + 1);
        expect(s.sh, "overflow verticale dello schermo").toBeLessThanOrEqual(s.ch + 1);
        expect(errors).toEqual([]);
      });
    }

    test("4 corsie sulla TV leggibili, e sulla TV nessun pericolo segreto: solo le mine già scoperte e dove sono le porte", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pc-run&still=1`);
      const tv = page.locator(".screen-frame");
      const lanes = tv.getByTestId("pc-lane");
      await expect(lanes).toHaveCount(4);
      for (const lane of await lanes.all()) {
        const box = (await lane.getByTestId("pc-map").boundingBox())!;
        // la TV è ridotta a .55 nell'anteprima: la cella (13×13) deve restare grande sul vero schermo
        expect(box.width / 0.55 / 13, "cella troppo piccola sulla TV").toBeGreaterThanOrEqual(20);
      }
      await expect(tv.getByTestId("pc-patrol"), "pattuglie sulla TV in gara").toHaveCount(0);
      await expect(tv.getByTestId("pc-key"), "chiavi non raccolte sulla TV in gara").toHaveCount(0);
      for (const mine of await tv.getByTestId("pc-mine").all()) await expect(mine, "mina non scoperta sulla TV").toHaveAttribute("data-known", "true");
      expect(await tv.getByTestId("pc-door").count(), "dove sono le porte si vede").toBeGreaterThan(0);
      for (const door of await tv.getByTestId("pc-door").all()) expect(await door.getAttribute("data-open"), "orario delle porte sulla TV").toBeNull();
      await expect(tv.getByTestId("pc-pilot")).toHaveCount(4);
      await expect(tv.getByTestId("pc-exit")).toHaveCount(4);
      // il pilota ha solo la croce: niente mappa né pericoli sul suo telefono
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("pc-dpad")).toBeVisible();
      await expect(phone.getByTestId("pc-map")).toHaveCount(0);
      await expect(phone.locator(".pc-mine, .pc-patrol, .pc-key, .pc-door")).toHaveCount(0);
    });

    test("la croce del pilota ha touch-action: none e tasti da pollice", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pc-run&still=1`);
      const keys = page.locator(".phone-frame").getByTestId("pc-dpad").locator("button");
      await expect(keys).toHaveCount(4);
      for (const key of await keys.all()) {
        expect(await key.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
        const box = (await key.boundingBox())!;
        expect(box.height, "freccia").toBeGreaterThanOrEqual(56);
        expect(box.width, "freccia").toBeGreaterThanOrEqual(56);
      }
      await page.goto(`/preview?theme=${theme}&scene=pc-frozen&still=1`);
      await expect(page.locator(".phone-frame").getByTestId("pc-status")).toContainText("Fermo");
      for (const key of await page.locator(".phone-frame").getByTestId("pc-dpad").locator("button").all()) await expect(key).toBeDisabled();
    });

    test("mappa del navigatore: i suoi strati (mine, porte, chiavi, pattuglie), il pilota dal vivo, e «Nascondi»", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pc-nav&still=1`);
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("pc-legend")).toContainText("MINE");
      await expect(phone.getByTestId("pc-legend")).toContainText("PORTE");
      await expect(phone.getByTestId("pc-legend")).toContainText("CHIAVI");
      await expect(phone.getByTestId("pc-legend")).toContainText("PATTUGLIE");
      expect(await phone.getByTestId("pc-mine").count(), "mine").toBeGreaterThan(0);
      expect(await phone.getByTestId("pc-patrol").count(), "pattuglie").toBeGreaterThan(0);
      await expect(phone.getByTestId("pc-key")).toHaveCount(1);
      await expect(phone.getByTestId("pc-pilot")).toHaveCount(1);
      for (const door of await phone.getByTestId("pc-door").all()) expect(["true", "false"]).toContain(await door.getAttribute("data-open"));
      const box = (await phone.getByTestId("pc-map").boundingBox())!;
      expect(box.width / 13, "cella sul telefono").toBeGreaterThanOrEqual(20);
      // «Nascondi» sfoca la mappa
      await phone.getByTestId("pc-hide").click();
      await expect(phone.getByTestId("pc-map")).toHaveAttribute("data-hidden", "true");
      await phone.getByTestId("pc-hide").click();
      await expect(phone.getByTestId("pc-map")).not.toHaveAttribute("data-hidden");
      // senza lo strato «mine» il navigatore non ha mine sulla mappa
      await page.goto(`/preview?theme=${theme}&scene=pc-nav-doors&still=1`);
      await expect(phone.getByTestId("pc-legend")).toContainText("PORTE · PATTUGLIE");
      await expect(phone.getByTestId("pc-mine")).toHaveCount(0);
      await expect(phone.getByTestId("pc-key")).toHaveCount(0);
    });

    test("porte e pattuglie del navigatore cambiano nel tempo, calcolate dall'orologio", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pc-nav-doors&still=1`);
      const phone = page.locator(".phone-frame");
      const doors = phone.getByTestId("pc-door");
      await expect(doors.first()).toBeVisible();
      expect(await doors.count()).toBeGreaterThan(0);
      const state = () => doors.evaluateAll((els) => els.map((e) => e.getAttribute("data-open")));
      const patrols = () => phone.getByTestId("pc-patrol").locator("rect").evaluateAll((els) => els.map((e) => `${e.getAttribute("x")},${e.getAttribute("y")}`));
      const d0 = await state();
      const p0 = await patrols();
      // le porte del livello 3 cambiano ogni 3 s, le pattuglie ogni 0,9 s
      await page.waitForTimeout(3300);
      const d1 = await state();
      const p1 = await patrols();
      expect(d1, "tutte le porte hanno cambiato stato dopo un periodo").not.toEqual(d0);
      d0.forEach((open, i) => expect(d1[i], `porta ${i}`).not.toBe(open));
      expect(p1, "le pattuglie si sono mosse").not.toEqual(p0);
    });

    test("a fine gara la TV scopre gli strati di ogni corsia, con l'ordine di arrivo e i punti", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pc-level-end&still=1`);
      const tv = page.locator(".screen-frame");
      await expect(tv.getByTestId("pc-lane")).toHaveCount(2);
      expect(await tv.getByTestId("pc-patrol").count(), "pattuglie scoperte").toBeGreaterThan(0);
      expect(await tv.getByTestId("pc-mine").count(), "mine scoperte").toBeGreaterThan(0);
      expect(await tv.getByTestId("pc-key").count(), "chiavi scoperte").toBeGreaterThan(0);
      for (const door of await tv.getByTestId("pc-door").all()) expect(["true", "false"]).toContain(await door.getAttribute("data-open"));
      await expect(tv.getByTestId("pc-rank").first()).toContainText("1°");
      const results = tv.getByTestId("pc-results");
      await expect(results.locator("tr")).toHaveCount(2);
      await expect(results).toContainText("+140");
    });

    test("«ℹ️ Regole» apre la spiegazione con i numeri della partita e la sezione del proprio ruolo", async ({ page }) => {
      const phone = page.locator(".phone-frame");
      for (const [scene, mine] of [["pc-run", "Sei il PILOTA"], ["pc-nav", "Sei un NAVIGATORE"], ["pc-watch", "Non corre la tua squadra"]] as const) {
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        await phone.getByTestId("pc-rules").click();
        const dialog = phone.getByTestId("pc-rules-dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(mine);
        await expect(dialog).toContainText("3 livelli da 2 minuti e 30 secondi");
        await expect(dialog).toContainText("150, 100, 75, 50 punti");
        const box = await dialog.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(box.sw, "regole: scorrimento orizzontale").toBeLessThanOrEqual(box.cw + 1);
        await dialog.getByRole("button", { name: "Ho capito" }).click();
        await expect(dialog).toHaveCount(0);
      }
    });

    test("a turno: una sola corsia a tutto schermo, leggibile", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=pc-turn&still=1`);
      const tv = page.locator(".screen-frame");
      await expect(tv.getByTestId("pc-lane")).toHaveCount(1);
      await expect(tv.getByTestId("pc-level")).toContainText("gara 2/4");
      const box = (await tv.getByTestId("pc-map").boundingBox())!;
      expect(box.width / 0.55 / 13, "cella con una sola corsia").toBeGreaterThanOrEqual(30);
    });
  });
}
