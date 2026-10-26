import { expect, test as plain } from "@playwright/test";
import { SOURCE_SPY, TAP_SCRIPT, closeAdvanced, openAdvanced, silentWav, stereoTone, unlockAudio, uploadTone } from "./audio-support";
import { adminToken, openAdmin, test, unique } from "./support";

const SECRET = "TITOLO-SEGRETO-E2E";

// ---- Categorie scelte dai capisquadra ----

test("categorie: i capisquadra scelgono a turno la categoria, gli altri telefoni non la vedono e il brano è della categoria scelta", async ({ newGame, request }) => {
  const [rock, pop, jazz] = [await uploadTone(request, "rock.wav", silentWav()), await uploadTone(request, "pop.wav", silentWav()), await uploadTone(request, "jazz.wav", silentWav())];
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Categorie e2e",
      config: {
        songs: [
          { audio: rock, answer: "ROCK-SEGRETO", categories: ["Cat Rock"] },
          { audio: pop, answer: "POP-SEGRETO", categories: ["Cat Pop"] },
          { audio: jazz, answer: "JAZZ-SEGRETO", categories: ["Cat Jazz"] },
        ],
        pickCategory: true,
        pickSeconds: 60,
        clipSeconds: 30,
      },
    },
  ]);
  const { screen, admin, a, b, teams, nickA, nickB } = g;

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  // Le squadre toccano in ordine di nome: «Blu…» viene prima di «Rossi…».
  await expect(screen.page.getByText(`Tocca a ${teams.blue.name}: ${nickB} sceglie la categoria!`)).toBeVisible();
  await expect(screen.page.getByRole("list", { name: "Categorie" })).toContainText("Cat Pop");
  await expect(b.page.getByRole("heading", { name: "Scegli la categoria!" })).toBeVisible();
  await expect(a.page.getByText(`Sceglie la squadra ${teams.blue.name}…`)).toBeVisible();
  // Chi non sceglie non riceve nemmeno l'elenco; nessuno riceve file o titoli prima della scelta.
  expect(a.traffic.text()).not.toContain("Cat Pop");
  for (const client of [screen, a, b]) {
    const text = client.traffic.text();
    expect(text).not.toContain("SEGRETO");
    for (const file of [rock, pop, jazz]) expect(text).not.toContain(file);
  }
  await expect(a.page.getByRole("button", { name: /Cat/ })).toHaveCount(0);

  const popRequest = screen.page.waitForRequest((r) => r.url().includes(`/media/${pop}`));
  await b.page.getByRole("button", { name: /Cat Pop/ }).click();
  await popRequest;
  await expect(screen.page.getByText("Categoria: Cat Pop")).toBeVisible();
  await expect(b.page.getByText("Categoria: Cat Pop")).toBeVisible();
  expect(screen.traffic.text()).not.toContain(rock); // il file delle categorie non scelte resta nascosto

  // Si gioca il brano, poi la scelta passa all'altra squadra.
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await a.page.getByRole("button", { name: "LO SO!" }).click();
  await admin.page.getByRole("button", { name: "Risposta corretta" }).click();
  await expect(screen.page.locator(".answer", { hasText: "POP-SEGRETO" })).toBeVisible();
  await admin.page.getByRole("button", { name: "Prossimo brano" }).click();
  await expect(screen.page.getByText(`Tocca a ${teams.red.name}: ${nickA} sceglie la categoria!`)).toBeVisible();
  await expect(screen.page.getByRole("list", { name: "Categorie" })).not.toContainText("Cat Pop"); // già suonata
  await expect(a.page.getByRole("button", { name: /Cat Jazz/ })).toBeVisible();
  await expect(b.page.getByText(`Sceglie la squadra ${teams.red.name}…`)).toBeVisible();
});

test("categorie: la regia può scegliere al posto del capitano e, scaduto il tempo, la categoria è estratta a sorte", async ({ newGame, request }) => {
  const files = [await uploadTone(request, "a.wav", silentWav()), await uploadTone(request, "b.wav", silentWav()), await uploadTone(request, "c.wav", silentWav())];
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Regia e sorte e2e",
      config: {
        songs: files.map((audio, i) => ({ audio, answer: `T${i}`, categories: [`Genere ${i}`] })),
        pickCategory: true,
        pickSeconds: 5,
      },
    },
  ]);
  const { screen, admin } = g;
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByRole("list", { name: "Categorie" })).toBeVisible();
  // La regia vede un pulsante per ogni categoria e chi deve scegliere.
  await expect(admin.page.getByText("Sceglie la categoria")).toBeVisible();
  await admin.page.getByRole("button", { name: /Scegli «Genere 1»/ }).click();
  await expect(screen.page.getByText("Categoria: Genere 1")).toBeVisible();
  await admin.page.getByRole("button", { name: "Salta il brano" }).click();
  await admin.page.getByRole("button", { name: "Prossimo brano" }).click();
  // Nessuno sceglie: dopo 5 secondi tocca alla sorte (sono rimaste «Genere 0» e «Genere 2»).
  await expect(screen.page.getByRole("list", { name: "Categorie" })).toBeVisible();
  await expect(screen.page.getByText(/Categoria: Genere [02]/)).toBeVisible({ timeout: 12_000 });
});

test("capitani: la regia designa il capitano della squadra e solo lui sceglie la categoria", async ({ newGame, request }) => {
  const files = [await uploadTone(request, "c1.wav", silentWav()), await uploadTone(request, "c2.wav", silentWav()), await uploadTone(request, "c3.wav", silentWav())];
  const g = await newGame(
    [
      {
        typeId: "indovina-canzone",
        title: "Capitani e2e",
        config: { songs: files.map((audio, i) => ({ audio, answer: `T${i}`, categories: [`Cat ${i}`] })), pickCategory: true, pickSeconds: 60 },
      },
    ],
    { playersPerTeam: 2 },
  );
  const { admin, blues, screen } = g;
  // Nella squadra Blu i giocatori sono Bob e Bea: senza capitano designato sceglierebbe il primo per nome (Bea).
  const [bob, bea] = blues;
  const nickBob = await bob!.page.getByRole("heading", { level: 1 }).innerText();
  const nickBea = await bea!.page.getByRole("heading", { level: 1 }).innerText();
  await admin.page.getByRole("button", { name: `Capitano di ${nickBob}` }).click();
  await expect(admin.page.getByRole("button", { name: `Capitano di ${nickBob}` })).toHaveAttribute("aria-pressed", "true");
  await admin.page.getByRole("button", { name: `Capitano di ${nickBea}` }).click(); // il nuovo sostituisce il vecchio
  await expect(admin.page.getByRole("button", { name: `Capitano di ${nickBea}` })).toHaveAttribute("aria-pressed", "true");
  await expect(admin.page.getByRole("button", { name: `Capitano di ${nickBob}` })).toHaveAttribute("aria-pressed", "false");
  await admin.page.getByRole("button", { name: `Capitano di ${nickBob}` }).click();
  await expect(admin.page.getByRole("button", { name: `Capitano di ${nickBob}` })).toHaveAttribute("aria-pressed", "true");

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText(new RegExp(`Tocca a .*: ${nickBob} sceglie la categoria!`))).toBeVisible();
  await expect(bob!.page.getByRole("heading", { name: "Scegli la categoria!" })).toBeVisible();
  await expect(bea!.page.getByRole("button", { name: /Cat \d/ })).toHaveCount(0);
});

// ---- Ascolto a spezzoni crescenti ----

test("spezzoni crescenti: la musica suona e tace agli istanti previsti e gli spezzoni durano sempre di più", async ({ newGame, request }) => {
  const song = await uploadTone(request, "tono-spezzoni.wav", stereoTone(440));
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Spezzoni e2e",
      config: { songs: [{ audio: song, answer: SECRET, startSeconds: 1 }], playback: "loops", loopSeconds: [0.5, 1], loopPauseSeconds: 0.6 },
    },
  ]);
  const { screen, admin, a } = g;
  await screen.context.addInitScript(SOURCE_SPY);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText("Brano 1 di 1")).toBeVisible();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/Spezzone 1 di 2 \(0,5 s\)/)).toBeVisible();

  // Il secondo spezzone dura di più; nelle pause il pulsante dei telefoni resta attivo.
  await expect(screen.page.getByText(/Spezzone 2 di 2 \(1 s\)/)).toBeVisible({ timeout: 5_000 });
  await expect(a.page.getByRole("button", { name: "LO SO!" })).toBeEnabled();
  await expect(screen.page.getByText(/Nessuno l'ha indovinata/)).toBeVisible({ timeout: 8_000 });

  // Il brano suona due volte, dallo stesso punto (secondo 1), e ogni spezzone ha la durata scelta: 0,5 s e poi 1 s.
  const calls = await screen.page.evaluate(() => (window as any).__sources as { name: string; at: number; when: number; offset: number }[]);
  // (gli effetti sonori dell'interfaccia usano le stesse sorgenti, ma partono dall'inizio del loro file)
  const starts = calls.filter((c) => c.name === "start" && c.offset > 0.5);
  const planned = calls.filter((c) => c.name === "stop" && c.when > 0).map((c) => c.when - c.at);
  expect(starts, JSON.stringify(calls)).toHaveLength(2);
  for (const s of starts) expect(s.offset).toBeCloseTo(1, 1);
  expect(planned).toHaveLength(2);
  expect(planned[0]!, "primo spezzone").toBeCloseTo(0.5, 1);
  expect(planned[1]!, "secondo spezzone").toBeCloseTo(1, 1);
  // Fra l'attacco dei due spezzoni: il primo (0,5 s) e la pausa (0,6 s). Tolleranza ampia sui timer della pagina.
  const between = starts[1]!.at - starts[0]!.at;
  expect(between, "attacco a attacco").toBeGreaterThan(0.95);
  expect(between).toBeLessThan(1.45);
});

test("spezzoni crescenti: prenotandosi nella pausa la musica si ferma e si può rispondere", async ({ newGame, request }) => {
  const song = await uploadTone(request, "tono-pausa.wav", stereoTone(440));
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Pausa e2e",
      config: { songs: [{ audio: song, answer: SECRET }], playback: "loops", loopSeconds: [0.5, 2], loopPauseSeconds: 3, minPoints: 0, maxPoints: 100 },
    },
  ]);
  const { screen, admin, a } = g;
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  // Il primo spezzone dura 0,5 s: subito dopo siamo in pausa.
  await expect(screen.page.locator(".song-loop[data-sounding='false']")).toBeVisible();
  await a.page.getByRole("button", { name: "LO SO!" }).click();
  await expect(screen.page.getByText(/risponde!/)).toBeVisible();
  await admin.page.getByRole("button", { name: "Risposta corretta" }).click();
  await expect(screen.page.getByText(/\+\d+!/)).toBeVisible();
});

// ---- Suono che si svela ----

test("svela gradualmente: il brano parte sfocato e il suono diventa nitido col passare del tempo", async ({ newGame, request }) => {
  // 200 Hz passa il filtro «molto sfocato»; 8000 Hz è tagliato finché il filtro non si apre.
  // Ascolto lungo (12 s): anche con la macchina sotto carico il primo campione arriva quando il suono è ancora ovattato.
  const mix = await uploadTone(request, "svela-grave-acuto.wav", stereoTone([200, 8_000], [200, 8_000], 12));
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Svela e2e",
      config: { songs: [{ audio: mix, answer: "a", effect: "heavy_blur" }], clipSeconds: 12, progressive: true, clearAtPercent: 100 },
    },
  ]);
  const { screen, admin } = g;
  await screen.context.addInitScript(TAP_SCRIPT);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect(screen.page.getByText(/PRENOTATEVI/)).toBeVisible();

  // All'inizio l'acuto è molto più basso del grave (suono ovattato)…
  await expect.poll(() => screen.page.evaluate(() => (window as any).__db(200) as number), { timeout: 8_000 }).toBeGreaterThan(-60);
  const early = await screen.page.evaluate(() => ({ low: (window as any).__db(200) as number, high: (window as any).__db(8_000) as number }));
  expect(early.low - early.high, `all'inizio: grave ${early.low} dB, acuto ${early.high} dB`).toBeGreaterThan(25);
  // …e prima della fine dell'ascolto l'acuto arriva quasi al livello del grave (suono nitido).
  await expect
    .poll(async () => screen.page.evaluate(() => (window as any).__db(200) - (window as any).__db(8_000)), { timeout: 14_000, intervals: [100] })
    .toBeLessThan(12);
});

test("senza «Svela gradualmente» il suono resta sfocato per tutto l'ascolto", async ({ newGame, request }) => {
  const mix = await uploadTone(request, "fisso-grave-acuto.wav", stereoTone([200, 8_000]));
  const g = await newGame([
    { typeId: "indovina-canzone", title: "Sfocato fisso e2e", config: { songs: [{ audio: mix, answer: "a", effect: "heavy_blur" }], clipSeconds: 3 } },
  ]);
  const { screen, admin } = g;
  await screen.context.addInitScript(TAP_SCRIPT);
  await screen.page.reload();
  await unlockAudio(screen.page);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await expect.poll(() => screen.page.evaluate(() => (window as any).__db(200) as number), { timeout: 8_000 }).toBeGreaterThan(-60);
  const levels: number[] = [];
  for (let i = 0; i < 4; i++) {
    levels.push(await screen.page.evaluate(() => (window as any).__db(200) - (window as any).__db(8_000)));
    await screen.page.waitForTimeout(300);
  }
  expect(Math.min(...levels), `differenze in dB: ${levels.join(", ")}`).toBeGreaterThan(25);
});

plain("editor: categorie, spezzoni e scelta della categoria si configurano dal modulo", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Canzoni categorie"));
  await page.getByLabel("Titolo e artista (solo regia)").first().fill("Prova - Artista");

  // Le categorie del brano si scrivono una per riga, nel pannello «Avanzato», e compaiono nel riassunto della riga.
  await openAdvanced(page);
  await page.getByLabel("Link YouTube (facoltativo)").first().fill("https://youtu.be/_9HHju9_hMM");
  await page.getByLabel("Categorie").first().fill("Anni 80\nRock");
  // L'ascolto si decide brano per brano, nello stesso pannello: a spezzoni, con i valori predefiniti 0,5 · 1 · 2 · 4 · 8.
  await expect(page.getByLabel("Come si ascolta")).toHaveCount(0); // non c'è più un predefinito del round nel modulo
  await page.getByLabel("Modalità di ascolto del brano").selectOption("loops");
  await expect(page.getByLabel("Spezzone del brano 5")).toHaveValue("8");
  await page.getByLabel("Pausa tra gli spezzoni di questo brano (secondi)").fill("2");
  await closeAdvanced(page);
  await expect(page.getByRole("list", { name: "Impostazioni del brano 1" })).toContainText("categorie: Anni 80, Rock");
  await expect(page.getByRole("list", { name: "Impostazioni del brano 1" })).toContainText("ascolto a spezzoni crescenti (0,5 · 1 · 2 · 4 · 8 s)");
  // Senza un effetto su almeno un brano «Svela gradualmente» non si salva, e il messaggio lo spiega.
  await page.getByLabel(/Svela gradualmente il suono/).check();
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText(/non ha effetto se nessun brano ha un effetto/)).toBeVisible();
  await page.getByLabel(/Svela gradualmente il suono/).uncheck();

  await page.getByLabel(/I capisquadra scelgono la categoria/).check();
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
});
