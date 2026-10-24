import { type Locator, expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80", "boom"] as const;
const SCENES = ["px-board", "px-expert", "px-action", "px-theory", "px-review", "px-final"] as const;

const sizes = (l: Locator) => l.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
const PHONE_CLICK_MIN = 44;


for (const theme of THEMES) {
  test.describe(`anteprima Il Pianeta Nascosto · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow orizzontale sul telefono e sullo schermo`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone.locator(".px-ctrl")).toBeVisible();
        const p = await sizes(phone);
        expect(p.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(p.cw + 1);
        const s = await sizes(page.locator(".screen-frame .screen"));
        expect(s.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(s.cw + 1);
        expect(s.sh, "overflow verticale dello schermo").toBeLessThanOrEqual(s.ch + 1);
        expect(errors).toEqual([]);
      });
    }

    test("TV: spicchi tutti uguali nel DOM, oggetto solo nei settori confermati", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=px-board&still=1`);
      const tv = page.locator(".screen-frame");
      const wedges = tv.getByTestId("px-wedge");
      await expect(wedges).toHaveCount(12);
      const html = await wedges.evaluateAll((els) => els.map((e) => ({ sector: e.getAttribute("data-sector"), confirmed: e.getAttribute("data-confirmed"), attrs: e.getAttributeNames().sort().join(), objects: e.querySelectorAll("[data-testid=px-object]").length })));
      for (const w of html) {
        if (w.confirmed) expect(w.objects, `settore ${w.sector} confermato`).toBe(1);
        else {
          expect(w.objects, `settore ${w.sector}: nessun oggetto prima della conferma`).toBe(0);
          expect(w.attrs).toBe("class,data-sector,data-testid");
        }
      }
      await expect(tv.locator("[data-testid=px-wedge][data-confirmed]")).toHaveCount(2);
      // teorie coperte: colore e settore, mai l'oggetto
      const covered = tv.locator("[data-testid=px-token][data-face=down]");
      await expect(covered).toHaveCount(2);
      for (const t of await covered.all()) expect((await t.textContent())?.trim()).toBe("");
      await expect(tv.locator("[data-testid=px-token][data-face=up]")).toHaveCount(2);
    });

    test("TV: la Terra ruota con la freccia, icone e segnalini sul tracciato", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=px-board&still=1`);
      const tv = page.locator(".screen-frame");
      const earth = tv.getByTestId("px-earth");
      await expect(earth).toHaveAttribute("data-earth-sector", "8");
      const deg = await earth.evaluate((el) => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return (Math.atan2(m.b, m.a) * 180) / Math.PI;
      });
      expect(Math.round((deg + 360) % 360)).toBe(210); // 7 giorni × 30°
      await expect(tv.getByTestId("px-icon-theory")).toHaveCount(4);
      await expect(tv.getByTestId("px-icon-conference")).toHaveCount(1);
      await expect(tv.getByTestId("px-marker")).toHaveCount(4);
      await expect(tv.locator("[data-testid=px-marker][data-acting]")).toHaveCount(1);
      await expect(tv.getByTestId("px-topics").locator("li")).toHaveCount(6);
      await expect(tv.getByTestId("px-log")).toContainText("FALLITO");
    });

    test("Esperto: 18 spicchi, 6 icone di teoria e 2 conferenze", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=px-expert&still=1`);
      const tv = page.locator(".screen-frame");
      await expect(tv.getByTestId("px-wedge")).toHaveCount(18);
      await expect(tv.getByTestId("px-icon-theory")).toHaveCount(6);
      await expect(tv.getByTestId("px-icon-conference")).toHaveCount(2);
      await expect(page.locator(".phone-frame").getByTestId("px-wslice")).toHaveCount(18);
    });

    test("telefono: la ruota evidenzia il cielo visibile e il foglio si compila con bersagli da pollice", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=px-board&still=1`);
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("px-wslice")).toHaveCount(12);
      await expect(phone.locator("[data-testid=px-wslice][data-visible]")).toHaveCount(6);
      await expect(phone.locator("[data-testid=px-wslice][data-confirmed]")).toHaveCount(2);
      await phone.locator("[data-testid=px-wslice][data-sector='5']").click();
      const editor = phone.getByTestId("px-editor");
      await expect(editor).toHaveAttribute("data-sector", "5");
      const marks = editor.getByTestId("px-mark");
      await expect(marks).toHaveCount(6); // il settore 5 è da cometa: sei oggetti
      for (const m of await marks.all()) {
        const box = (await m.boundingBox())!;
        expect(box.height, "segno troppo basso").toBeGreaterThanOrEqual(PHONE_CLICK_MIN * 0.55);
        expect(await m.evaluate((el) => getComputedStyle(el).touchAction), "touch-action").toBe("manipulation");
      }
      // le informazioni iniziali si vedono come quadrati pieni e non si cambiano
      await phone.locator("[data-testid=px-wslice][data-sector='7']").click();
      const fixed = phone.locator("[data-testid=px-mark][data-kind=asteroid]");
      await expect(fixed).toBeDisabled();
      await expect(fixed).toContainText("■");
      // l'elenco è l'alternativa a 18 settori
      await phone.getByTestId("px-list-toggle").click();
      await expect(phone.getByTestId("px-list").locator("li")).toHaveCount(12);
      const list = await sizes(phone.getByTestId("px-list"));
      expect(list.sw).toBeLessThanOrEqual(list.cw + 1);
    });

    test("telefono: scelta dell'azione, proposte, voto e decisione del capitano", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=px-action&still=1`);
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("px-tab-action")).toHaveAttribute("aria-selected", "true");
      await expect(phone.getByTestId("px-builder")).toBeVisible();
      await expect(phone.getByTestId("px-proposal")).toHaveCount(2);
      await expect(phone.getByTestId("px-decide")).toHaveCount(2);
      await expect(phone.getByTestId("px-propose")).toBeDisabled();
      // arco di tre settori: costa 4; di quattro: 3
      const picker = phone.getByRole("group", { name: "Arco" });
      await picker.getByRole("button", { name: "Settore 8" }).click();
      await picker.getByRole("button", { name: "Settore 10" }).click();
      await expect(phone.getByTestId("px-arc")).toContainText("costa 4");
      await picker.getByRole("button", { name: "Settore 11" }).click();
      await expect(phone.getByTestId("px-arc")).toContainText("costa 3");
      await expect(phone.getByTestId("px-propose")).toBeEnabled();
      // comete: l'arco deve iniziare e finire su un settore da cometa
      await phone.getByRole("button", { name: "Cometa" }).click();
      await expect(phone.getByTestId("px-why")).toContainText("settore da cometa");
      await expect(phone.getByTestId("px-propose")).toBeDisabled();
      for (const b of await phone.getByRole("group", { name: "Arco" }).getByRole("button").all()) {
        expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(PHONE_CLICK_MIN * 0.55);
      }
    });

    test("telefono: gettoni teoria e invio delle teorie", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=px-theory&still=1`);
      const phone = page.locator(".phone-frame");
      await expect(phone.getByTestId("px-tab-theory")).toHaveAttribute("aria-selected", "true");
      await expect(phone.getByTestId("px-tokens")).toContainText("◍ 4/4");
      await expect(phone.getByTestId("px-tokens")).toContainText("☁ 1/2");
      await expect(phone.getByTestId("px-placed")).toContainText("spazio 2/4");
      await expect(phone.getByTestId("px-draft")).toContainText("settore 6");
      await expect(phone.getByTestId("px-theory-ready")).toBeEnabled();
    });

    test("TV: revisione con teorie giuste e sbagliate; punteggio finale con le colonne del foglio", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=px-review&still=1`);
      const review = page.locator(".screen-frame").getByTestId("px-review");
      await expect(review.locator("li")).toHaveCount(2);
      await expect(review.locator("li[data-correct=false]")).toContainText("avanza di 1");
      await page.goto(`/preview?theme=${theme}&scene=px-final&still=1`);
      const rows = page.locator(".screen-frame").getByTestId("px-score-row");
      await expect(rows).toHaveCount(4);
      await expect(rows.first()).toContainText("Rossi");
      await expect(rows.first()).toContainText("230");
      await expect(page.locator(".screen-frame").locator("[data-testid=px-wedge] [data-testid=px-object]")).toHaveCount(12);
      await expect(page.locator(".phone-frame").getByTestId("px-result")).toContainText("1° posto");
    });

    test("regole: il telefono apre il dialogo con i numeri della partita", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=px-board&still=1`);
      await page.locator(".phone-frame").getByTestId("px-rules").click();
      const dialog = page.locator(".phone-frame").getByTestId("px-rules-dialog");
      await expect(dialog).toContainText("12 settori");
      await expect(dialog).toContainText("9 in tutto");
      await dialog.getByRole("button", { name: "Ho capito" }).click();
      await expect(dialog).toHaveCount(0);
    });
  });
}
