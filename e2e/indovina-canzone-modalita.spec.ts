import { expect, test as plain } from "@playwright/test";
import { SOURCE_SPY, TAP_SCRIPT, addSongFiles, closeAdvanced, openAdvanced, stereoTone, unlockAudio, uploadTone } from "./audio-support";
import { type GameSetup, adminToken, openAdmin, test, unique } from "./support";

// Modalità di ascolto brano per brano: più lento o più veloce, velocità diversa all'inizio e poi normale, suono molto
// ovattato, poi poco, poi normale. Si misura ciò che esce davvero dallo schermo: velocità e posizione dell'elemento
// audio, intonazione e frequenze del segnale in uscita (analizzatore davanti all'uscita di Web Audio).

const SECRET = "TITOLO-MODALITA-E2E";

/** Registra gli elementi audio che la pagina fa partire e ne espone un campione (tempo di pagina, posizione, velocità). */
const PLAYER_SPY = `
  window.__players = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (!window.__players.includes(this)) window.__players.push(this); return play.apply(this, arguments); };
  window.__sample = (file) => {
    const el = window.__players.find((p) => p.src.includes(file));
    return el ? { t: performance.now(), ct: el.currentTime, rate: el.playbackRate, paused: el.paused, keepPitch: el.preservesPitch } : null;
  };`;

type Sample = { t: number; ct: number; rate: number; paused: boolean; keepPitch: boolean };

/** Prepara lo schermo con le spie, sblocca l'audio e avvia il round 1. */
async function startRound(g: GameSetup, ...scripts: string[]) {
  const { screen, admin } = g;
  for (const s of scripts) await screen.context.addInitScript(s);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText(/Brano 1 di/)).toBeVisible();
}
const playMusic = (g: GameSetup) => g.admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
const sample = (g: GameSetup, file: string) => g.screen.page.evaluate((f) => (window as any).__sample(f) as Sample | null, file);
const level = (g: GameSetup, hz: number) => g.screen.page.evaluate((f) => (window as any).__db(f) as number, hz);

test("più lento: l'elemento audio va a metà velocità, e il brano avanza di mezzo secondo per secondo", async ({ newGame, request }) => {
  const file = await uploadTone(request, "tono-lento.wav", stereoTone(440, 440, 30));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Lento e2e", config: { songs: [{ audio: file, answer: SECRET, playback: "speed", speed: 0.5, startSeconds: 1 }], clipSeconds: 30 } },
  ]);
  await startRound(g, PLAYER_SPY);
  await playMusic(g);
  await expect(g.screen.page.locator(".song-mode[data-mode='speed']")).toContainText("rallentato");
  await expect.poll(async () => (await sample(g, file))?.ct ?? 0, { timeout: 10_000 }).toBeGreaterThan(1.1);

  const a = (await sample(g, file))!;
  await g.screen.page.waitForTimeout(3_000);
  const b = (await sample(g, file))!;
  expect(a.rate).toBe(0.5);
  expect(b.rate).toBe(0.5);
  expect(a.keepPitch).toBe(true);
  const slope = (b.ct - a.ct) / ((b.t - a.t) / 1000);
  expect(slope, `il brano avanza di ${slope.toFixed(2)} s per secondo`).toBeGreaterThan(0.4);
  expect(slope).toBeLessThan(0.6);
  // L'ascolto (e i punti) si contano a orologio, non a posizione nel brano: il conto alla rovescia è quello scelto.
  await expect(g.screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
});

test("più veloce: il brano avanza il doppio", async ({ newGame, request }) => {
  const file = await uploadTone(request, "tono-veloce.wav", stereoTone(440, 440, 60));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Veloce e2e", config: { songs: [{ audio: file, answer: SECRET, playback: "speed", speed: 2 }], clipSeconds: 20 } },
  ]);
  await startRound(g, PLAYER_SPY);
  await playMusic(g);
  await expect(g.screen.page.locator(".song-mode[data-mode='speed']")).toContainText("accelerato");
  await expect.poll(async () => (await sample(g, file))?.ct ?? 0, { timeout: 10_000 }).toBeGreaterThan(0.2);
  const a = (await sample(g, file))!;
  await g.screen.page.waitForTimeout(2_500);
  const b = (await sample(g, file))!;
  const slope = (b.ct - a.ct) / ((b.t - a.t) / 1000);
  expect(a.rate).toBe(2);
  expect(slope, `il brano avanza di ${slope.toFixed(2)} s per secondo`).toBeGreaterThan(1.8);
  expect(slope).toBeLessThan(2.2);
});

test("intonazione mantenuta: a metà velocità il tono resta a 440 Hz", async ({ newGame, request }) => {
  const file = await uploadTone(request, "tono-intonato.wav", stereoTone(440, 440, 30));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Intonazione e2e", config: { songs: [{ audio: file, answer: SECRET, playback: "speed", speed: 0.5, keepPitch: true }], clipSeconds: 30 } },
  ]);
  await startRound(g, PLAYER_SPY, TAP_SCRIPT);
  await playMusic(g);
  await expect.poll(() => level(g, 440), { timeout: 10_000 }).toBeGreaterThan(-60);
  await g.screen.page.waitForTimeout(800);
  const db = { tone: await level(g, 440), octaveBelow: await level(g, 220) };
  expect(db.tone - db.octaveBelow, `440 Hz ${db.tone} dB, 220 Hz ${db.octaveBelow} dB`).toBeGreaterThan(25);
});

test("intonazione non mantenuta: a metà velocità il tono scende di un'ottava (220 Hz)", async ({ newGame, request }) => {
  const file = await uploadTone(request, "tono-disco.wav", stereoTone(440, 440, 30));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Disco e2e", config: { songs: [{ audio: file, answer: SECRET, playback: "speed", speed: 0.5, keepPitch: false }], clipSeconds: 30 } },
  ]);
  await startRound(g, PLAYER_SPY, TAP_SCRIPT);
  await playMusic(g);
  await expect.poll(() => level(g, 220), { timeout: 10_000 }).toBeGreaterThan(-60);
  await g.screen.page.waitForTimeout(800);
  const db = { tone: await level(g, 440), octaveBelow: await level(g, 220) };
  expect((await sample(g, file))!.keepPitch).toBe(false);
  expect(db.octaveBelow - db.tone, `220 Hz ${db.octaveBelow} dB, 440 Hz ${db.tone} dB`).toBeGreaterThan(25);
});

test("prima lento, poi normale: la velocità sale in modo morbido e poi resta 1", async ({ newGame, request }) => {
  const file = await uploadTone(request, "tono-lento-poi-normale.wav", stereoTone(440, 440, 60));
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Lento poi normale e2e",
      config: { songs: [{ audio: file, answer: SECRET, playback: "speed_then_normal", speed: 0.5, normalAfterSeconds: 3, speedTransitionSeconds: 2 }], clipSeconds: 20 },
    },
  ]);
  await startRound(g, PLAYER_SPY);
  await playMusic(g);
  await expect(g.screen.page.locator(".song-mode[data-mode='speed_then_normal']")).toContainText("poi torna normale");
  await expect.poll(async () => (await sample(g, file))?.ct ?? 0, { timeout: 10_000 }).toBeGreaterThan(0.1);

  // Si campiona per 9 s: prima a metà velocità, poi il passaggio morbido, poi la velocità normale.
  const samples: Sample[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9_000) {
    samples.push((await sample(g, file))!);
    await g.screen.page.waitForTimeout(100);
  }
  const rates = samples.map((s) => s.rate);
  expect(rates[0]).toBe(0.5);
  expect(rates.at(-1)).toBe(1);
  for (let i = 1; i < rates.length; i++) expect(rates[i]!, `la velocità non scende mai (campione ${i})`).toBeGreaterThanOrEqual(rates[i - 1]!);
  // c'è almeno un valore intermedio: il passaggio non è di colpo
  expect(rates.some((r) => r > 0.6 && r < 0.9), `velocità: ${[...new Set(rates)].join(", ")}`).toBe(true);

  const slope = (from: Sample, to: Sample) => (to.ct - from.ct) / ((to.t - from.t) / 1000);
  const early = samples.filter((s) => s.rate === 0.5);
  const late = samples.filter((s) => s.rate === 1);
  expect(early.length).toBeGreaterThan(3);
  expect(late.length).toBeGreaterThan(5);
  expect(slope(early[0]!, early.at(-1)!), "all'inizio").toBeLessThan(0.65);
  expect(slope(late[0]!, late.at(-1)!), "dopo il passaggio").toBeGreaterThan(0.9);
  expect(slope(late[0]!, late.at(-1)!)).toBeLessThan(1.1);
});

test("ovattato a fasi: molto ovattato, poi poco, poi normale, con passaggi morbidi", async ({ newGame, request }) => {
  // 200 Hz passa sempre; 3000 Hz è molto attenuato dal filtro forte, meno dal leggero, per niente a suono normale.
  const file = await uploadTone(request, "fasi-grave-medio.wav", stereoTone([200, 3_000], [200, 3_000], 40));
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Fasi e2e",
      config: { songs: [{ audio: file, answer: SECRET, playback: "blur_stages", stage1Seconds: 4, stage2Seconds: 4, stageTransitionSeconds: 2 }], clipSeconds: 30 },
    },
  ]);
  await startRound(g, TAP_SCRIPT);
  await playMusic(g);
  await expect(g.screen.page.locator(".song-mode[data-mode='blur_stages']")).toBeVisible();
  const gap = () => g.screen.page.evaluate(() => (window as any).__db(200) - (window as any).__db(3_000)) as Promise<number>;
  await expect.poll(() => level(g, 200), { timeout: 10_000 }).toBeGreaterThan(-60);

  // Si campiona ogni 100 ms per 16 s (le fasi finiscono a 4 + 2 + 4 + 2 = 12 s) e si guarda la forma della curva.
  const gaps: number[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 16_000) {
    gaps.push(await gap());
    await g.screen.page.waitForTimeout(100);
  }
  const heavy = Math.max(...gaps.slice(0, 5));
  const end = gaps.slice(-10);
  expect(heavy, "all'inizio il medio è molto più basso del grave").toBeGreaterThan(20);
  expect(Math.max(...end), "alla fine il suono è normale").toBeLessThan(6);
  // C'è un tratto fermo a un livello intermedio (la fase «poco ovattato»): né forte come all'inizio né normale.
  const middle = gaps.filter((x) => x < heavy - 8 && x > 8);
  expect(middle.length, `distanze in dB: ${gaps.filter((_, i) => i % 5 === 0).map((x) => x.toFixed(0)).join(" ")}`).toBeGreaterThan(8);
  // I passaggi sono morbidi: da un campione al successivo (100 ms) la distanza non cambia di colpo.
  const jumps = gaps.slice(1).map((x, i) => Math.abs(x - gaps[i]!));
  expect(Math.max(...jumps), "salto massimo tra due campioni").toBeLessThan(16);
  // Il suono non torna mai a ovattarsi di più (a parte il rumore di misura).
  const smooth = gaps.map((_, i) => Math.min(...gaps.slice(i, i + 3)));
  for (let i = 1; i < smooth.length; i++) expect(smooth[i]!).toBeLessThanOrEqual(smooth[i - 1]! + 3);
});

test("ogni brano ha la sua modalità nella stessa partita: spezzoni, velocità che torna normale, continuo", async ({ newGame, request }) => {
  const file = await uploadTone(request, "tre-modalita.wav", stereoTone(440, 440, 40));
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Tre modalità e2e",
      config: {
        clipSeconds: 20,
        songs: [
          { audio: file, answer: "uno", playback: "loops", loopSeconds: [0.5, 1], loopPauseSeconds: 0.6 },
          { audio: file, answer: "due", playback: "speed_then_normal", speed: 0.6, normalAfterSeconds: 5, speedTransitionSeconds: 1, clipSeconds: 10 },
          { audio: file, answer: "tre", playback: "continuous", clipSeconds: 8 },
        ],
      },
    },
  ]);
  const { screen, admin } = g;
  await startRound(g);
  const next = async (n: number) => {
    await admin.page.getByRole("button", { name: "Salta il brano" }).click();
    await admin.page.getByRole("button", { name: "Prossimo brano" }).click();
    await expect(screen.page.getByText(`Brano ${n} di 3`)).toBeVisible();
  };

  await playMusic(g);
  await expect(screen.page.getByText(/Spezzone 1 di 2/)).toBeVisible();
  await expect(screen.page.locator(".song-mode")).toHaveCount(0);
  // La durata dell'ascolto del brano a spezzoni è la somma degli spezzoni e delle pause, non i 20 s del round.
  await expect(screen.page.getByText(/Nessuno l'ha indovinata/)).toBeVisible({ timeout: 8_000 });
  await admin.page.getByRole("button", { name: "Prossimo brano" }).click();
  await expect(screen.page.getByText("Brano 2 di 3")).toBeVisible();

  await playMusic(g);
  await expect(screen.page.locator(".song-mode[data-mode='speed_then_normal']")).toContainText("rallentato, poi torna normale");
  await expect(screen.page.locator(".song-loop")).toHaveCount(0);
  await next(3);

  await playMusic(g);
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  await expect(screen.page.locator(".song-mode")).toHaveCount(0);
  await expect(screen.page.locator(".song-loop")).toHaveCount(0);
  // Il brano continuo ha l'ascolto di 8 s scelto per lui: dopo 8 s (più la tolleranza) nessuno l'ha indovinata.
  await expect(screen.page.getByText(/Nessuno l'ha indovinata/)).toBeVisible({ timeout: 14_000 });
});

test("i telefoni non ricevono nulla delle modalità di ascolto", async ({ newGame, request }) => {
  const file = await uploadTone(request, "riservato.wav", stereoTone(440, 440, 20));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Riservato e2e", config: { songs: [{ audio: file, answer: SECRET, playback: "blur_stages", clipSeconds: 40 }], clipSeconds: 30 } },
  ]);
  await startRound(g);
  await playMusic(g);
  await expect(g.screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  await expect(g.a.page.getByRole("button", { name: "LO SO!" })).toBeVisible();
  const traffic = g.a.traffic.text();
  expect(traffic).not.toContain(file);
  expect(traffic).not.toContain(SECRET);
  expect(traffic).not.toMatch(/blur_stages|stage1Seconds|"stages"|keepPitch|heavy_blur/);
});

// ---- Editor ----

async function newSongInstance(browser: import("@playwright/test").Browser, request: import("@playwright/test").APIRequestContext) {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  const title = unique("Canzoni modalità");
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(title);
  await page.getByLabel("Titolo e artista (solo regia)").first().fill("Prova - Artista");
  return { ...admin, title };
}
const modeSelect = (page: import("@playwright/test").Page) => page.getByLabel("Modalità di ascolto del brano");
const labelled = (page: import("@playwright/test").Page, text: string | RegExp) => page.getByLabel(text);

plain("editor: ogni modalità mostra solo i suoi campi, brano per brano", async ({ browser, request }) => {
  const { page } = await newSongInstance(browser, request);
  await openAdvanced(page);
  await page.getByLabel("Link YouTube (facoltativo)").first().fill("https://youtu.be/_9HHju9_hMM");

  // Predefinito: ascolto continuo con la sua durata, senza campi di altre modalità; «Come nel round» non esiste più.
  await expect(modeSelect(page)).toHaveValue("continuous");
  await expect(modeSelect(page).locator("option[value=inherit]")).toHaveCount(0);
  await expect(labelled(page, /Durata dell'ascolto di questo brano/)).toHaveValue("30");
  for (const name of [/Velocità del brano/, /Mantieni l'intonazione/, /Pausa tra gli spezzoni di questo brano/, /Secondi di suono molto ovattato/, /Dopo quanti secondi torna/]) {
    await expect(labelled(page, name)).toHaveCount(0);
  }
  await expect(labelled(page, /Durata dell'ascolto di questo brano/)).toBeVisible();

  await modeSelect(page).selectOption({ label: "A spezzoni crescenti" });
  await expect(labelled(page, /Pausa tra gli spezzoni di questo brano/)).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Aggiungi spezzone del brano" })).toBeVisible();
  await expect(labelled(page, /Velocità del brano/)).toHaveCount(0);
  await expect(labelled(page, /Durata dell'ascolto di questo brano/)).toHaveCount(0); // negli spezzoni vale il totale degli spezzoni

  await modeSelect(page).selectOption({ label: "Più lento o più veloce" });
  await expect(labelled(page, /Velocità del brano/)).toHaveValue("0.7");
  await expect(labelled(page, /Mantieni l'intonazione/)).toBeChecked();
  await expect(labelled(page, /Dopo quanti secondi torna/)).toHaveCount(0);
  await expect(labelled(page, /Pausa tra gli spezzoni di questo brano/)).toHaveCount(0);

  await modeSelect(page).selectOption({ label: "Velocità diversa all'inizio, poi normale" });
  await expect(labelled(page, /Velocità del brano/)).toBeVisible();
  await expect(labelled(page, /Dopo quanti secondi torna/)).toHaveValue("8");
  await expect(labelled(page, /Durata del passaggio alla velocità normale/)).toHaveValue("2");

  await modeSelect(page).selectOption({ label: "Molto ovattato, poi poco, poi normale" });
  await expect(labelled(page, /Secondi di suono molto ovattato/)).toHaveValue("8");
  await expect(labelled(page, /Secondi di suono poco ovattato/)).toHaveValue("8");
  await expect(labelled(page, /Durata di ogni passaggio tra le fasi/)).toHaveValue("3");
  await expect(labelled(page, /Velocità del brano/)).toHaveCount(0);
  await closeAdvanced(page);
  await expect(page.getByRole("list", { name: "Impostazioni del brano 1" })).toContainText("ascolto molto ovattato, poi poco, poi normale");

  // Le modalità sono per brano: un secondo brano parte dal predefinito e ha le sue scelte.
  await page.getByRole("button", { name: "+ Aggiungi link YouTube" }).click();
  await page.getByLabel("Link YouTube da aggiungere").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Aggiungi i link" }).click();
  await openAdvanced(page, 2);
  await expect(modeSelect(page)).toHaveValue("continuous");
  await modeSelect(page).selectOption({ label: "Più lento o più veloce" });
  await expect(labelled(page, /Velocità del brano/)).toHaveCount(1);
  await expect(labelled(page, /Secondi di suono molto ovattato/)).toHaveCount(0);
  await closeAdvanced(page, 2);
  await openAdvanced(page, 1);
  await expect(modeSelect(page)).toHaveValue("blur_stages");
  await expect(labelled(page, /Secondi di suono molto ovattato/)).toHaveCount(1);
  await expect(labelled(page, /Velocità del brano/)).toHaveCount(0);
});

plain("editor: le modalità si salvano per brano e si ritrovano riaprendo l'istanza", async ({ browser, request }) => {
  const { page, title } = await newSongInstance(browser, request);
  await addSongFiles(page, { name: "salva-modalita.wav", mimeType: "audio/wav", buffer: stereoTone(440, 440, 5) });
  await openAdvanced(page);
  await expect(page.locator("audio[aria-label='Anteprima']").first()).toBeVisible();
  await modeSelect(page).selectOption({ label: "Velocità diversa all'inizio, poi normale" });
  await labelled(page, /Velocità del brano/).fill("1.5");
  await labelled(page, /Mantieni l'intonazione/).uncheck();
  await labelled(page, /Dopo quanti secondi torna/).fill("6");
  await labelled(page, /Durata dell'ascolto di questo brano/).fill("20");
  await closeAdvanced(page);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.locator(".library ul.list li", { hasText: title }).getByRole("button", { name: "Modifica" }).click();
  await expect(page.getByRole("list", { name: "Impostazioni del brano 1" })).toContainText("ascolto velocità diversa, poi normale (×1,5), 20 s");
  await openAdvanced(page);
  await expect(modeSelect(page)).toHaveValue("speed_then_normal");
  await expect(labelled(page, /Velocità del brano/)).toHaveValue("1.5");
  await expect(labelled(page, /Mantieni l'intonazione/)).not.toBeChecked();
  await expect(labelled(page, /Dopo quanti secondi torna/)).toHaveValue("6");
  await expect(labelled(page, /Durata dell'ascolto di questo brano/)).toHaveValue("20");
});

plain("editor: rifiuta con un messaggio chiaro ciò che non può funzionare", async ({ browser, request }) => {
  const { page } = await newSongInstance(browser, request);
  await openAdvanced(page);
  await page.getByLabel("Link YouTube (facoltativo)").first().fill("https://youtu.be/_9HHju9_hMM");

  // Velocità e fasi non valgono per YouTube (l'audio sta in un iframe e non si può elaborare)…
  for (const mode of ["Più lento o più veloce", "Velocità diversa all'inizio, poi normale", "Molto ovattato, poi poco, poi normale"]) {
    await modeSelect(page).selectOption({ label: mode });
    await closeAdvanced(page);
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.locator(".error"), mode).toContainText("solo con i file caricati, non con i link YouTube");
    await openAdvanced(page);
  }
  // …mentre continuo e spezzoni sì.
  await modeSelect(page).selectOption({ label: "Continuo" });
  await closeAdvanced(page);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
});

plain("editor: il suono che torna normale dopo la fine dell'ascolto non si salva, e si sistema allungando l'ascolto", async ({ browser, request }) => {
  const { page } = await newSongInstance(browser, request);
  await addSongFiles(page, { name: "troppo-tardi.wav", mimeType: "audio/wav", buffer: stereoTone(440, 440, 5) });
  await openAdvanced(page);
  await expect(page.locator("audio[aria-label='Anteprima']").first()).toBeVisible();
  await modeSelect(page).selectOption({ label: "Velocità diversa all'inizio, poi normale" });
  await labelled(page, /Dopo quanti secondi torna/).fill("40");
  await closeAdvanced(page);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.locator(".error")).toContainText("Brano 1: il suono torna normale dopo 42 s, ma l'ascolto dura 30 s");
  await openAdvanced(page);
  await labelled(page, /Durata dell'ascolto di questo brano/).fill("60");
  await closeAdvanced(page);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
});

plain("editor: «Prova l'ascolto» suona il brano alla velocità scelta e si ferma da solo o a comando", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page, context } = admin;
  await context.addInitScript(PLAYER_SPY);
  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni prova"));
  await page.getByLabel("Titolo e artista (solo regia)").first().fill("Prova - Artista");
  await addSongFiles(page, { name: "prova-ascolto.wav", mimeType: "audio/wav", buffer: stereoTone(440, 440, 30) });
  await openAdvanced(page);
  await expect(page.locator("audio[aria-label='Anteprima']").first()).toBeVisible();
  await modeSelect(page).selectOption({ label: "Più lento o più veloce" });
  await labelled(page, /Velocità del brano/).fill("0.5");
  await labelled(page, /Durata dell'ascolto di questo brano/).fill("5");

  const trial = page.locator(".listen-trial").first();
  await expect(trial).toContainText("più lento o più veloce, 5 s");
  await page.getByRole("button", { name: "▶ Prova l'ascolto" }).click();
  await expect(trial).toHaveAttribute("data-state", "playing");
  const trialPlayer = () =>
    page.evaluate(() => {
      const el = (window as any).__players.find((p: HTMLMediaElement) => p.src.includes(".wav") && p.playbackRate !== 1) as HTMLMediaElement | undefined;
      return el ? { rate: el.playbackRate, paused: el.paused } : null;
    });
  await expect.poll(trialPlayer, { timeout: 10_000 }).toEqual({ rate: 0.5, paused: false });

  // A comando.
  await page.getByRole("button", { name: "■ Ferma la prova" }).click();
  await expect(trial).toHaveAttribute("data-state", "idle");
  // (il lettore viene smontato: src e velocità tornano ai valori di partenza, quindi si guardano tutti i lettori avviati)
  await expect.poll(() => page.evaluate(() => (window as any).__players.length > 0 && (window as any).__players.every((p: HTMLMediaElement) => p.paused))).toBe(true);

  // Da solo, alla fine dell'ascolto.
  await page.getByRole("button", { name: "▶ Prova l'ascolto" }).click();
  await expect(trial).toHaveAttribute("data-state", "playing");
  await expect(trial).toHaveAttribute("data-state", "idle", { timeout: 15_000 });
});

plain("editor: «Prova l'ascolto» a spezzoni usa gli spezzoni del brano, e uno diverso dal round", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page, context } = admin;
  await context.addInitScript(SOURCE_SPY);
  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni prova spezzoni"));
  await page.getByLabel("Titolo e artista (solo regia)").first().fill("Prova - Artista");
  await addSongFiles(page, { name: "prova-spezzoni.wav", mimeType: "audio/wav", buffer: stereoTone(440, 440, 20) });
  await openAdvanced(page);
  await expect(page.locator("audio[aria-label='Anteprima']").first()).toBeVisible();
  await labelled(page, /Parti da \(secondi\)/).fill("2");
  await modeSelect(page).selectOption({ label: "A spezzoni crescenti" });
  // Passando agli spezzoni compaiono i cinque predefiniti (0,5 · 1 · 2 · 4 · 8): se ne tolgono tre e restano due propri.
  const loops = page.getByRole("group", { name: /Durata degli spezzoni di questo brano/ });
  await expect(labelled(page, "Spezzone del brano 5")).toHaveValue("8");
  for (let n = 5; n > 2; n--) await loops.getByRole("button", { name: "Elimina" }).last().click();
  await expect(labelled(page, "Spezzone del brano 3")).toHaveCount(0);
  await labelled(page, "Spezzone del brano 1").fill("0.5");
  await labelled(page, "Spezzone del brano 2").fill("1");
  await labelled(page, /Pausa tra gli spezzoni di questo brano/).fill("0.5");

  const trial = page.locator(".listen-trial").first();
  await expect(trial).toContainText("a spezzoni crescenti, 2,5 s"); // (0,5 + 0,5) + (1 + 0,5)
  await page.getByRole("button", { name: "▶ Prova l'ascolto" }).click();
  await expect(trial).toHaveAttribute("data-state", "idle", { timeout: 12_000 });
  const calls = await page.evaluate(() => (window as any).__sources as { name: string; at: number; when: number; offset: number }[]);
  const starts = calls.filter((c) => c.name === "start" && c.offset > 1.5);
  const planned = calls.filter((c) => c.name === "stop" && c.when > 0).map((c) => c.when - c.at);
  expect(starts, JSON.stringify(calls)).toHaveLength(2);
  for (const s of starts) expect(s.offset).toBeCloseTo(2, 1);
  expect(planned[0]!).toBeCloseTo(0.5, 1);
  expect(planned[1]!).toBeCloseTo(1, 1);
});
