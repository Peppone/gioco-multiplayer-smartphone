import { expect } from "@playwright/test";
import { test } from "./support";
import { unlockAudio, uploadTone, stereoTone } from "./audio-support";

// Dopo una risposta sbagliata la regia fa ripartire la musica: lo schermo deve tornare a suonare davvero.

const SECRET = "TITOLO-RIPRESA-E2E";

const MODES: Record<string, Record<string, unknown>> = {
  semplice: {},
  lento: { playback: "speed", speed: 0.5 },
  "lento poi normale": { playback: "speed_then_normal", speed: 0.5, normalAfterSeconds: 3, speedTransitionSeconds: 2 },
  ovattato: { playback: "blur_stages", stage1Seconds: 4, stage2Seconds: 4, stageTransitionSeconds: 2 },
  effetto: { effects: [{ type: "blur", amount: 100 }] },
  graduale: { effects: [{ type: "blur", amount: 100 }], progressive: true, clearAtPercent: 80 },
};

for (const [mode, extra] of Object.entries(MODES)) test(`indovina la canzone (${mode}): dopo una risposta sbagliata la musica riparte e suona`, async ({ newGame, request }) => {
  const song = await uploadTone(request, "ripresa.wav", stereoTone(440, 440, 30));
  const g = await newGame([{ typeId: "indovina-canzone", title: "Ripresa e2e", config: { songs: [{ audio: song, answer: SECRET, ...extra }], clipSeconds: 30 } }]);
  const { screen, admin, a } = g;
  await screen.context.addInitScript(`
    window.__players = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (!window.__players.includes(this)) window.__players.push(this); return play.apply(this, arguments); };`);
  await screen.page.reload();
  await unlockAudio(screen.page);

  const state = () =>
    screen.page.evaluate(() => {
      const p = ((window as any).__players as HTMLMediaElement[]).find((e) => e.src.includes(".wav"));
      return p ? { paused: p.paused, ct: p.currentTime, muted: p.muted, error: p.error?.message ?? null } : null;
    });

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  await expect.poll(async () => (await state())?.paused, { timeout: 8_000 }).toBe(false);

  const t0 = (await state())!.ct;
  await screen.page.waitForTimeout(1_000);
  const t1 = await state();
  expect(t1!.ct, "prima partenza: " + JSON.stringify(t1)).toBeGreaterThan(t0);
  await a.page.getByRole("button", { name: "LO SO!" }).click();
  await expect(screen.page.getByText(/risponde!/)).toBeVisible();
  await expect.poll(async () => (await state())?.paused).toBe(true);

  await admin.page.getByRole("button", { name: "Risposta sbagliata" }).click();
  await expect(screen.page.getByText(/La musica riparte/).first()).toBeVisible();
  await admin.page.getByRole("button", { name: "Riprendi la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();

  const first = await expect.poll(async () => (await state())?.paused, { timeout: 8_000 }).toBe(false).then(state);
  await screen.page.waitForTimeout(1_000);
  const later = await state();
  expect(later?.ct, JSON.stringify({ first, later })).toBeGreaterThan(first!.ct);
  expect(later?.muted).toBe(false);
  expect(later?.error).toBeNull();
});

test("indovina la canzone: con la riprenotazione chi sbaglia vede il conto alla rovescia e poi può prenotarsi di nuovo", async ({ newGame, request }) => {
  const song = await uploadTone(request, "riprenota.wav", stereoTone(440, 440, 30));
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Riprenotazione e2e",
      config: { songs: [{ audio: song, answer: SECRET }], clipSeconds: 30, rebuzz: true, rebuzzCooldownSeconds: 4 },
    },
  ]);
  const { screen, admin, a, b } = g;
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(a.page.getByRole("button", { name: "LO SO!" })).toBeEnabled();

  await a.page.getByRole("button", { name: "LO SO!" }).click();
  await expect(screen.page.getByText(/risponde!/)).toBeVisible();
  await expect(a.page.getByTestId("rebuzz-wait")).toHaveCount(0);
  await admin.page.getByRole("button", { name: "Risposta sbagliata" }).click();

  // Solo chi ha sbagliato vede l'attesa; il pulsante è spento finché non finisce.
  await expect(a.page.getByTestId("rebuzz-wait")).toBeVisible();
  await expect(b.page.getByTestId("rebuzz-wait")).toHaveCount(0);
  await admin.page.getByRole("button", { name: "Riprendi la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();
  await expect(a.page.getByRole("button", { name: "Hai sbagliato…" })).toBeDisabled();
  await expect(b.page.getByRole("button", { name: "LO SO!" })).toBeEnabled();

  // Finita l'attesa il pulsante torna attivo e la prenotazione vale.
  await expect(a.page.getByRole("button", { name: "LO SO!" })).toBeEnabled({ timeout: 8_000 });
  await expect(a.page.getByTestId("rebuzz-wait")).toHaveCount(0);
  await a.page.getByRole("button", { name: "LO SO!" }).click();
  await expect(a.page.getByText("Tocca a te: rispondi a voce!")).toBeVisible();

  await admin.page.getByRole("button", { name: "Risposta corretta" }).click();
  await admin.page.getByRole("button", { name: "Concludi" }).click();
});
