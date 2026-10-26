import { expect } from "@playwright/test";
import { adminToken, openAdmin, test, unique } from "./support";
import { TAP_SCRIPT, addSongFiles, closeAdvanced, openAdvanced, silentWav, stereoTone, unlockAudio, uploadTone } from "./audio-support";
import { test as plain } from "@playwright/test";

const SECRET = "TITOLO-SEGRETO-E2E";

test("indovina la canzone: la musica suona sullo schermo, i telefoni prenotano, il titolo si svela solo alla fine", async ({ newGame, request }) => {
  const token = await adminToken(request);
  const upload = await request.post("/api/admin/media", {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav", "X-File-Name": "brano-e2e.wav" },
    data: silentWav(),
  });
  expect(upload.status()).toBe(201);
  const { file } = (await upload.json()) as { file: string };

  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Canzone e2e",
      config: { songs: [{ audio: file, answer: SECRET }], clipSeconds: 30, maxPoints: 100, minPoints: 20, wrongPenalty: 50 },
    },
  ]);
  const { screen, admin, a, b } = g;

  // Lo schermo precarica il brano appena inizia il round, così la musica parte senza attese.
  const mediaRequest = screen.page.waitForRequest((r) => r.url().includes(`/media/${file}`));
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await mediaRequest;
  await expect(screen.page.getByText("Brano 1 di 1")).toBeVisible();
  await expect(a.page.getByRole("button", { name: "Ascolta lo schermo…" })).toBeDisabled();

  // La regia fa partire la musica (i telefoni non scaricano nulla).
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  await expect(a.page.getByRole("button", { name: "LO SO!" })).toBeEnabled();

  // Un giocatore si prenota: la musica si ferma e tocca a lui.
  await a.page.getByRole("button", { name: "LO SO!" }).click();
  await expect(screen.page.getByText(/risponde!/)).toBeVisible();
  await expect(a.page.getByText("Tocca a te: rispondi a voce!")).toBeVisible();
  await expect(b.page.getByRole("button", { name: "Aspetta…" })).toBeDisabled();

  // Finché non è chiuso, il titolo non è su schermo né sui telefoni; i telefoni non ricevono nemmeno il file.
  expect(screen.traffic.text()).not.toContain(SECRET);
  for (const phone of [a, b]) {
    expect(phone.traffic.text()).not.toContain(SECRET);
    expect(phone.traffic.text()).not.toContain(file);
  }
  await expect(admin.page.getByText(SECRET)).toBeVisible();

  await admin.page.getByRole("button", { name: "Risposta corretta" }).click();
  await expect(screen.page.locator(".answer", { hasText: SECRET })).toBeVisible();
  await expect(screen.page.getByText(/\+\d+!/)).toBeVisible();
  await expect(a.page.getByText("Hai indovinato!")).toBeVisible();

  await admin.page.getByRole("button", { name: "Concludi" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});

plain("editor: il brano si carica dal modulo e compare nella mediateca", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni modulo"));

  await addSongFiles(page, { name: "Mio Brano.wav", mimeType: "audio/wav", buffer: silentWav() });
  // La riga mostra il nome del file; l'anteprima e la scelta del file stanno nel pannello «Avanzato».
  await expect(page.locator(".song-source").first()).toContainText("Mio Brano.wav");
  await expect(page.locator("audio[aria-label='Anteprima']")).toHaveCount(0);
  await openAdvanced(page);
  await expect(page.getByLabel(/Scegli Brano.*già caricato/).first()).toContainText("Mio Brano.wav");
  await expect(page.locator("audio[aria-label='Anteprima']").first()).toBeVisible();
  await closeAdvanced(page);

  await page.getByLabel("Titolo e artista (solo regia)").first().fill("Prova - Artista");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
});

plain("editor: il nuovo brano parte senza file e si salva con un link YouTube", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni YouTube"));

  // Nessun file precaricato: né anteprima né avvisi né pulsante per rimuoverlo.
  await expect(page.locator("audio[aria-label='Anteprima']")).toHaveCount(0);
  await expect(page.getByText(/non è nella mediateca/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rimuovi il file" })).toHaveCount(0);

  // Senza file né link il salvataggio spiega cosa manca.
  await page.getByLabel("Titolo e artista (solo regia)").first().fill("Prova - Artista");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText(/né un file audio né un link YouTube/)).toBeVisible();

  await openAdvanced(page);
  await page.getByLabel("Link YouTube (facoltativo)").first().fill("https://youtu.be/_9HHju9_hMM?si=vpOJanYjVXv3DSET");
  await closeAdvanced(page);
  await expect(page.locator(".song-source").first()).toContainText("YouTube _9HHju9_hMM");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
});

plain("editor: un file caricato si può togliere con «Rimuovi il file»", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await addSongFiles(page, { name: "Da Togliere.wav", mimeType: "audio/wav", buffer: silentWav() });
  await openAdvanced(page);
  await expect(page.locator("audio[aria-label='Anteprima']").first()).toBeVisible();
  await page.getByRole("button", { name: "Rimuovi il file" }).first().click();
  await expect(page.locator("audio[aria-label='Anteprima']")).toHaveCount(0);
});

test("indovina la canzone da YouTube: lo schermo comanda il lettore nascosto, i telefoni non vedono il video", async ({ newGame, browser }) => {
  // L'API di YouTube è sostituita da un finto lettore che registra i comandi: il test non usa internet.
  const FAKE_API = `
    window.__yt = [];
    window.YT = { Player: function (el, opts) {
      this.opts = opts;
      this.playVideo = () => window.__yt.push("play");
      this.pauseVideo = () => window.__yt.push("pause");
      this.seekTo = (s) => window.__yt.push("seek:" + Math.round(s));
      this.mute = () => {}; this.unMute = () => {}; this.destroy = () => {};
      setTimeout(() => opts.events.onReady(), 10);
    } };
    setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 10);`;
  const g = await newGame(
    [
      {
        typeId: "indovina-canzone",
        title: "YouTube e2e",
        config: { songs: [{ youtube: "https://youtu.be/dQw4w9WgXcQ", answer: SECRET, startSeconds: 12 }], clipSeconds: 30 },
      },
    ],
    {
      // il finto script va installato prima che lo schermo carichi la pagina: lo schermo è già aperto, quindi si ricarica dopo
    },
  );
  const { screen, admin, a } = g;
  await screen.context.route("https://www.youtube.com/iframe_api", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_API }));
  await screen.page.reload();

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText("Brano 1 di 1")).toBeVisible();
  await expect(screen.page.locator(".yt-hidden")).toHaveCSS("opacity", "0");

  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  // Parte dal secondo 12 del video (più il tempo già trascorso, pochi decimi).
  await expect.poll(() => screen.page.evaluate(() => (window as any).__yt as string[])).toEqual(expect.arrayContaining(["play"]));
  const calls = await screen.page.evaluate(() => (window as any).__yt as string[]);
  expect(calls.find((c) => c.startsWith("seek:"))).toMatch(/^seek:1[23]$/);

  // Prenotazione: il lettore si ferma. Il telefono non riceve né l'id del video né il titolo.
  await a.page.getByRole("button", { name: "LO SO!" }).click();
  await expect.poll(() => screen.page.evaluate(() => (window as any).__yt as string[])).toContain("pause");
  expect(a.traffic.text()).not.toContain("dQw4w9WgXcQ");
  expect(a.traffic.text()).not.toContain(SECRET);
});

// ---- Effetti audio: si misura il segnale che esce davvero dal grafo Web Audio dello schermo ----

test("effetto «senza voce»: nello stesso brano il tono centrale (la «voce») sparisce e quello su un canale resta", async ({ newGame, request }) => {
  // 1000 Hz identico sui due canali = «voce»; 3000 Hz solo a sinistra = «strumento».
  const song = await uploadTone(request, "voce-e-strumento.wav", stereoTone([1_000, 3_000], [1_000]));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Senza voce e2e", config: { songs: [{ audio: song, answer: "a", effect: "no_voice" }], clipSeconds: 30 } },
  ]);
  const { screen, admin } = g;
  await screen.context.addInitScript(TAP_SCRIPT);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  // Lo strumento arriva all'uscita (la musica suona davvero) e la voce è molto più bassa.
  await expect.poll(() => screen.page.evaluate(() => (window as any).__db(3_000) as number), { timeout: 8_000 }).toBeGreaterThan(-60);
  const db = await screen.page.evaluate(() => ({ instrument: (window as any).__db(3_000) as number, voice: (window as any).__db(1_000) as number }));
  expect(db.instrument - db.voice, `strumento ${db.instrument} dB, voce ${db.voice} dB`).toBeGreaterThan(30);
});

test("effetto «sfocato»: nello stesso brano il tono grave passa e quello acuto viene tagliato", async ({ newGame, request }) => {
  const mix = await uploadTone(request, "grave-e-acuto.wav", stereoTone([200, 8_000]));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Sfocato e2e", config: { songs: [{ audio: mix, answer: "a", effect: "heavy_blur" }], clipSeconds: 30 } },
  ]);
  const { screen, admin } = g;
  await screen.context.addInitScript(TAP_SCRIPT);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  // Il grave arriva all'uscita (quindi la musica suona davvero) e l'acuto è molto più basso, in decibel.
  await expect.poll(() => screen.page.evaluate(() => (window as any).__db(200) as number), { timeout: 8_000 }).toBeGreaterThan(-60);
  const db = await screen.page.evaluate(() => ({ low: (window as any).__db(200) as number, high: (window as any).__db(8_000) as number }));
  expect(db.low - db.high, `grave ${db.low} dB, acuto ${db.high} dB`).toBeGreaterThan(30);
});

plain("editor: l'anteprima del brano suona con l'effetto scelto e si può confrontare con l'originale", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await admin.context.addInitScript(TAP_SCRIPT);
  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni effetto"));
  await addSongFiles(page, { name: "grave-e-acuto.wav", mimeType: "audio/wav", buffer: stereoTone([200, 8_000], [200, 8_000], 20) });
  await openAdvanced(page);
  const preview = page.locator("audio[aria-label='Anteprima']").first();
  await expect(preview).toBeVisible();
  // Senza effetto non compare la casella di confronto.
  await expect(page.getByLabel("Ascolta con gli effetti")).toHaveCount(0);

  await page.getByRole("button", { name: "+ Aggiungi effetto" }).click();
  await page.getByLabel("Effetto", { exact: true }).first().selectOption("blur");
  await page.getByLabel("Quantità (%)", { exact: true }).first().fill("165"); // ≈ il vecchio «molto sfocato»
  const compare = page.getByLabel("Ascolta con gli effetti").first();
  await expect(compare).toBeChecked();
  await preview.evaluate((a: HTMLAudioElement) => a.play());
  const level = (hz: number) => page.evaluate((f) => (window as any).__db(f) as number, hz);
  await expect.poll(() => level(200), { timeout: 8_000 }).toBeGreaterThan(-60);
  // Con l'effetto il grave passa e l'acuto è tagliato...
  await expect.poll(async () => (await level(200)) - (await level(8_000)), { timeout: 8_000 }).toBeGreaterThan(30);

  // ...togliendo la spunta si sente il brano originale, con l'acuto presente.
  await compare.uncheck();
  await expect.poll(async () => (await level(200)) - (await level(8_000)), { timeout: 8_000 }).toBeLessThan(15);
  await compare.check();
  await expect.poll(async () => (await level(200)) - (await level(8_000)), { timeout: 8_000 }).toBeGreaterThan(30);
});
