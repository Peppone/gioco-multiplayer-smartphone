import { expect } from "@playwright/test";
import { adminToken, openAdmin, test, unique } from "./support";
import { test as plain } from "@playwright/test";

/** WAV mono 8 kHz di silenzio (circa mezzo secondo): basta a essere un audio valido. */
function silentWav(): Buffer {
  const samples = 4_000;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8_000, 24);
  header.writeUInt32LE(8_000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, Buffer.alloc(samples, 128)]);
}

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

  await page.getByLabel("Carica Brano").first().setInputFiles({ name: "Mio Brano.wav", mimeType: "audio/wav", buffer: silentWav() });
  await expect(page.getByLabel(/Scegli Brano.*già caricato/).first()).toContainText("Mio Brano.wav");
  await expect(page.locator("audio[aria-label='Anteprima']").first()).toBeVisible();

  await page.getByLabel("Titolo e artista (solo regia)").first().fill("Prova - Artista");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
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

/** WAV stereo 16 bit a 44,1 kHz di circa 4 s: un tono sinusoidale per canale (0 Hz = silenzio). */
function stereoTone(leftHz: number | number[], rightHz: number | number[] = leftHz): Buffer {
  const rate = 44_100;
  const frames = rate * 4;
  const data = Buffer.alloc(frames * 4);
  const sample = (hz: number | number[], i: number) => {
    const tones = [hz].flat().filter((f) => f > 0);
    if (tones.length === 0) return 0;
    return Math.round(tones.reduce((s, f) => s + Math.sin((2 * Math.PI * f * i) / rate), 0) * 0.25 * 32_767);
  };
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(sample(leftHz, i), i * 4);
    data.writeInt16LE(sample(rightHz, i), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Inserisce un analizzatore davanti all'uscita di ogni AudioContext e ne espone il livello (RMS massimo). */
const TAP_SCRIPT = `
  const taps = [];
  const desc = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "destination");
  Object.defineProperty(BaseAudioContext.prototype, "destination", {
    get() {
      if (!this.__tap) {
        const analyser = this.createAnalyser();
        analyser.fftSize = 2048;
        analyser.connect(desc.get.call(this));
        this.__tap = analyser;
        taps.push(analyser);
      }
      return this.__tap;
    },
  });
  window.__db = (hz) => {
    let best = -Infinity;
    for (const a of taps) {
      const buf = new Float32Array(a.frequencyBinCount);
      a.getFloatFrequencyData(buf);
      best = Math.max(best, buf[Math.round((hz * a.fftSize) / a.context.sampleRate)]);
    }
    return best;
  };`;

async function uploadTone(request: import("@playwright/test").APIRequestContext, name: string, wav: Buffer): Promise<string> {
  const res = await request.post("/api/admin/media", {
    headers: { Authorization: `Bearer ${await adminToken(request)}`, "Content-Type": "audio/wav", "X-File-Name": name },
    data: wav,
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { file: string }).file;
}

test("effetto «senza voce»: nello stesso brano il tono centrale (la «voce») sparisce e quello su un canale resta", async ({ newGame, request }) => {
  // 1000 Hz identico sui due canali = «voce»; 3000 Hz solo a sinistra = «strumento».
  const song = await uploadTone(request, "voce-e-strumento.wav", stereoTone([1_000, 3_000], [1_000]));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Senza voce e2e", config: { songs: [{ audio: song, answer: "a", effect: "no_voice" }], clipSeconds: 30 } },
  ]);
  const { screen, admin } = g;
  await screen.context.addInitScript(TAP_SCRIPT);
  await screen.page.reload();
  await screen.page.mouse.click(20, 20); // il tocco che sblocca l'audio
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
  await screen.page.mouse.click(20, 20); // il tocco che sblocca l'audio
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  // Il grave arriva all'uscita (quindi la musica suona davvero) e l'acuto è molto più basso, in decibel.
  await expect.poll(() => screen.page.evaluate(() => (window as any).__db(200) as number), { timeout: 8_000 }).toBeGreaterThan(-60);
  const db = await screen.page.evaluate(() => ({ low: (window as any).__db(200) as number, high: (window as any).__db(8_000) as number }));
  expect(db.low - db.high, `grave ${db.low} dB, acuto ${db.high} dB`).toBeGreaterThan(30);
});
