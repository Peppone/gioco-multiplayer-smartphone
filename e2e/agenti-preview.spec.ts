import { type Locator, expect, test } from "@playwright/test";
import { cardTextVars } from "../packages/client/src/minigames/agenti-segreti/cardText";
import { AGENTI_SEGRETI_WORDS } from "../packages/server/src/seed-words";

const THEMES = ["gameshow", "pixel", "manga", "retro80", "boom"] as const;
const SCENES = ["as-setup", "as-clue", "as-guess", "as-guess-spy", "as-wrong", "as-assassin", "as-reveal", "as-small"] as const;
/** Scene in cui il telefono deve stare in una schermata, senza scorrere: si gioca con la griglia sotto il pollice. */
const NO_SCROLL = new Set(["as-clue", "as-guess", "as-guess-spy", "as-wrong", "as-small"]);

const sizes = (l: Locator) => l.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));

/** Le parole che escono dalla loro carta (larghezza del testo oltre lo spazio interno della carta). */
const overflowing = (grid: Locator) =>
  grid.evaluate((g) =>
    [...g.querySelectorAll<HTMLElement>(".as-card")].flatMap((card) => {
      const word = card.querySelector<HTMLElement>(".as-word")!;
      const room = card.clientWidth - parseFloat(getComputedStyle(card).paddingLeft) - parseFloat(getComputedStyle(card).paddingRight);
      return word.getBoundingClientRect().width > room + 0.5 ? [`${word.textContent} (${Math.round(word.getBoundingClientRect().width)}/${Math.round(room)}px)`] : [];
    }),
  );

// Le scene dell'anteprima mostrano schermo e telefono senza giocare una partita: qui si controllano layout e privacy.
for (const theme of THEMES) {
  test.describe(`anteprima Agenti Segreti · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow sul telefono e sullo schermo`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone.locator(".as-ctrl")).toBeVisible();
        const p = await sizes(phone);
        expect(p.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(p.cw + 1);
        if (NO_SCROLL.has(scene)) expect(p.sh, "il telefono non deve scorrere").toBeLessThanOrEqual(p.ch + 1);
        const s = await sizes(page.locator(".screen-frame .screen"));
        expect(s.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(s.cw + 1);
        expect(s.sh, "overflow verticale dello schermo").toBeLessThanOrEqual(s.ch + 1);
        if (scene !== "as-setup") {
          expect(await overflowing(phone.getByTestId("as-grid")), "parole fuori dalla carta sul telefono").toEqual([]);
          expect(await overflowing(page.locator(".screen-frame").getByTestId("as-grid")), "parole fuori dalla carta sullo schermo").toEqual([]);
        }
        expect(errors).toEqual([]);
      });
    }

    // Nel tema pixel il font è largo quanto è alto: le parole lunghe vanno su due righe, mai di più.
    const maxLines = theme === "pixel" ? 2 : 1;
    test(`tutte le 300 parole della lista iniziale (nel database) stanno nella carta del telefono (al massimo ${maxLines} ${maxLines === 1 ? "riga" : "righe"})`, async ({ page }) => {
      await page.goto(`/preview?theme=${theme}&scene=as-guess&still=1`);
      const grid = page.locator(".phone-frame").getByTestId("as-grid");
      await expect(grid.locator(".as-card")).toHaveCount(25);
      const bad: string[] = [];
      // Si riempiono le 25 carte con le parole della lista, 25 alla volta, con le stesse variabili CSS della vista.
      for (let i = 0; i < AGENTI_SEGRETI_WORDS.length; i += 25) {
        const batch = AGENTI_SEGRETI_WORDS.slice(i, i + 25).map((w) => ({ w, vars: cardTextVars(w) as Record<string, number> }));
        await grid.evaluate((g, words) => {
          g.querySelectorAll<HTMLElement>(".as-card").forEach((card, j) => {
            const item = words[j % words.length]!;
            for (const [k, val] of Object.entries(item.vars)) card.style.setProperty(k, String(val));
            card.querySelector(".as-word")!.textContent = item.w;
          });
        }, batch);
        bad.push(...(await overflowing(grid)));
        const tall = await grid.evaluate(
          (g, max) =>
            [...g.querySelectorAll<HTMLElement>(".as-word")]
              .filter((w) => Math.round(w.getBoundingClientRect().height / parseFloat(getComputedStyle(w).lineHeight)) > max)
              .map((w) => `${w.textContent} (troppe righe)`),
          maxLines,
        );
        bad.push(...tall);
        const tiny = await grid.evaluate((g) => [...g.querySelectorAll<HTMLElement>(".as-word")].filter((w) => parseFloat(getComputedStyle(w).fontSize) < 6.4).map((w) => `${w.textContent} (testo troppo piccolo)`));
        bad.push(...tiny);
      }
      expect([...new Set(bad)]).toEqual([]);
    });
  });
}

test.describe("anteprima Agenti Segreti · comportamento", () => {
  test("gli agenti non hanno il colore delle carte coperte nel DOM; le scoperte sì", async ({ page }) => {
    await page.goto("/preview?theme=retro80&scene=as-guess&still=1");
    const cards = page.locator(".phone-frame").getByTestId("as-card");
    await expect(cards).toHaveCount(25);
    const attrs = await cards.evaluateAll((els) => els.map((e) => ({ revealed: e.getAttribute("data-revealed"), kind: e.getAttribute("data-kind"), label: e.getAttribute("aria-label") ?? "" })));
    for (const a of attrs.filter((x) => x.revealed === "false")) {
      expect(a.kind).toBeNull();
      expect(a.label).not.toMatch(/agente|civile|assassino/);
    }
    expect(attrs.filter((x) => x.revealed === "true").every((x) => x.kind)).toBe(true);
    // anche la TV
    const screenKinds = await page.locator(".screen-frame").getByTestId("as-card").evaluateAll((els) => els.filter((e) => e.getAttribute("data-revealed") === "false" && e.hasAttribute("data-kind")).length);
    expect(screenKinds).toBe(0);
  });

  test("il Capo-spia vede la mappa e la copre con «Nascondi»", async ({ page }) => {
    await page.goto("/preview?theme=gameshow&scene=as-guess-spy&still=1");
    const phone = page.locator(".phone-frame");
    const coveredWithKind = () => phone.getByTestId("as-card").evaluateAll((els) => els.filter((e) => e.getAttribute("data-revealed") === "false" && e.hasAttribute("data-kind")).length);
    await expect(phone.getByTestId("as-card")).toHaveCount(25);
    expect(await coveredWithKind()).toBe(20);
    await phone.getByTestId("as-hide").click();
    await expect.poll(coveredWithKind).toBe(0);
    await expect(phone.getByTestId("as-hide")).toHaveText(/Mostra/);
    await phone.getByTestId("as-hide").click();
    await expect.poll(coveredWithKind).toBe(20);
    await expect(phone.getByTestId("as-status")).toContainText("non fare facce");
  });

  test("i voti compaiono come pallini sulle carte, sulla TV e sul telefono, con «Passa» e i confermati", async ({ page }) => {
    await page.goto("/preview?theme=manga&scene=as-guess&still=1");
    const screen = page.locator(".screen-frame");
    await expect(screen.getByTestId("as-card").nth(2).locator(".as-dots i")).toHaveCount(6);
    await expect(screen.getByTestId("as-card").nth(4).locator(".as-dots i")).toHaveCount(4);
    await expect(screen.getByTestId("as-confirmed")).toContainText("Passa: 1 · Confermati 5 / 14");
    await expect(screen.getByTestId("as-clue")).toContainText("«Viaggio»");
    const phone = page.locator(".phone-frame");
    await expect(phone.getByTestId("as-card").nth(2)).toHaveAttribute("data-mine", "true");
    await expect(phone.getByTestId("as-pass")).toContainText("Passa (1)");
    // le carte coperte del telefono sono pulsanti grandi abbastanza per un dito
    const box = (await phone.locator("button.as-card").first().boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.width).toBeGreaterThanOrEqual(56);
  });

  test("l'indizio del Capo-spia: parola, numero da 0 a 9 o ∞, Invia solo quando c'è tutto, motivo del rifiuto", async ({ page }) => {
    await page.goto("/preview?theme=boom&scene=as-clue&still=1");
    const phone = page.locator(".phone-frame");
    await expect(phone.getByRole("group", { name: "Quante carte" }).getByRole("button")).toHaveCount(11);
    const send = phone.getByTestId("as-clue-send");
    await expect(send).toBeDisabled();
    await phone.getByTestId("as-clue-input").fill("Oceano");
    await expect(send).toBeDisabled();
    await phone.getByRole("button", { name: "∞" }).click();
    await expect(phone.getByRole("button", { name: "∞" })).toHaveAttribute("aria-pressed", "true");
    await expect(send).toBeEnabled();
    await expect(phone.getByTestId("as-clue-error")).toHaveText("«Balena» è una parola della griglia");
    await expect(page.locator(".screen-frame").getByTestId("as-thinking")).toContainText("pensa a un indizio");
  });

  test("le regole si aprono dal telefono con i numeri della partita", async ({ page }) => {
    await page.goto("/preview?theme=pixel&scene=as-guess&still=1");
    const phone = page.locator(".phone-frame");
    await phone.getByTestId("as-rules").click();
    await expect(phone.locator(".gf-rules")).toContainText("Sei un AGENTE");
    await expect(phone.locator(".gf-rules")).toContainText("ha 9 agenti da trovare, l'altra 8");
  });

  test("l'assassino: esito sulla TV e mappa intera", async ({ page }) => {
    await page.goto("/preview?theme=retro80&scene=as-assassin&still=1");
    const screen = page.locator(".screen-frame");
    await expect(screen.getByTestId("as-outcome")).toContainText("Vince la squadra Blu");
    await expect(screen.getByTestId("as-outcome")).toContainText("Rossi ha scoperto l'assassino");
    const kinds = await screen.getByTestId("as-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
    expect(kinds.every(Boolean)).toBe(true);
  });
});
