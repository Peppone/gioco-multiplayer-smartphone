import { type Locator, expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80", "boom"] as const;
const SCENES = ["lo-pick", "lo-clue", "lo-guess", "lo-guess-psychic", "lo-guess-team", "lo-counter", "lo-reveal", "lo-reveal-team", "lo-final"] as const;
/** Scene in cui il telefono deve stare in una schermata, senza scorrere: si gioca col pollice sul quadrante. */
const NO_SCROLL = new Set(["lo-clue", "lo-guess", "lo-guess-team", "lo-counter"]);

const sizes = (l: Locator) => l.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));

/** Coordinate sullo schermo della posizione `pos` (0–100) del quadrante, a metà raggio. */
async function dialPoint(svg: Locator, pos: number) {
  const box = (await svg.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + (box.height * 100) / 110;
  const r = ((box.width * 92) / 200) * 0.6;
  const a = Math.PI * (1 - pos / 100);
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

// Le scene dell'anteprima mostrano schermo e telefono senza giocare una partita: qui si controllano layout, gesti e privacy.
for (const theme of THEMES) {
  test.describe(`anteprima Lunghezza d'Onda · tema ${theme}`, () => {
    for (const scene of SCENES) {
      test(`${scene}: niente overflow sul telefono e sullo schermo`, async ({ page }) => {
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone.locator(".lo-ctrl")).toBeVisible();
        const p = await sizes(phone);
        expect(p.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(p.cw + 1);
        if (NO_SCROLL.has(scene)) expect(p.sh, "il telefono non deve scorrere").toBeLessThanOrEqual(p.ch + 1);
        const s = await sizes(page.locator(".screen-frame .screen"));
        expect(s.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(s.cw + 1);
        expect(s.sh, "overflow verticale dello schermo").toBeLessThanOrEqual(s.ch + 1);
      });
    }
  });
}

test.describe("anteprima Lunghezza d'Onda · comportamento", () => {
  test("il quadrante del giocatore si trascina, senza gesti che rubano il trascinamento", async ({ page }) => {
    await page.goto("/preview?theme=gameshow&scene=lo-guess&still=1");
    const phone = page.locator(".phone-frame");
    const svg = phone.getByTestId("lo-dial");
    await svg.scrollIntoViewIfNeeded();
    const style = await svg.evaluate((e) => ({ touch: getComputedStyle(e).touchAction, select: getComputedStyle(e).userSelect }));
    expect(style.touch).toBe("none");
    expect(style.select).toBe("none");
    await expect(phone.getByTestId("lo-pos")).toHaveText("30");
    const from = await dialPoint(svg, 30);
    const to = await dialPoint(svg, 75);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const pos = Number(await phone.getByTestId("lo-pos").innerText());
    expect(Math.abs(pos - 75)).toBeLessThanOrEqual(1);
    expect(Number(await phone.getByTestId("lo-needle").getAttribute("data-pos"))).toBe(pos);
    // regolazione fine con i pulsanti
    await phone.getByRole("button", { name: "Più a destra" }).click();
    await expect(phone.getByTestId("lo-pos")).toHaveText(String(pos + 0.5));
  });

  test("il bersaglio si vede solo sul telefono del Sensitivo, e si copre con un tocco", async ({ page }) => {
    await page.goto("/preview?theme=gameshow&scene=lo-clue&still=1");
    const phone = page.locator(".phone-frame");
    const screen = page.locator(".screen-frame");
    await expect(phone.getByTestId("lo-bands")).toHaveAttribute("data-target", "23");
    await expect(phone.locator(".lo-band")).toHaveCount(5);
    await expect(screen.getByTestId("lo-bands")).toHaveCount(0);
    await expect(screen.getByTestId("lo-cover")).toHaveCount(1);
    await phone.getByTestId("lo-hide").click();
    await expect(phone.getByTestId("lo-bands")).toHaveCount(0);
    await expect(phone.getByTestId("lo-cover")).toHaveCount(1);
    await phone.getByTestId("lo-hide").click();
    await expect(phone.getByTestId("lo-bands")).toHaveCount(1);
  });

  test("tutti contro tutti: durante il voto lo schermo non mostra posizioni", async ({ page }) => {
    await page.goto("/preview?theme=gameshow&scene=lo-guess&still=1");
    const screen = page.locator(".screen-frame");
    await expect(screen.getByTestId("lo-clue")).toContainText("Parlare dell'ex");
    await expect(screen.locator(".lo-dot")).toHaveCount(0);
    await expect(screen.getByTestId("lo-needle")).toHaveCount(0);
    await expect(screen.getByTestId("lo-confirmed")).toContainText("Confermati 17 / 29");
  });

  test("a squadre: pallini dei compagni e mediana dal vivo, sullo schermo e sul telefono", async ({ page }) => {
    await page.goto("/preview?theme=gameshow&scene=lo-guess-team&still=1");
    const screen = page.locator(".screen-frame");
    await expect(screen.locator(".lo-dot")).toHaveCount(3);
    await expect(screen.getByTestId("lo-needle")).toHaveAttribute("data-pos", "24.5");
    await expect(screen.getByTestId("lo-scores")).toContainText("Rossi 6");
    const phone = page.locator(".phone-frame");
    // sul telefono di Anna i pallini sono quelli dei compagni (non il proprio) e la mediana è tratteggiata
    await expect(phone.locator(".lo-dot")).toHaveCount(2);
    await expect(phone.locator(".lo-needle-ghost")).toHaveCount(1);
    await expect(phone.getByTestId("lo-confirm")).toHaveAttribute("data-confirmed", "true");
  });

  test("scommessa: due pulsanti e le scelte dei compagni", async ({ page }) => {
    await page.goto("/preview?theme=gameshow&scene=lo-counter&still=1");
    const phone = page.locator(".phone-frame");
    await expect(phone.locator('[data-dir="right"]')).toHaveAttribute("data-chosen", "true");
    await expect(phone.locator('[data-dir="left"]')).toHaveAttribute("data-chosen", "false");
    await expect(phone.getByTestId("lo-team-counter")).toContainText("Dario: ⬅");
    await expect(page.locator(".screen-frame").getByTestId("lo-counter-info")).toContainText("2 / 7");
  });

  test("rivelazione con 29 giocatori: i pallini vicini si raggruppano e non si sovrappongono", async ({ page }) => {
    await page.goto("/preview?theme=gameshow&scene=lo-reveal&still=1");
    const screen = page.locator(".screen-frame");
    await expect(screen.getByTestId("lo-bands")).toHaveAttribute("data-target", "23");
    await expect(screen.locator(".lo-dot").first()).toBeAttached();
    const positions = (await screen.locator(".lo-dot").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-pos"))))).sort((a, b) => a - b);
    expect(positions.length).toBeLessThan(29);
    for (let i = 1; i < positions.length; i++) expect(positions[i]! - positions[i - 1]!).toBeGreaterThan(1.5);
    // textContent: sugli elementi SVG innerText non è definito
    const labels = await screen.locator(".lo-dot text").allTextContents();
    const total = labels.reduce((sum, l) => sum + (/^\d+$/.test(l) ? Number(l) : 1), 0);
    expect(total).toBe(29);
    await expect(screen.getByTestId("lo-results")).toContainText("Sensitivo Carla: +34");
  });

  test("le regole si aprono dal telefono con i numeri della partita", async ({ page }) => {
    await page.goto("/preview?theme=gameshow&scene=lo-guess&still=1");
    const phone = page.locator(".phone-frame");
    await phone.getByTestId("lo-rules").click();
    const dialog = phone.getByRole("dialog", { name: "Regole del gioco" });
    await expect(dialog).toContainText("100 punti al centro");
    await expect(dialog).toContainText("8 turni");
    await dialog.getByRole("button", { name: "Ho capito" }).click();
    await expect(dialog).toHaveCount(0);
  });
});
