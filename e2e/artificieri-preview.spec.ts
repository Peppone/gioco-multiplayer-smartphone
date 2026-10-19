import { type Locator, expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80", "boom"] as const;
const SCENES = ["art-bet", "art-briefing", "art-wires", "art-button", "art-symbols", "art-colors", "art-maze", "art-word", "art-manual", "art-watch", "art-exploded", "art-defused", "art-final"] as const;
/** Scene in cui i comandi stanno in una schermata, senza scorrere: l'artificiere ha il dito sul pulsante e gli occhi sulla TV. */
const NO_SCROLL = new Set(["art-bet", "art-briefing", "art-wires", "art-button", "art-symbols", "art-colors", "art-maze", "art-word", "art-watch"]);

const sizes = (l: Locator) => l.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));

// Le scene dell'anteprima mostrano schermo e telefono senza giocare una partita: qui si controllano layout e privacy.
for (const theme of THEMES) {
  test.describe(`anteprima Artificieri · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow sul telefono e sullo schermo`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone.locator(".art-ctrl")).toBeVisible();
        const p = await sizes(phone);
        expect(p.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(p.cw + 1);
        if (NO_SCROLL.has(scene)) expect(p.sh, "il telefono non deve scorrere").toBeLessThanOrEqual(p.ch + 1);
        const s = await sizes(page.locator(".screen-frame .screen"));
        expect(s.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(s.cw + 1);
        expect(s.sh, "overflow verticale dello schermo").toBeLessThanOrEqual(s.ch + 1);
        expect(errors).toEqual([]);
      });
    }

    test("privacy nel DOM: la TV mostra la bomba solo in disinnesco e la striscia solo a pulsante tenuto", async ({ page }) => {
      const tv = page.locator(".screen-frame .screen");
      const phone = page.locator(".phone-frame .controller");
      for (const scene of ["art-bet", "art-briefing", "art-final"]) {
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        await expect(tv.locator(".art-screen")).toBeVisible();
        await expect(tv.getByTestId("art-bomb"), `${scene}: bomba prima di «Inizia»`).toHaveCount(0);
      }
      await page.goto(`/preview?theme=${theme}&scene=art-wires&still=1`);
      await expect(tv.getByTestId("art-bomb")).toBeVisible();
      await expect(tv.getByTestId("art-module")).toHaveCount(6);
      await expect(tv.locator("[data-testid=art-strip][data-on]"), "striscia visibile senza pulsante tenuto").toHaveCount(0);
      // l'artificiere non ha né bordo né colori sul telefono, solo i comandi
      await expect(phone.getByTestId("art-edge")).toHaveCount(0);
      await expect(phone.getByTestId("art-serial")).toHaveCount(0);
      await expect(phone.locator("[data-color]")).toHaveCount(0);
      await expect(phone.getByTestId("art-wire-buttons").getByTestId("art-cut")).not.toHaveCount(0);
      await page.goto(`/preview?theme=${theme}&scene=art-button&still=1`);
      await expect(tv.locator("[data-testid=art-strip][data-on]")).toHaveCount(1);
      // gli esperti non hanno la bomba
      await page.goto(`/preview?theme=${theme}&scene=art-manual&still=1`);
      await expect(phone.getByTestId("art-manual")).toBeVisible();
      await expect(phone.getByTestId("art-edge")).toHaveCount(0);
      await expect(phone.getByTestId("art-controls")).toHaveCount(0);
      await expect(phone.getByTestId("art-module")).toHaveCount(0);
    });

    test("i moduli Colori, Labirinto e Parola: tasti grandi sul telefono, disegni sulla TV, e sul telefono niente che sveli la soluzione", async ({ page }) => {
      const phone = page.locator(".phone-frame");
      const tv = page.locator(".screen-frame");
      await page.goto(`/preview?theme=${theme}&scene=art-colors&still=1`);
      await expect(phone.getByTestId("art-lamp-key")).toHaveCount(4);
      for (const key of await phone.getByTestId("art-lamp-key").all()) expect((await key.boundingBox())!.height, "tasto colore").toBeGreaterThanOrEqual(56);
      await expect(tv.getByTestId("art-lamp-keys")).toHaveCount(0);
      await expect(tv.locator(".art-lamp")).toHaveCount(4);
      await page.goto(`/preview?theme=${theme}&scene=art-maze&still=1`);
      await expect(phone.getByTestId("art-dpad").locator("button")).toHaveCount(4);
      for (const key of await phone.getByTestId("art-dpad").locator("button").all()) expect((await key.boundingBox())!.height, "freccia").toBeGreaterThanOrEqual(48);
      // la griglia sulla TV non ha muri: solo segni, posizione e arrivo
      const maze = tv.getByTestId("art-maze");
      await expect(maze).toBeVisible();
      await expect(maze.locator(".art-maze-walls")).toHaveCount(0);
      await expect(maze.locator(".art-maze-mark")).toHaveCount(2);
      await expect(maze.locator(".art-maze-goal")).toHaveCount(1);
      await expect(maze.locator(".art-maze-pos")).toHaveCount(1);
      await expect(phone.getByTestId("art-maze")).toHaveCount(0);
      await page.goto(`/preview?theme=${theme}&scene=art-word&still=1`);
      await expect(phone.getByTestId("art-spin-back")).toHaveCount(5);
      await expect(phone.getByTestId("art-spin-next")).toHaveCount(5);
      await expect(phone.getByTestId("art-submit")).toBeVisible();
      for (const key of [...(await phone.getByTestId("art-spin-back").all()), ...(await phone.getByTestId("art-spin-next").all())]) expect((await key.boundingBox())!.height, "tasto rotella").toBeGreaterThanOrEqual(40);
      // le lettere si vedono solo sulla TV
      await expect(tv.getByTestId("art-wheel-letter")).toHaveCount(5);
      await expect(phone.getByTestId("art-wheel-letter")).toHaveCount(0);
      for (const letter of await tv.getByTestId("art-wheel-letter").allTextContents()) expect(letter).toMatch(/^[A-Z]$/);
    });

    test("«ℹ️ Regole» apre la spiegazione con i numeri della partita e la sezione del proprio ruolo", async ({ page }) => {
      const phone = page.locator(".phone-frame");
      for (const [scene, role, mine] of [["art-wires", "artificiere", "Sei l'ARTIFICIERE"], ["art-manual", "esperto", "Sei un ESPERTO"], ["art-bet", "scommettitore", "hai 15 secondi per scommettere"]] as const) {
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        await phone.getByTestId("art-rules").click();
        const dialog = phone.getByTestId("art-rules-dialog");
        await expect(dialog, role).toBeVisible();
        await expect(dialog).toContainText(mine);
        await expect(dialog).toContainText("6 moduli");
        await expect(dialog).toContainText("timer di 5 minuti");
        await expect(dialog).toContainText("Con 3 errori la bomba esplode");
        const box = await dialog.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(box.sw, "regole: scorrimento orizzontale").toBeLessThanOrEqual(box.cw + 1);
        await dialog.getByRole("button", { name: "Ho capito" }).click();
        await expect(dialog).toHaveCount(0);
      }
    });

    test("il pulsante «Tieni premuto» ha touch-action: none e i tasti sono abbastanza grandi per il pollice", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=art-button&still=1`);
      const hold = page.locator(".phone-frame").getByTestId("art-hold");
      await expect(hold).toBeVisible();
      expect(await hold.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
      expect(await hold.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
      const box = (await hold.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(64);
      await page.goto(`/preview?theme=${theme}&scene=art-wires&still=1`);
      await expect(page.locator(".phone-frame").getByTestId("art-cut").first()).toBeVisible();
      for (const cut of await page.locator(".phone-frame").getByTestId("art-cut").all()) {
        expect((await cut.boundingBox())!.height, "tasto del filo").toBeGreaterThanOrEqual(36);
      }
      await page.goto(`/preview?theme=${theme}&scene=art-symbols&still=1`);
      const keys = page.locator(".phone-frame").getByTestId("art-key");
      await expect(keys.first()).toBeVisible();
      expect(await keys.count()).toBeGreaterThanOrEqual(3);
      for (const key of await keys.all()) expect((await key.boundingBox())!.width, "tasto simbolo").toBeGreaterThanOrEqual(48);
    });

    test("tutte le pagine del manuale si leggono senza scorrere in orizzontale e i simboli sono disegnati", async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=art-manual&still=1`);
      const phone = page.locator(".phone-frame .controller");
      const tabs = phone.getByTestId("art-tab");
      await expect(tabs.first()).toBeVisible();
      const count = await tabs.count();
      expect(count, "pagine del manuale").toBeGreaterThanOrEqual(10);
      const seen: string[] = [];
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).click();
        const page_ = phone.getByTestId("art-page");
        await expect(page_).toHaveCount(1);
        seen.push((await page_.locator("h3").textContent()) ?? "");
        const p = await sizes(phone);
        expect(p.sw, `pagina «${seen.at(-1)}»: scorrimento orizzontale`).toBeLessThanOrEqual(p.cw + 1);
        const own = await sizes(page_);
        expect(own.sw, `pagina «${seen.at(-1)}»: contenuto più largo della pagina`).toBeLessThanOrEqual(own.cw + 1);
        // niente testo troppo piccolo per essere letto (i simboli sono disegni, non testo)
        const tiny = await page_.evaluate((el) => [...el.querySelectorAll<HTMLElement>("p, li, td, th, h3, h4")].filter((n) => parseFloat(getComputedStyle(n).fontSize) < 7).map((n) => n.textContent));
        expect(tiny, `pagina «${seen.at(-1)}»: testo troppo piccolo`).toEqual([]);
      }
      expect(new Set(seen).size, "titoli diversi").toBe(count);
      expect(seen).toContain("Simboli");
      expect(seen).toContain("Colori");
      expect(seen).toContain("Parole");
      expect(seen.filter((s) => s.startsWith("Labirinti"))).toHaveLength(3);
      // i labirinti: 3 per pagina, disegnati con i muri (e due segni); le parole: un elenco leggibile
      await tabs.filter({ hasText: "Labirinti 1–3" }).click();
      const mazes = phone.getByTestId("art-maze-manual");
      await expect(mazes).toHaveCount(3);
      for (const m of await mazes.all()) {
        expect((await m.boundingBox())!.width, "labirinto del manuale").toBeGreaterThanOrEqual(90);
        await expect(m.locator(".art-maze-mark")).toHaveCount(2);
        expect(await m.locator(".art-maze-walls line").count(), "muri disegnati").toBeGreaterThan(20);
      }
      await tabs.filter({ hasText: "Parole" }).click();
      expect(await phone.getByTestId("art-words").locator("li").count(), "parole nell'elenco").toBeGreaterThanOrEqual(12);
      await tabs.filter({ hasText: "Colori" }).click();
      await expect(phone.getByTestId("art-page").locator("table")).toHaveCount(2);
      // la pagina dei simboli: 6 colonne da 7, ogni simbolo ha un disegno
      await tabs.filter({ hasText: "Simboli" }).click();
      const columns = phone.getByTestId("art-columns").locator("ol");
      await expect(columns).toHaveCount(6);
      for (const col of await columns.all()) await expect(col.locator("svg[data-symbol]")).toHaveCount(7);
      const empty = await phone.locator("svg[data-symbol]").evaluateAll((els) => els.filter((e) => e.children.length === 0).map((e) => e.getAttribute("data-symbol")));
      expect(empty, "simboli senza disegno").toEqual([]);
    });
  });
}
