import { expect, test as plain } from "@playwright/test";
import { TAP_SCRIPT, addSongFiles, advancedPanel, closeAdvanced, openAdvanced, silentWav, stereoTone } from "./audio-support";
import { adminToken, openAdmin, unique } from "./support";

// Editor di «Indovina la canzone»: elenco dei brani (file o link YouTube, con un riassunto) e pannello «Avanzato» di ogni brano.

const wav = (name: string) => ({ name, mimeType: "audio/wav", buffer: silentWav() });
const title = (n: number) => `Titolo e artista (solo regia) del brano ${n}`;

async function newEditor(browser: import("@playwright/test").Browser, request: import("@playwright/test").APIRequestContext) {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  const name = unique("Canzoni lista");
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(name);
  return { ...admin, name };
}

plain("lista dei brani: più file insieme, la riga vuota iniziale si riempie e il resto è nel pannello Avanzato", async ({ browser, request }) => {
  const { page } = await newEditor(browser, request);
  const rows = page.locator(".song-row");

  // Si nasce con una riga vuota che dice cosa manca; non c'è nessun campo avanzato nella lista.
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Manca il brano");
  await expect(page.getByLabel("Modalità di ascolto del brano")).toHaveCount(0);
  await expect(page.getByRole("group", { name: /Effetti sull'audio/ })).toHaveCount(0);
  await page.getByLabel(title(1)).fill("Primo - Artista");

  // Tre file in una volta: il primo riempie la riga vuota (il titolo resta), gli altri ne aggiungono due.
  await addSongFiles(page, [wav("uno.wav"), wav("due.wav"), wav("tre.wav")]);
  await expect(rows).toHaveCount(3);
  await expect(page.getByLabel(title(1))).toHaveValue("Primo - Artista");
  // Gli altri brani propongono come titolo il nome del file senza estensione.
  await expect(page.getByLabel(title(2))).toHaveValue("due");
  await expect(page.getByLabel(title(3))).toHaveValue("tre");
  await expect(rows.nth(0).locator(".song-source")).toContainText("uno.wav");
  await expect(rows.nth(1).locator(".song-source")).toContainText("due.wav");
  await expect(rows.nth(2).locator(".song-source")).toContainText("tre.wav");
  for (let n = 1; n <= 3; n++) await expect(page.getByRole("list", { name: `Impostazioni del brano ${n}` })).toContainText("impostazioni predefinite");

  // Si riordina e si elimina dalla riga.
  await page.getByLabel(title(2)).fill("Secondo - Artista");
  await page.getByRole("button", { name: "Sposta su il brano 2" }).click();
  await expect(page.getByLabel(title(1))).toHaveValue("Secondo - Artista");
  await expect(rows.nth(0).locator(".song-source")).toContainText("due.wav");
  await page.getByRole("button", { name: "Elimina il brano 3" }).click();
  await expect(rows).toHaveCount(2);

  // Un file già caricato si aggiunge dal menu.
  await page.getByLabel("Aggiungi un file già caricato").selectOption({ label: "uno.wav" });
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2).locator(".song-source")).toContainText("uno.wav");
});

plain("lista dei brani: le impostazioni avanzate compaiono nel riassunto della riga e si salvano", async ({ browser, request }) => {
  const { page, name } = await newEditor(browser, request);
  await addSongFiles(page, { name: "avanzato.wav", mimeType: "audio/wav", buffer: stereoTone(440, 440, 20) });
  await page.getByLabel(title(1)).fill("Prova - Artista");

  const panel = await openAdvanced(page);
  // Il pannello ha le sue sezioni: sorgente, categorie, ascolto, effetti (filtri e camuffamenti insieme) e punti.
  for (const section of ["Sorgente", "Categorie", "Partenza e ascolto", "Effetti sull'audio", "Punti"]) {
    await expect(panel.locator(`[data-section="${section}"]`), section).toBeVisible();
  }
  await panel.getByLabel("Parti da (secondi)").fill("12");
  await panel.getByRole("button", { name: "+ Aggiungi effetto" }).click();
  await panel.getByLabel("Effetto", { exact: true }).first().selectOption("blur");
  await panel.getByLabel("Quantità (%)", { exact: true }).first().fill("150");
  // Le categorie si scelgono tra quelle del quiz: una nuova si crea al volo (entra anche nel gestore).
  for (const category of ["Anni 80", "Rock"]) {
    await panel.getByLabel("Nuova categoria per questo brano").fill(category);
    await panel.getByLabel("Nuova categoria per questo brano").press("Enter");
    await expect(panel.getByRole("checkbox", { name: category })).toBeChecked();
  }
  await panel.getByLabel("Punti massimi").fill("200");
  // Escape chiude il pannello.
  await page.keyboard.press("Escape");
  await expect(advancedPanel(page)).toHaveCount(0);

  const chips = page.getByRole("list", { name: "Impostazioni del brano 1" });
  await expect(chips).toContainText("parte da 12 s");
  await expect(chips).toContainText("effetti: Sfocato 150%");
  await expect(chips).toContainText("categorie: Anni 80, Rock");
  await expect(chips).toContainText("200 punti");

  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();

  // Riaprendo l'istanza il riassunto e il pannello hanno gli stessi valori.
  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.locator(".library ul.list li", { hasText: name }).getByRole("button", { name: "Modifica" }).click();
  await expect(page.getByRole("list", { name: "Impostazioni del brano 1" })).toContainText("effetti: Sfocato 150%");
  await openAdvanced(page);
  await expect(page.getByLabel("Parti da (secondi)")).toHaveValue("12");
  await expect(page.getByLabel("Quantità (%)", { exact: true }).first()).toHaveValue("150");
});

plain("lista dei brani: link YouTube incollati in blocco, con il controllo sui link sbagliati", async ({ browser, request }) => {
  const { page } = await newEditor(browser, request);
  const rows = page.locator(".song-row");

  await page.getByRole("button", { name: "+ Aggiungi link YouTube" }).click();
  await page.getByLabel("Link YouTube da aggiungere").fill("https://youtu.be/_9HHju9_hMM\nnon-e-un-link");
  await page.getByRole("button", { name: "Aggiungi i link" }).click();
  // Un link sbagliato blocca tutto e dice quale.
  await expect(page.getByRole("alert")).toContainText("non-e-un-link");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Manca il brano");

  await page.getByLabel("Link YouTube da aggiungere").fill("https://youtu.be/_9HHju9_hMM\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Aggiungi i link" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".song-source")).toContainText("YouTube _9HHju9_hMM");
  await expect(rows.nth(1).locator(".song-source")).toContainText("YouTube dQw4w9WgXcQ");
  await expect(page.getByLabel("Link YouTube da aggiungere")).toHaveCount(0);

  // Con YouTube il pannello non offre effetti né camuffamenti.
  const panel = await openAdvanced(page);
  await expect(panel.getByRole("button", { name: "+ Aggiungi effetto" })).toHaveCount(0);
  await expect(panel.getByLabel("Link YouTube (facoltativo)")).toHaveValue("https://youtu.be/_9HHju9_hMM");
  await closeAdvanced(page);

  await page.getByLabel(title(1)).fill("Uno - A");
  await page.getByLabel(title(2)).fill("Due - B");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
});

plain("lista dei brani: i bottoni sono larghi e alti a sufficienza per un clic o un tocco sicuri", async ({ browser, request }) => {
  const { page } = await newEditor(browser, request);
  await addSongFiles(page, [wav("uno.wav"), wav("due.wav")]);
  const size = async (locator: import("@playwright/test").Locator) => (await locator.boundingBox())!;

  const advanced = await size(page.getByRole("button", { name: "Avanzato: brano 1" }));
  expect(advanced.width).toBeGreaterThanOrEqual(120);
  expect(advanced.height).toBeGreaterThanOrEqual(40);
  for (const name of ["Sposta giù il brano 1", "Elimina il brano 1"]) {
    const b = await size(page.getByRole("button", { name }));
    expect(b.width, name).toBeGreaterThanOrEqual(44);
    expect(b.height, name).toBeGreaterThanOrEqual(40);
  }
  for (const name of ["+ Aggiungi link YouTube"]) {
    expect((await size(page.getByRole("button", { name }))).height, name).toBeGreaterThanOrEqual(40);
  }
  expect((await size(page.locator(".song-add .file-btn"))).height).toBeGreaterThanOrEqual(40);

  // Stessa cosa nel pannello: «Fatto» e i bottoni di una lista (↑ ↓ ✕ degli effetti).
  const panel = await openAdvanced(page);
  expect((await size(panel.getByRole("button", { name: "Fatto" }))).width).toBeGreaterThanOrEqual(100);
  await panel.getByRole("button", { name: "+ Aggiungi effetto" }).click();
  for (const name of ["Sposta su", "Sposta giù", "Elimina"]) {
    const b = await size(panel.getByRole("group", { name: /Effetti sull'audio/ }).getByRole("button", { name }).first());
    expect(b.width, name).toBeGreaterThanOrEqual(44);
    expect(b.height, name).toBeGreaterThanOrEqual(40);
  }
});

plain("ascolto brano per brano: un'istanza salvata coi predefiniti del round li ritrova nei brani, e il modulo non li mostra più", async ({ browser, request }) => {
  const token = await adminToken(request);
  const name = unique("Canzoni predefiniti round");
  // Come si salvava prima: nel round «a spezzoni» con i suoi valori, nei brani nessuna modalità propria.
  const create = await request.post("/api/admin/instances", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      typeId: "indovina-canzone",
      title: name,
      config: { songs: [{ youtube: "https://youtu.be/_9HHju9_hMM", answer: "Uno - A" }, { youtube: "https://youtu.be/dQw4w9WgXcQ", answer: "Due - B", playback: "speed", speed: 1.5 }], playback: "loops", loopSeconds: [1, 3], loopPauseSeconds: 2, clipSeconds: 45 },
    },
  });
  // (YouTube non ammette la velocità: la seconda canzone è solo per vedere che una modalità propria non si tocca)
  expect(create.status()).toBe(400);
  const ok = await request.post("/api/admin/instances", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      typeId: "indovina-canzone",
      title: name,
      config: { songs: [{ youtube: "https://youtu.be/_9HHju9_hMM", answer: "Uno - A" }, { youtube: "https://youtu.be/dQw4w9WgXcQ", answer: "Due - B", playback: "continuous", clipSeconds: 20 }], playback: "loops", loopSeconds: [1, 3], loopPauseSeconds: 2, clipSeconds: 45 },
    },
  });
  expect(ok.status()).toBe(201);

  const admin = await openAdmin(browser, token);
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.locator(".library ul.list li", { hasText: name }).getByRole("button", { name: "Modifica" }).click();

  // I predefiniti del round non sono più nel modulo…
  for (const label of ["Come si ascolta", "Durata degli spezzoni (secondi)", "Pausa tra gli spezzoni (secondi)", "Durata dell'ascolto (secondi)"]) {
    await expect(page.getByLabel(label, { exact: true }), label).toHaveCount(0);
  }
  // …e il primo brano, che li seguiva, li ha ora come propri; il secondo conserva i suoi.
  await expect(page.getByRole("list", { name: "Impostazioni del brano 1" })).toContainText("ascolto a spezzoni crescenti (1 · 3 s)");
  await expect(page.getByRole("list", { name: "Impostazioni del brano 2" })).toContainText("ascolto continuo, 20 s");
  await openAdvanced(page, 1);
  await expect(page.getByLabel("Modalità di ascolto del brano")).toHaveValue("loops");
  await expect(page.getByLabel("Spezzone del brano 2")).toHaveValue("3");
  await expect(page.getByLabel("Pausa tra gli spezzoni di questo brano (secondi)")).toHaveValue("2");
  await closeAdvanced(page, 1);

  // Salvando, i valori restano nei brani.
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
  const saved = (await (await request.get("/api/admin/instances", { headers: { Authorization: `Bearer ${token}` } })).json()) as { title: string; config: { songs: Record<string, unknown>[] } }[];
  const mine = saved.find((i) => i.title === name)!;
  expect(mine.config.songs[0]).toMatchObject({ playback: "loops", loopSeconds: [1, 3], loopPauseSeconds: 2 });
});

plain("pannello Avanzato: il player e «Prova l'ascolto» restano in vista da ogni sezione, senza risalire", async ({ browser, request }) => {
  const { page } = await newEditor(browser, request);
  await addSongFiles(page, { name: "lungo.wav", mimeType: "audio/wav", buffer: stereoTone(440, 440, 30) });
  const panel = await openAdvanced(page);
  const player = panel.locator("audio[aria-label='Anteprima']");
  const trial = panel.getByRole("button", { name: "▶ Prova l'ascolto" });
  await expect(player).toBeInViewport();
  await expect(trial).toBeInViewport();
  // cosa fa la prova, in chiaro accanto al bottone
  await expect(panel.locator(".listen-trial")).toContainText("come in partita, dal secondo 0");

  // Si scende fino all'ultima sezione: il pannello è davvero scorso, e il player è ancora lì.
  await panel.locator("[data-section='Punti']").scrollIntoViewIfNeeded();
  await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(player).toBeInViewport();
  await expect(trial).toBeInViewport();

  // Dalla sezione degli effetti si aggiunge un effetto e si ascolta senza risalire.
  const effects = panel.locator("[data-section=\"Effetti sull'audio\"]");
  await effects.scrollIntoViewIfNeeded();
  await effects.getByRole("button", { name: "+ Aggiungi effetto" }).click();
  await expect(player).toHaveAttribute("data-effects", "1");
  await expect(player).toBeInViewport();
  await player.evaluate((a: HTMLAudioElement) => a.play());
  await expect.poll(() => player.evaluate((a: HTMLAudioElement) => !a.paused)).toBe(true);
  await trial.click();
  await expect(panel.locator(".listen-trial")).toHaveAttribute("data-state", "playing");
  await panel.getByRole("button", { name: "■ Ferma la prova" }).click();
  await expect(panel.locator(".listen-trial")).toHaveAttribute("data-state", "idle");
});

plain("«Prova l'ascolto» suona in ogni modalità anche se l'audio del sito è silenziato nel browser (il muto di schermo e telefoni)", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page, context } = admin;
  // Il muto di schermo e telefoni resta salvato nel browser; nel modulo della regia non c'è nessun pulsante per toglierlo.
  await context.addInitScript(`localStorage.setItem("gioco.muted", "1");`);
  await context.addInitScript(TAP_SCRIPT);
  await context.addInitScript(`
    window.__players = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__players.push(this); return play.apply(this, arguments); };`);
  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni muto"));
  await addSongFiles(page, { name: "tono.wav", mimeType: "audio/wav", buffer: stereoTone(440, 440, 30) });
  const panel = await openAdvanced(page);
  const mode = panel.getByLabel("Modalità di ascolto del brano");
  const trial = panel.locator(".listen-trial");
  const level = () => page.evaluate(() => (window as any).__db(440) as number);
  const wavPlayer = () =>
    page.evaluate(() => {
      const p = ((window as any).__players as HTMLMediaElement[]).filter((e) => e.src.includes(".wav") && !e.paused).at(-1);
      return p ? { muted: p.muted, volume: p.volume } : null;
    });
  const stopTrial = async () => {
    await panel.getByRole("button", { name: "■ Ferma la prova" }).click();
    await expect(trial).toHaveAttribute("data-state", "idle");
  };

  // Continuo, senza effetti: prima passava dal lettore semplice, che il muto silenzia.
  await panel.getByRole("button", { name: "▶ Prova l'ascolto" }).click();
  await expect.poll(wavPlayer, { timeout: 10_000 }).toEqual({ muted: false, volume: 1 });
  await expect.poll(level, { timeout: 8_000 }).toBeGreaterThan(-60);
  await stopTrial();

  // A spezzoni (decodificato in memoria) e con un effetto (elemento audio nel grafo Web Audio).
  await mode.selectOption("loops");
  await panel.getByRole("button", { name: "▶ Prova l'ascolto" }).click();
  await expect.poll(level, { timeout: 10_000 }).toBeGreaterThan(-60);
  await stopTrial();
  await mode.selectOption("continuous");
  await panel.locator("[data-section=\"Effetti sull'audio\"]").getByRole("button", { name: "+ Aggiungi effetto" }).click();
  await panel.getByRole("button", { name: "▶ Prova l'ascolto" }).click();
  await expect.poll(level, { timeout: 10_000 }).toBeGreaterThan(-60);
  await stopTrial();
});
