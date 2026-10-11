import { expect, test } from "@playwright/test";

const THEMES = ["gameshow", "pixel", "manga", "retro80"] as const;
const SOUNDS = ["start", "tick", "buzz", "correct", "wrong", "reveal", "fanfare"];

// Verifiche sul DOM e sugli stili calcolati: niente screenshot.
test.describe("theme pack", () => {
  test("ogni tema applica sfondo, font e forma propri", async ({ page }) => {
    const seen: Record<string, { bg: string; font: string; radius: string }> = {};
    for (const theme of THEMES) {
      await page.goto(`/preview?theme=${theme}&scene=quiz-question&still=1`);
      const screen = page.locator('main.screen[data-theme]');
      await expect(screen).toHaveAttribute("data-theme", theme);
      seen[theme] = await screen.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.getPropertyValue("--bg").trim(),
          font: cs.fontFamily,
          radius: getComputedStyle(el.querySelector(".option")!).borderRadius,
        };
      });
    }
    // Sfondi tutti diversi; font specifici per tema; il pixel è squadrato
    expect(new Set(Object.values(seen).map((s) => s.bg)).size).toBe(4);
    expect(seen.gameshow!.font).toContain("Montserrat");
    expect(seen.pixel!.font).toContain("Press Start 2P");
    expect(seen.manga!.font).toContain("Bangers");
    expect(seen.retro80!.font).toContain("Orbitron");
    expect(seen.pixel!.radius).toBe("0px");
    expect(seen.gameshow!.radius).not.toBe("0px");
  });

  test("i font dei temi sono serviti in locale (nessuna richiesta a CDN esterni)", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("http://localhost")) external.push(r.url());
    });
    for (const theme of THEMES) {
      await page.goto(`/preview?theme=${theme}&still=1`);
      await page.evaluate(() => document.fonts.ready);
    }
    expect(external).toEqual([]);
  });

  test("tutti i suoni di tutti i temi esistono e sono WAV validi", async ({ request }) => {
    for (const theme of THEMES) {
      for (const sound of SOUNDS) {
        const res = await request.get(`/sounds/${theme}/${sound}.wav`);
        expect(res.status(), `${theme}/${sound}`).toBe(200);
        const body = await res.body();
        expect(body.subarray(0, 4).toString(), `${theme}/${sound} header`).toBe("RIFF");
        expect(body.length).toBeGreaterThan(500);
      }
    }
  });

  test("il manga mostra le onomatopee solo nel suo tema", async ({ page }) => {
    await page.goto("/preview?theme=manga&scene=quiz-reveal&still=1");
    await expect(page.locator(".sfx")).toContainText("DON!");
    await page.goto("/preview?theme=gameshow&scene=quiz-reveal&still=1");
    await expect(page.locator(".sfx")).toHaveCount(0);
  });

  test("la classifica mostra squadre e giocatori ordinati con i rispettivi punti", async ({ page }) => {
    await page.goto("/preview?theme=retro80&scene=results&still=1");
    const teams = page.locator(".lb-table", { hasText: "Squadre" }).locator("li");
    await expect(teams).toHaveCount(2);
    await expect(teams.first()).toContainText("Rossi");
    await expect(page.locator(".lb-table", { hasText: "Giocatori" }).locator("li")).toHaveCount(4);
  });
});

test("il telefono resta leggero: il codice di regia e schermo non viene caricato su /play", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".js")) scripts.push(r.url());
  });
  await page.goto("/play");
  await expect(page.getByRole("heading", { name: "Crea il tuo profilo" })).toBeVisible();
  expect(scripts.some((u) => /Admin-/.test(u)), "chunk Admin").toBe(false);
  expect(scripts.some((u) => /Screen-/.test(u)), "chunk Screen").toBe(false);
  expect(scripts.some((u) => /Preview-/.test(u)), "chunk Preview").toBe(false);
});
