import { expect } from "@playwright/test";
import { test as base } from "@playwright/test";
import { type Client, test } from "./support";

const THEMES = ["gameshow", "pixel", "manga", "retro80"] as const;
const SCENES = ["shadow-intro", "shadow-choose", "shadow-react", "shadow-reward", "shadow-out", "shadow-bye", "shadow-podium"] as const;

// Le scene dell'anteprima mostrano schermo e telefono senza giocare una partita: qui si controllano layout e testi.
for (const theme of THEMES) {
  base.describe(`anteprima Shadow Tournament · tema ${theme}`, () => {
    for (const scene of SCENES) {
      base(`${scene}: niente overflow orizzontale e testi in italiano`, async ({ page }) => {
        await page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);
        const phone = page.locator(".phone-frame .controller");
        await expect(phone).toBeVisible();
        const p = await phone.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(p.sw, "overflow orizzontale del telefono").toBeLessThanOrEqual(p.cw + 1);
        const s = await page.locator(".screen-frame .screen").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(s.sw, "overflow orizzontale dello schermo").toBeLessThanOrEqual(s.cw + 1);
      });
    }
  });
}

base("anteprima: con 30 giocatori il tabellone li mostra tutti e le carte della mano sono grandi quanto un dito", async ({ page }) => {
  await page.goto("/preview?theme=manga&scene=shadow-choose&still=1");
  await expect(page.locator(".screen-frame .sh-board li")).toHaveCount(30);
  await expect(page.locator(".screen-frame .sh-focus")).toContainText("VS");
  const hand = page.locator(".phone-frame .sh-handcard");
  await expect(hand).toHaveCount(3);
  const box = await hand.first().boundingBox();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".phone-frame").getByText("Scommessa (2 token)")).toBeVisible();
});

base("anteprima: le regole stanno sullo schermo (a colonne) e sul telefono, con i numeri della partita", async ({ page }) => {
  await page.goto("/preview?theme=manga&scene=shadow-intro&still=1");
  const screen = page.locator(".screen-frame");
  await expect(screen.getByRole("heading", { name: "Come si gioca" })).toBeVisible();
  await expect(screen.locator(".sh-intro-grid section")).toHaveCount(7);
  await expect(screen.getByText("Attacco batte Raggiro, Raggiro batte Difesa, Difesa batte Attacco")).toBeVisible();
  await expect(screen.getByText("Scudo (1 token)")).toBeVisible();
  await expect(screen.getByText("Mazzo Leggendario (8 carte)")).toBeVisible();
  await expect(page.locator(".phone-frame .sh-intro-phone section")).toHaveCount(7);
  // dal telefono le regole si riaprono anche in gioco con il «?»
  await page.goto("/preview?theme=manga&scene=shadow-choose&still=1");
  await page.locator(".phone-frame").getByRole("button", { name: "Regole" }).click();
  await expect(page.locator(".phone-frame .gf-rules")).toContainText("Scommessa (2 token)");
});

base("anteprima: le reazioni mostrano solo ciò che si può fare, con il costo", async ({ page }) => {
  await page.goto("/preview?theme=manga&scene=shadow-react&still=1");
  const phone = page.locator(".phone-frame");
  await expect(phone.getByRole("button", { name: /Scudo \(1 token\)/ })).toBeVisible();
  await expect(phone.getByRole("button", { name: /Trappola \(1 token\)/ })).toBeVisible();
  await expect(phone.getByRole("button", { name: /Cambia carta \(2 token\)/ })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Niente" })).toBeVisible();
});

/** Un tocco alla volta, con ciò che serve in quel momento: le scelte non contano, il torneo deve solo finire. */
async function act(c: Client): Promise<boolean> {
  const p = c.page;
  const click = async (loc: ReturnType<typeof p.locator>) => {
    const first = loc.first();
    if (!(await first.isVisible()) || !(await first.isEnabled())) return false;
    await first.click({ timeout: 2_000 }).catch(() => undefined);
    return true;
  };
  if (await click(p.getByRole("button", { name: "No, grazie" }))) return true;
  if (await click(p.getByRole("button", { name: /^NPC:/ }))) return true;
  if (await click(p.getByRole("button", { name: "Niente" }))) return true;
  if (await click(p.getByRole("button", { name: "Lascia stare" }))) return true;
  if (await click(p.getByRole("button", { name: /^Normale:/ }))) return true;
  if (await click(p.getByRole("button", { name: /vite? in meno nel prossimo scontro/ }))) return true;
  if ((await p.locator(".sh-actions button", { hasText: /vite|\)/ }).count()) === 0 && (await p.getByText(/Chi vince lo scontro in evidenza/).isVisible())) {
    if (await click(p.locator(".sh-actions button").first())) return true;
  }
  if ((await p.locator(".sh-handcard.chosen").count()) === 0 && (await p.getByText("Scegli la tua carta").isVisible())) {
    const cards = p.locator(".sh-handcard:enabled");
    const n = await cards.count();
    if (n > 0) {
      await cards.nth(Math.floor(Math.random() * n)).click({ timeout: 2_000 }).catch(() => undefined);
      return true;
    }
  }
  return false;
}

test("un torneo da 4 telefoni: W/L, numero dispari con NPC, fino alla classifica, senza trapelare le scelte", async ({ newGame }) => {
  test.setTimeout(240_000);
  const g = await newGame(
    [
      {
        typeId: "shadow-tournament",
        title: "Shadow e2e",
        theme: "manga",
        config: {
          introSec: 4,
          startLives: 1,
          startTokens: 1,
          extraLifeSec: 20,
          chooseSec: 20,
          reactSec: 3,
          showSec: 1,
          rewardSec: 20,
          byeSec: 20,
          turnPauseSec: 1,
          normalDeck: [{ label: "+1 token", qty: 1, tokens: 1, nextLives: 0, either: false }],
          legendaryDeck: [{ label: "Neutra", qty: 1, tokens: 0, nextLives: 0, either: false }],
        },
      },
    ],
    { playersPerTeam: 2 },
  );
  const { screen, admin } = g;
  const phones = [...g.reds, ...g.blues];

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  // prima del primo turno le regole compaiono sullo schermo e sui telefoni
  await expect(screen.page.getByRole("heading", { name: "Come si gioca" })).toBeVisible();
  await expect(phones[0]!.page.getByRole("heading", { name: "Come si gioca" })).toBeVisible();
  await expect(screen.page.getByText("Turno 1")).toBeVisible();
  await expect(screen.page.locator(".sh-board li")).toHaveCount(4);
  await expect(screen.page.getByLabel("Scontro in evidenza")).toBeVisible();
  // le regole sono sempre a un tocco, con i costi del gioco
  await phones[0]!.page.getByRole("button", { name: "Regole" }).click();
  await expect(phones[0]!.page.getByText("Scudo (1 token")).toBeVisible();
  await phones[0]!.page.getByRole("button", { name: "Ho capito" }).click();

  // I quattro giocano finché lo schermo mostra la classifica del round (turni, Bye/NPC e pronostici compresi).
  const leaderboard = screen.page.getByText("Classifica dopo il round 1");
  let sawNpc = false;
  const deadline = Date.now() + 200_000;
  while (Date.now() < deadline && !(await leaderboard.isVisible())) {
    for (const c of phones) {
      if (!sawNpc && (await c.page.getByRole("button", { name: /^NPC:/ }).isVisible())) sawNpc = true;
      await act(c);
    }
    await screen.page.waitForTimeout(150);
  }
  await expect(leaderboard).toBeVisible();
  expect(sawNpc, "con 3 giocatori rimasti la regia deve offrire Bye o NPC").toBe(true);

  // Classifica serata: il vincitore del torneo ha almeno 1000 punti di piazzamento, gli altri molto meno.
  const rows = screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText(/1[01]\d\d/);

  // Nessun frame verso schermo e telefoni ha mai contenuto lo stato grezzo delle scelte segrete.
  for (const c of [screen, ...phones]) {
    const text = c.traffic.text();
    expect(text).not.toContain('"picks"');
    expect(text).not.toContain('"reacts"');
    expect(text).not.toContain('"pendingSwap"');
  }
});
