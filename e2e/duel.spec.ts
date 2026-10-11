import { expect } from "@playwright/test";
import { type Client, lastPlayerView, test } from "./support";

const POOL = [
  {
    typeId: "vero-falso",
    title: "Raffica duello",
    theme: "retro80",
    config: { statements: [{ text: "Il mare è salato.", answer: true }], timeSec: 10, revealSec: 1, wrongPenalty: 0 },
  },
];
const CONFIG = { hp: 8, minigamesPerBattle: 1, maxBattles: 3, draftSeconds: 30, battleSeconds: 30, winnerPoints: 500, loserPoints: 100 };

/** Un passo di un giocatore-bot: risponde al minigioco (Rossi VERO, Blu FALSO) o sceglie la prima carta e conferma. */
async function act(client: Client, role: "red" | "blue") {
  const p = client.page;
  const answer = p.locator(".duel-minigame .tf-btn:not([disabled])");
  if (await answer.count()) {
    await p.getByRole("button", { name: role === "red" ? "VERO" : "FALSO", exact: true }).click();
    return;
  }
  const confirm = p.getByRole("button", { name: /^Conferma (la carta|le carte)$/ });
  if ((await confirm.count()) && (await confirm.isEnabled())) {
    await p.locator(".card-picker .peekable").first().click();
    await confirm.click();
  }
}

test("duello completo con 4 telefoni: minigioco, draft segreto, battaglia simultanea, esito e punti serata", async ({ newGame }) => {
  const g = await newGame([], { playersPerTeam: 2, duel: { pool: POOL, config: CONFIG } });
  const { screen, admin, reds, blues, teams } = g;
  const [r1, r2] = reds as [Client, Client];
  const [b1, b2] = blues as [Client, Client];

  // ---- Avvio: il duello è un unico round ----
  await admin.page.getByRole("button", { name: /Avvia round 1: Duello dei Cavalieri/ }).click();
  await expect(screen.page.locator(".duel-screen")).toBeVisible();
  await expect(screen.page.getByText("Il mare è salato.")).toBeVisible();
  await expect(screen.page.getByText(/Battaglia 1 di 3/)).toBeVisible();
  for (const c of [r1, r2, b1, b2]) await expect(c.page.locator(".duel-minigame .tf-btn")).toHaveCount(2);

  // ---- Minigioco: i Rossi rispondono giusto, i Blu sbagliato → i Rossi scelgono per primi ----
  for (const c of [r1, r2]) await c.page.getByRole("button", { name: "VERO", exact: true }).click();
  for (const c of [b1, b2]) await c.page.getByRole("button", { name: "FALSO", exact: true }).click();

  // ---- Draft: solo il team che sceglie vede le carte ----
  await expect(screen.page.getByText(`${teams.red.name} sta scegliendo una carta`)).toBeVisible();
  await expect(r1.page.locator(".card-picker .duel-card:not(.back)")).toHaveCount(3);
  for (const spectator of [screen, b1, b2]) {
    await expect(spectator.page.locator(".duel-draft .duel-card.back")).toHaveCount(3);
    await expect(spectator.page.locator(".duel-draft .duel-card:not(.back)")).toHaveCount(0);
  }
  const offered = (lastPlayerView(r1.traffic)!.draft.cards as { uid: string }[]).map((c) => c.uid);
  expect(offered).toHaveLength(3);
  for (const uid of offered) {
    expect(screen.traffic.text(), `schermo non deve vedere ${uid}`).not.toContain(uid);
    expect(b1.traffic.text(), `blu non deve vedere ${uid}`).not.toContain(uid);
  }

  // I compagni vedono in tempo reale la scelta dell'altro; la carta si ingrandisce solo tenendola premuta
  await r1.page.locator(".card-picker .peekable").first().click();
  await expect(r2.page.locator(".card-picker .card-badges i").first()).toHaveText("A"); // iniziale di «Ada…»
  const redPick = lastPlayerView(r1.traffic)!.draft.vote.mine[0] as string;
  await r2.page.locator(".card-picker .peekable").first().click();
  await r1.page.getByRole("button", { name: "Conferma la carta" }).click();
  await r2.page.getByRole("button", { name: "Conferma la carta" }).click();

  // Tocca ai Blu: vedono solo le 2 carte rimaste, e la carta scelta dai Rossi non transita da loro
  await expect(b1.page.locator(".card-picker .duel-card:not(.back)")).toHaveCount(2);
  await expect(screen.page.getByText(`${teams.blue.name} sta scegliendo una carta`)).toBeVisible();
  expect(b1.traffic.text(), "la carta scelta dai Rossi non arriva ai Blu").not.toContain(redPick);
  await act(b1, "blue");
  await act(b2, "blue");

  // ---- Battaglia: scelte segrete, simultanee ----
  await expect(screen.page.getByText(/Scegliete le carte in segreto/)).toBeVisible();
  await expect(r1.page.getByRole("button", { name: "Conferma le carte" })).toBeVisible();
  const redHand = (lastPlayerView(r1.traffic)!.hand as { uid: string }[]).map((c) => c.uid);
  expect(redHand.length).toBeGreaterThan(0);
  for (const uid of redHand) {
    expect(screen.traffic.text(), "la mano dei Rossi non arriva allo schermo").not.toContain(uid); // lo schermo non ha mai visto quella carta
    expect(b1.traffic.text(), "la mano dei Rossi non arriva ai Blu").not.toContain(uid);
  }
  expect(screen.traffic.text()).not.toMatch(/"hand":/);

  await act(r1, "red");
  await expect(r2.page.locator(".card-picker .card-badges i").first()).toHaveText("A");
  await act(r2, "red");
  await act(b1, "blue");
  await act(b2, "blue");

  // Rivelazione simultanea: lo schermo mostra le carte giocate dei due lati e racconta lo scontro
  await expect(screen.page.locator(".battle-replay")).toBeVisible();
  await expect(screen.page.locator(".battle-replay .played .duel-card:not(.back)").first()).toBeVisible();
  await expect(screen.page.locator(".battle-replay .battle-log li").first()).toBeVisible();

  // ---- Il resto del duello, giocato dai bot, fino all'esito ----
  const winner = screen.page.locator(".duel-ended .winner");
  const deadline = Date.now() + 90_000;
  while (!(await winner.isVisible()) && Date.now() < deadline) {
    for (const c of reds) await act(c, "red").catch(() => undefined);
    for (const c of blues) await act(c, "blue").catch(() => undefined);
    await screen.page.waitForTimeout(250);
  }
  await expect(winner).toContainText("Vince");
  const winnerIsRed = (await winner.innerText()).includes(teams.red.name);
  const [winners, losers] = winnerIsRed ? [reds, blues] : [blues, reds];
  for (const c of winners) await expect(c.page.locator(".duel-ended")).toContainText("Avete vinto");
  for (const c of losers) await expect(c.page.locator(".duel-ended")).toContainText("Sconfitta");

  // ---- Chiusura: la regia conclude il duello e solo l'esito dà punti serata ----
  await admin.page.getByRole("button", { name: "Concludi il duello" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  const players = screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li");
  await expect(players.filter({ hasText: "500" })).toHaveCount(2);
  await expect(players.filter({ hasText: "100" })).toHaveCount(2);
});

test("la regia configura il duello dall'editor: sfidanti, minigiochi e mazzo", async ({ browser, request }) => {
  const { adminApi, adminToken, openAdmin, unique } = await import("./support");
  const token = await adminToken(request);
  const api = adminApi(request, token);

  const redName = unique("Rossi");
  const blueName = unique("Blu");
  const red = await api.call<{ id: string }>("post", "/teams", { name: redName, color: "#ef4444", emblem: "🔥" });
  const blue = await api.call<{ id: string }>("post", "/teams", { name: blueName, color: "#3b82f6", emblem: "🌊" });
  const eventName = unique("Serata duello");
  const event = await api.call<{ id: string }>("post", "/events", { name: eventName });
  await api.call("put", `/events/${event.id}/teams`, { teamIds: [red.id, blue.id] });
  const instTitle = unique("Raffica");
  await api.call("post", "/instances", { typeId: "vero-falso", title: instTitle, config: { statements: [{ text: "x", answer: true }] } });
  const deckTitle = unique("Mazzo");
  const deckSample = ((await api.call<{ id: string; sampleConfig: unknown }[]>("get", "/minigame-types")).find((t) => t.id === "deck"))!.sampleConfig;
  await api.call("post", "/instances", { typeId: "deck", title: deckTitle, config: deckSample });

  const admin = await openAdmin(browser, token);
  const { page } = admin;
  await page.getByRole("button", { name: "Serate" }).click();
  await page.locator(".list li", { hasText: eventName }).getByRole("button", { name: "Apri" }).click();

  // Nuova partita in modalità duello
  await page.getByPlaceholder("Nome partita").fill("Finale");
  await page.locator("form.row select").selectOption("knight-duel");
  await page.getByRole("button", { name: "Aggiungi" }).click();
  const match = page.locator(".match", { hasText: "Finale" });
  await expect(match).toContainText("Duello dei Cavalieri");
  await expect(match.getByText("Nessun round")).toHaveCount(0); // un duello non ha round da comporre

  await match.getByRole("button", { name: "Configura il duello" }).click();
  // squadre presenti nella serata come sfidanti (con la loro emoji)
  await match.getByLabel("Primo sfidante").selectOption({ label: `🔥 ${redName}` });
  await match.getByLabel("Secondo sfidante").selectOption({ label: `🌊 ${blueName}` });
  // il minigioco si sceglie dalla libreria (solo minigiochi, non mazzi)
  const pool = match.getByLabel("Minigioco 1");
  await expect(pool.locator("option", { hasText: deckTitle })).toHaveCount(0);
  await pool.selectOption({ label: instTitle });
  await match.getByLabel("Mazzo di carte").selectOption({ label: deckTitle });
  await match.getByLabel("Punti vita dei cavalieri").fill("15");
  await match.getByRole("button", { name: "Salva configurazione" }).click();
  await expect(match.getByText("Configurazione salvata.")).toBeVisible();

  const matches = await api.call<{ matches: { name: string; mode: string; modeConfig: any }[] }>("get", `/events/${event.id}`);
  const saved = matches.matches.find((m) => m.name === "Finale")!;
  expect(saved.mode).toBe("knight-duel");
  expect(saved.modeConfig).toMatchObject({ kind: "teams", hp: 15, sideA: red.id, sideB: blue.id });
  expect(saved.modeConfig.pool).toHaveLength(1);

  // Sfidanti uguali: il server lo rifiuta con un messaggio comprensibile
  await match.getByLabel("Secondo sfidante").selectOption({ label: `🔥 ${redName}` });
  await match.getByRole("button", { name: "Salva configurazione" }).click();
  await expect(match.locator(".error")).toContainText("diversi");
});

// ---- Interfaccia del duello nell'anteprima: verifiche su DOM e stili, senza screenshot ----
const THEMES = ["gameshow", "pixel", "manga", "retro80"] as const;
const open = (page: import("@playwright/test").Page, theme: string, scene: string) => page.goto(`/preview?theme=${theme}&scene=${scene}&still=1`);

test.describe("interfaccia del duello (anteprima)", () => {
  test("draft: lo schermo mostra solo dorsi, il telefono del team che sceglie le carte e i voti dei compagni", async ({ page }) => {
    await open(page, "pixel", "duel-draft");
    const screen = page.locator(".screen-frame");
    await expect(screen.getByText("Rossi sta scegliendo una carta")).toBeVisible();
    await expect(screen.locator(".duel-card.back")).toHaveCount(3);
    await expect(screen.locator(".duel-card:not(.back)")).toHaveCount(0);
    await expect(screen.getByText("Rossi: 1/3 hanno deciso")).toBeVisible();

    const phone = page.locator(".phone-frame");
    await expect(phone.locator(".card-picker .duel-card:not(.back)")).toHaveCount(3);
    await expect(phone.locator(".card-picker .duel-card.selected .card-name")).toHaveText("Veleno del ragno"); // la mia scelta
    await expect(phone.locator(".card-picker .card-badges i", { hasText: "M" })).toHaveCount(1); // Marco ha votato un'altra carta
    await expect(phone.locator(".card-picker .card-badges i", { hasText: "tu" })).toHaveCount(1);
    await expect(phone.locator(".spied")).toContainText("Carica eroica"); // la carta spiata
    // le carte sono in formato compatto: effetti e iniziativa si vedono solo tenendo premuto
    await expect(phone.locator(".card-picker .duel-card .card-text")).toHaveCount(0);
  });

  test("tenere premuta una carta la ingrandisce e rilasciandola sparisce; un tocco breve non la ingrandisce", async ({ page }) => {
    await open(page, "pixel", "duel-battle");
    const card = page.locator(".phone-frame .card-picker .peekable").nth(2); // «Colpo di martello», non scelta
    await card.evaluate((el) => el.scrollIntoView({ block: "center" })); // lontano dalla barra delle reazioni in basso
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.locator(".peek-overlay .duel-card.large")).toBeVisible();
    await expect(page.locator(".peek-overlay .card-text")).toContainText("Colpo pesante");
    await page.mouse.up();
    await expect(page.locator(".peek-overlay")).toHaveCount(0);
    await expect(card.locator(".duel-card")).not.toHaveClass(/selected/); // la pressione lunga non seleziona

    // Un tocco breve non ingrandisce la carta (la selezione vera si verifica nel duello completo, con i compagni).
    await card.click();
    await expect(page.locator(".peek-overlay")).toHaveCount(0);
  });

  test("battaglia: lo schermo mostra l'avanzamento dei due team e il telefono permette di sceglierne al massimo 2", async ({ page }) => {
    await open(page, "pixel", "duel-battle");
    const screen = page.locator(".screen-frame");
    await expect(screen.getByText(/Scegliete le carte in segreto/)).toBeVisible();
    await expect(screen.locator(".vote-card")).toHaveCount(2);
    await expect(screen.locator(".vote-card .duel-card.back")).toHaveCount(7); // 3 + 4 carte in mano, tutte coperte
    await expect(screen.locator(".duel-card:not(.back)")).toHaveCount(0);
    await expect(page.locator(".phone-frame").getByText("Scegli fino a 2 carte")).toBeVisible();
    await expect(page.locator(".phone-frame").getByRole("button", { name: "Conferma le carte" })).toBeEnabled();
  });

  test("scontro: carte giocate rivelate, cronaca in italiano, barre dei PV; sul telefono l'arena non è duplicata", async ({ page }) => {
    await open(page, "pixel", "duel-replay");
    const screen = page.locator(".screen-frame");
    await expect(screen.locator(".battle-replay .played .duel-card:not(.back)")).toHaveCount(4);
    await expect(screen.locator(".battle-log li").first()).toBeVisible({ timeout: 10_000 });
    await expect(screen.locator(".hp-bar").first()).toHaveAttribute("aria-valuemax", "20");

    const phone = page.locator(".phone-frame");
    await expect(phone.locator(".arena")).toHaveCount(1); // solo quella del replay: niente barra di stato in più
    await expect(phone.locator(".duel-hud")).toHaveCount(0);
  });

  test("fine: lo sconfitto cade e il vincitore è annunciato con il motivo", async ({ page }) => {
    await open(page, "pixel", "duel-ended");
    const screen = page.locator(".screen-frame");
    await expect(screen.locator(".winner")).toContainText("Vince Rossi per KO");
    await expect(screen.locator(".fighter.side-1")).toHaveClass(/dead/);
    await expect(screen.locator(".fighter.side-0")).not.toHaveClass(/dead/);
    await expect(page.locator(".phone-frame .duel-ended")).toContainText("Avete vinto");
  });

  test("la barra di stato scrive «1 minigioco» al singolare", async ({ page }) => {
    await open(page, "pixel", "duel-battle");
    await expect(page.locator(".screen-frame .hud-line")).toContainText("tra 1 minigioco");
    await expect(page.locator(".screen-frame .hud-line")).not.toContainText("1 minigiochi");
  });

  for (const theme of THEMES) {
    test(`tutte le scene del duello nel tema ${theme}: senza errori, senza overflow e con gli sprite caricati`, async ({ page }) => {
      const problems: string[] = [];
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
      const failedAssets: string[] = [];
      page.on("response", (r) => r.status() >= 400 && failedAssets.push(`${r.status()} ${r.url()}`));

      for (const scene of ["duel-draft", "duel-battle", "duel-replay", "duel-ended"]) {
        await open(page, theme, scene);
        await expect(page.locator(`.screen-frame .duel-screen`), `${scene} schermo`).toBeVisible();
        await expect(page.locator(`.phone-frame .duel-ctrl`), `${scene} telefono`).toBeVisible();
        const overflow = await page.locator(".phone-frame .controller").evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(overflow, `${scene} overflow orizzontale del telefono`).toBeLessThanOrEqual(0);
        // gli sprite Kenney devono essere davvero caricati dal foglio, non solo presenti nel DOM
        const spriteOk = await page.locator(".screen-frame .knight .spr").first().evaluate(async (el) => {
          const url = getComputedStyle(el).backgroundImage.match(/url\("?(.*?)"?\)/)?.[1];
          if (!url) return false;
          const img = new Image();
          img.src = url;
          await img.decode();
          return img.naturalWidth === 192 && img.naturalHeight === 176;
        });
        expect(spriteOk, `${scene}: foglio di sprite caricato (192×176)`).toBe(true);
      }
      expect(problems).toEqual([]);
      expect(failedAssets).toEqual([]);
    });
  }
});
