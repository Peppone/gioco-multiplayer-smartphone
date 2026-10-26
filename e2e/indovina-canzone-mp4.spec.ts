import { expect, test as plain } from "@playwright/test";
import { SOURCE_SPY, TAP_SCRIPT, addSongFiles, closeAdvanced, openAdvanced, recordMp4, unlockAudio, uploadTone } from "./audio-support";
import { adminToken, openAdmin, test, unique } from "./support";

// Il quiz musicale accetta anche i video mp4: del file si usa solo la traccia audio. I file sono veri mp4 (H.264 + AAC)
// registrati da Edge con un tono a 440 Hz, così si misura che il suono esca davvero.

const SECRET = "TITOLO-MP4-E2E";
const HZ = 440;

plain("mp4: il caricamento salva un file .mp4, servito come video/mp4 e con supporto a Range", async ({ browser, request }) => {
  const mp4 = await recordMp4(browser, HZ);
  const file = await uploadTone(request, "Videoclip.mp4", mp4, "video/mp4");
  expect(file).toMatch(/^[0-9a-f-]{36}\.mp4$/);

  const full = await request.get(`/media/${file}`);
  expect(full.status()).toBe(200);
  expect(full.headers()["content-type"]).toContain("video/mp4");
  expect((await full.body()).equals(mp4)).toBe(true);
  const part = await request.get(`/media/${file}`, { headers: { Range: "bytes=4-7" } });
  expect(part.status()).toBe(206);
  expect((await part.body()).toString("latin1")).toBe("ftyp");

  // Un file mp4 non si confonde con altri video: il server rifiuta quelli che non sono mp4.
  const mov = await request.post("/api/admin/media", {
    headers: { Authorization: `Bearer ${await adminToken(request)}`, "Content-Type": "video/quicktime", "X-File-Name": "clip.mov" },
    data: mp4,
  });
  expect(mov.status()).toBeGreaterThanOrEqual(400);
});

plain("mp4: l'editor carica un mp4 dal modulo anche se il browser non ne dichiara il tipo, e lo mostra tra i brani", async ({ browser, request }) => {
  const mp4 = await recordMp4(browser, HZ);
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni mp4"));

  // Windows lascia vuoto il tipo di alcuni file: il nome (.mp4) basta a farli riconoscere.
  await addSongFiles(page, { name: "Videoclip senza tipo.mp4", mimeType: "", buffer: mp4 });
  await expect(page.locator(".song-source").first()).toContainText("Videoclip senza tipo.mp4");
  await openAdvanced(page);
  await expect(page.getByLabel(/Scegli Brano.*già caricato/).first()).toContainText("Videoclip senza tipo.mp4");
  await expect(page.locator("audio[aria-label='Anteprima']").first()).toBeVisible();
  await closeAdvanced(page);

  const stored = (await (await request.get("/api/admin/media", { headers: { Authorization: `Bearer ${await adminToken(request)}` } })).json()) as { file: string; name: string }[];
  expect(stored.find((m) => m.name === "Videoclip senza tipo.mp4")?.file).toMatch(/\.mp4$/);

  await page.getByLabel("Titolo e artista (solo regia)").first().fill("Prova - Artista");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
});

test("mp4 nel quiz: lo schermo lo riproduce (lettore normale) e il telefono non riceve né il file né il titolo", async ({ newGame, request, browser }) => {
  const file = await uploadTone(request, "Videoclip.mp4", await recordMp4(browser, HZ), "video/mp4");
  const g = await newGame([{ typeId: "indovina-canzone", title: "Quiz mp4", config: { songs: [{ audio: file, answer: SECRET }], clipSeconds: 30 } }]);
  const { screen, admin, a } = g;
  // Registra gli elementi audio che la pagina fa partire (Howler ne crea uno per brano).
  await screen.context.addInitScript(`
    window.__players = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.__players.push(this); return play.apply(this, arguments); };`);
  await screen.page.reload();
  await unlockAudio(screen.page);

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText("Brano 1 di 1")).toBeVisible();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();

  // Il file mp4 si carica ed è davvero in riproduzione: tempo che avanza, nessun errore del browser.
  await expect
    .poll(
      () =>
        screen.page.evaluate(() => {
          const el = (window as any).__players.find((p: HTMLMediaElement) => p.src.endsWith(".mp4")) as HTMLMediaElement | undefined;
          return el ? { playing: !el.paused && el.currentTime > 0, error: el.error?.message ?? null } : null;
        }),
      { timeout: 10_000 },
    )
    .toEqual({ playing: true, error: null });

  // Il video non si vede mai: né sullo schermo né sui telefoni.
  await expect(screen.page.locator("video")).toHaveCount(0);
  await a.page.getByRole("button", { name: "LO SO!" }).click();
  await expect(a.page.getByText("Tocca a te: rispondi a voce!")).toBeVisible();
  expect(a.traffic.text()).not.toContain(file);
  expect(a.traffic.text()).not.toContain(SECRET);
});

test("mp4 nel quiz con un effetto: l'audio dell'mp4 passa dal grafo Web Audio ed esce dallo schermo", async ({ newGame, request, browser }) => {
  const file = await uploadTone(request, "Videoclip.mp4", await recordMp4(browser, HZ), "video/mp4");
  const g = await newGame([{ typeId: "indovina-canzone", title: "Quiz mp4 sfocato", config: { songs: [{ audio: file, answer: SECRET, effect: "blur" }], clipSeconds: 30 } }]);
  const { screen, admin } = g;
  await screen.context.addInitScript(TAP_SCRIPT);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  await expect.poll(() => screen.page.evaluate((hz) => (window as any).__db(hz) as number, HZ), { timeout: 10_000 }).toBeGreaterThan(-60);
});

test("mp4 a spezzoni crescenti: il file si decodifica e ogni spezzone suona il tono dell'mp4", async ({ newGame, request, browser }) => {
  const file = await uploadTone(request, "Videoclip.mp4", await recordMp4(browser, HZ), "video/mp4");
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Spezzoni mp4",
      config: { songs: [{ audio: file, answer: SECRET, startSeconds: 0.5 }], playback: "loops", loopSeconds: [1, 1], loopPauseSeconds: 0.6 },
    },
  ]);
  const { screen, admin } = g;
  await screen.context.addInitScript(SOURCE_SPY);
  await screen.context.addInitScript(TAP_SCRIPT);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText("Brano 1 di 1")).toBeVisible();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/Spezzone 1 di 2/)).toBeVisible();
  await expect.poll(() => screen.page.evaluate((hz) => (window as any).__db(hz) as number, HZ), { timeout: 10_000 }).toBeGreaterThan(-60);

  await expect(screen.page.getByText(/Nessuno l'ha indovinata/)).toBeVisible({ timeout: 10_000 });
  const calls = await screen.page.evaluate(() => (window as any).__sources as { name: string; at: number; when: number; offset: number }[]);
  const starts = calls.filter((c) => c.name === "start" && c.offset > 0.25);
  expect(starts, JSON.stringify(calls)).toHaveLength(2);
  for (const s of starts) expect(s.offset).toBeCloseTo(0.5, 1);
});
