import { expect } from "@playwright/test";
import { test as plain } from "@playwright/test";
import { adminToken, openAdmin, test, unique } from "./support";
import { TAP_SCRIPT, stereoTone, unlockAudio, uploadTone } from "./audio-support";

// Più effetti sullo stesso brano, ognuno con la sua quantità. Si misura il segnale che esce davvero dal grafo Web Audio.

/**
 * Livello (dB) a una frequenza. L'analizzatore Web Audio mescola ogni analisi nuova (una per blocco di campioni) con la
 * precedente al 80%: per leggere il suono di adesso, e non una media con quello di prima, si lasciano passare una
 * ventina di analisi (mezzo secondo) prima di leggere.
 */
const level = (page: import("@playwright/test").Page, hz: number) =>
  page.evaluate(async (f) => {
    let v = -Infinity;
    for (let i = 0; i < 25; i++) {
      v = (window as any).__db(f) as number;
      await new Promise((r) => setTimeout(r, 20));
    }
    return v;
  }, hz);

test("più effetti insieme sullo schermo: «senza voce» e «sfocato» sommati tolgono sia la voce sia gli acuti", async ({ newGame, request }) => {
  // 200 Hz solo a sinistra = «strumento grave»; 1000 Hz uguale sui due canali = «voce»; 8000 Hz solo a sinistra = «strumento acuto».
  const song = await uploadTone(request, "tre-toni.wav", stereoTone([200, 1_000, 8_000], [1_000]));
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Più effetti e2e",
      config: { songs: [{ audio: song, answer: "a", effects: [{ type: "no_voice", amount: 100 }, { type: "blur", amount: 165 }] }], clipSeconds: 30 },
    },
  ]);
  const { screen, admin, a } = g;
  await screen.context.addInitScript(TAP_SCRIPT);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  await expect.poll(() => level(screen.page, 200), { timeout: 8_000 }).toBeGreaterThan(-60);

  const db = { bass: await level(screen.page, 200), voice: await level(screen.page, 1_000), treble: await level(screen.page, 8_000) };
  // La voce (centrale) è cancellata dal primo effetto, gli acuti dal secondo: resta solo il grave.
  expect(db.bass - db.voice, `grave ${db.bass} dB, voce ${db.voice} dB`).toBeGreaterThan(30);
  expect(db.bass - db.treble, `grave ${db.bass} dB, acuto ${db.treble} dB`).toBeGreaterThan(30);

  // Gli effetti non arrivano ai telefoni.
  expect(a.traffic.text()).not.toMatch(/no_voice|"effects"|"blur"/);
  // Lo schermo li riceve in lista, con la quantità.
  expect(screen.traffic.text()).toMatch(/"effects":\[\{"type":"no_voice","amount":100\},\{"type":"blur","amount":165\}\]/);
});

plain("editor: più effetti in serie, quantità con cursore, e si sente subito nell'anteprima", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await admin.context.addInitScript(TAP_SCRIPT);
  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni effetti"));
  await page.getByLabel("Carica Brano").first().setInputFiles({ name: "grave-e-medio.wav", mimeType: "audio/wav", buffer: stereoTone([200, 2_000], [200, 2_000], 30) });
  const preview = page.locator("audio[aria-label='Anteprima']").first();
  await expect(preview).toBeVisible();
  const compare = page.getByLabel("Ascolta con gli effetti");
  await expect(compare).toHaveCount(0);
  await expect(preview).toHaveAttribute("data-effects", "0");

  // Il primo effetto: sfocato al 100% (quantità predefinita).
  await page.getByRole("button", { name: "+ Aggiungi effetto" }).click();
  const types = page.getByLabel("Effetto", { exact: true });
  await expect(types).toHaveCount(1);
  await types.first().selectOption("blur");
  const amount = page.getByLabel("Quantità (%)", { exact: true });
  const slider = page.getByLabel("Quantità (%) (cursore)", { exact: true });
  await expect(amount.first()).toHaveValue("100");
  await expect(slider.first()).toHaveAttribute("max", "300");
  await expect(preview).toHaveAttribute("data-effects", "1");

  await preview.evaluate((a: HTMLAudioElement) => a.play());
  await expect.poll(() => level(page, 200), { timeout: 8_000 }).toBeGreaterThan(-60);
  const spread = async () => (await level(page, 200)) - (await level(page, 2_000));
  await expect.poll(spread, { timeout: 8_000 }).toBeGreaterThan(3);
  const at100 = await spread();

  // Quantità estesa: il cursore e il campo numerico vanno di pari passo, e il suono si ovatta di più, a brano in riproduzione.
  await amount.first().fill("300");
  await expect(slider.first()).toHaveValue("300");
  await expect.poll(spread, { timeout: 8_000 }).toBeGreaterThan(at100 + 10);
  await slider.first().fill("150");
  await expect(amount.first()).toHaveValue("150");

  // Un secondo effetto sommato al primo: «Telefono» al massimo toglie anche il grave, che lo sfocato lasciava passare.
  await amount.first().fill("100");
  await expect.poll(() => level(page, 200), { timeout: 8_000 }).toBeGreaterThan(-60);
  const bassAlone = await level(page, 200);
  await page.getByRole("button", { name: "+ Aggiungi effetto" }).click();
  await expect(types).toHaveCount(2);
  await types.nth(1).selectOption("telephone");
  await amount.nth(1).fill("300");
  await expect(preview).toHaveAttribute("data-effects", "2");
  await expect.poll(() => level(page, 200), { timeout: 8_000 }).toBeLessThan(bassAlone - 10);

  // Tolto il secondo effetto, il grave torna; con la spunta tolta si sente l'originale.
  await page.getByRole("group", { name: /Effetti sull'audio/ }).getByRole("button", { name: "Elimina" }).nth(1).click();
  await expect(types).toHaveCount(1);
  await expect.poll(() => level(page, 200), { timeout: 8_000 }).toBeGreaterThan(bassAlone - 5);
  await compare.uncheck();
  await expect(preview).toHaveAttribute("data-effects", "0");
  await expect.poll(spread, { timeout: 8_000 }).toBeLessThan(at100 - 1);
});

plain("l'istanza salvata col vecchio effetto singolo diventa un elenco di effetti, senza cambiare suono", async ({ request }) => {
  const token = await adminToken(request);
  const song = await uploadTone(request, "vecchio.wav", stereoTone(440));
  const create = await request.post("/api/admin/instances", {
    headers: { Authorization: `Bearer ${token}` },
    data: { typeId: "indovina-canzone", title: unique("Vecchio effetto"), config: { songs: [{ audio: song, answer: "a", effect: "heavy_blur" }], clipSeconds: 30 } },
  });
  expect(create.status()).toBe(201);
  const saved = (await create.json()) as { config: { songs: Record<string, unknown>[] } };
  expect(saved.config.songs[0]!.effects).toEqual([{ type: "blur", amount: 165 }]);
  expect(saved.config.songs[0]).not.toHaveProperty("effect");
});
