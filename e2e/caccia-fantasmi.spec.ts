import { expect } from "@playwright/test";
import { lastPlayerView, test } from "./support";

test("caccia ai fantasmi: ruoli segreti, QR di zona, conquista, cattura e schermo senza identità", async ({ newGame }) => {
  const g = await newGame([
    {
      typeId: "caccia-fantasmi",
      title: "Fantasmi e2e",
      theme: "retro80",
      config: {
        zones: [
          { name: "Cantina", code: "ABCD" },
          { name: "Giardino", code: "WXYZ" },
        ],
        ghostCount: 1,
        durationSec: 120,
        headStartSec: 0,
        scanCooldownSec: 0,
        accuseCooldownSec: 0,
        jailSec: 60,
        zoneLockSec: 120, // lungo, così il test non dipende dal tempo
      },
    },
  ]);
  const { screen, admin, a, b, nickA, nickB } = g;

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();

  // Preparazione: la regia ha i QR da stampare, lo schermo le zone, ogni telefono il proprio ruolo.
  await expect(screen.page.getByText("Caccia ai Fantasmi")).toBeVisible();
  await expect(screen.page.locator(".gf-zone")).toHaveCount(2);
  await expect(admin.page.locator(".zone-sheet figure")).toHaveCount(2);
  await expect(admin.page.locator(".zone-sheet figure", { hasText: "ABCD" }).locator("svg")).toBeVisible();
  await expect(admin.page.getByText("Fantasmi (segreto)")).toBeVisible();
  await expect(a.page.locator(".gf-role")).toBeVisible();
  await expect(b.page.locator(".gf-role")).toBeVisible();
  const aIsGhost = (await a.page.locator(".gf-role").getAttribute("data-role")) === "ghost";
  const [ghost, hunter, ghostNick, hunterNick] = aIsGhost ? [a, b, nickA, nickB] : [b, a, nickB, nickA];
  await expect(ghost.page.locator('.gf-role[data-role="ghost"]')).toBeVisible();
  await expect(hunter.page.locator('.gf-role[data-role="hunter"]')).toBeVisible();
  // Il bottone «Regole» apre la spiegazione con i numeri di questa partita e la parte del proprio ruolo.
  const rulesDialog = (c: typeof ghost) => c.page.getByRole("dialog", { name: "Regole del gioco" });
  await expect(rulesDialog(ghost)).toHaveCount(0);
  await ghost.page.getByRole("button", { name: /Regole/ }).click();
  await expect(rulesDialog(ghost)).toBeVisible();
  await expect(rulesDialog(ghost)).toContainText("Per te, che sei un FANTASMA");
  await expect(rulesDialog(ghost)).not.toContainText("Per te, che sei un ACCHIAPPAFANTASMI");
  await expect(rulesDialog(ghost)).toContainText("2 zone"); // le zone di questa partita
  await expect(rulesDialog(ghost)).toContainText("2 minuti"); // durationSec: 120
  await expect(rulesDialog(ghost)).toContainText("1 minuto"); // jailSec: 60
  await expect(rulesDialog(ghost)).toContainText("Non c'è vantaggio iniziale"); // headStartSec: 0
  await expect(rulesDialog(ghost)).toContainText("resta tua per 2 minuti"); // zoneLockSec: 120
  await expect(rulesDialog(ghost)).toContainText("1,9 per i fantasmi"); // peso automatico: 1,1 + 0,4 × 2 zone / 1 fantasma
  await expect(rulesDialog(ghost).getByRole("button", { name: "Ho capito" })).toBeInViewport(); // raggiungibile senza scorrere
  await ghost.page.keyboard.press("Escape");
  await expect(rulesDialog(ghost)).toHaveCount(0);
  await hunter.page.getByRole("button", { name: /Regole/ }).click();
  await expect(rulesDialog(hunter)).toContainText("Per te, che sei un ACCHIAPPAFANTASMI");
  await expect(rulesDialog(hunter)).not.toContainText("Per te, che sei un FANTASMA");
  await rulesDialog(hunter).getByRole("button", { name: "Ho capito" }).click();
  await expect(rulesDialog(hunter)).toHaveCount(0);

  // Lo schermo non sa chi è chi.
  expect(screen.traffic.text()).not.toContain(ghostNick + '","role"');
  expect(screen.traffic.text()).not.toMatch(/"roles"|"holder"|"mates"/);

  // Via: il fantasma inquadra il QR della Cantina con lo scanner dell'app. La fotocamera è simulata con un
  // flusso video che mostra il vero QR stampato dalla regia (stesso SVG del foglio della regia).
  await admin.page.getByRole("button", { name: "Via alla caccia!" }).click();
  const qrSvg = await admin.page.locator(".zone-sheet figure", { hasText: "ABCD" }).locator("svg").evaluate((el) => new XMLSerializer().serializeToString(el));
  await ghost.page.evaluate(async (svg) => {
    const img = new Image();
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("QR non caricato"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d")!;
    const draw = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 640, 480);
      ctx.drawImage(img, 120, 40, 400, 400); // il QR con il suo margine bianco, come inquadrato su un foglio
    };
    draw();
    setInterval(draw, 100); // captureStream emette frame solo se il canvas cambia
    // Una fotocamera vera impiega un po' ad avviarsi: così lo scanner resta aperto abbastanza da essere osservato.
    navigator.mediaDevices.getUserMedia = async () => {
      await new Promise((r) => setTimeout(r, 800));
      return canvas.captureStream(15);
    };
  }, qrSvg);
  const card = (c: typeof ghost) => c.page.getByLabel("Zona controllata");
  await expect(card(ghost)).toHaveCount(0);
  await ghost.page.getByRole("button", { name: /Scansiona il QR/ }).click();
  await expect(ghost.page.getByRole("dialog", { name: "Scanner QR" })).toBeVisible();
  // Letto il QR la zona si CONTROLLA, non si conquista: la scheda ne mostra lo stato e il bottone (per i
  // fantasmi «Infesta») conferma.
  await expect(card(ghost)).toContainText("Cantina");
  await expect(card(ghost)).toContainText("libera");
  await expect(ghost.page.getByRole("dialog", { name: "Scanner QR" })).toHaveCount(0);
  await ghost.page.getByRole("button", { name: "👻 Infesta la zona" }).click();
  await expect(card(ghost)).toHaveCount(0);
  await expect(ghost.page.getByRole("status")).toContainText("Hai preso Cantina");
  await expect(ghost.page.locator('.gf-zone[data-seen="ghost"]', { hasText: "Cantina" })).toBeVisible();
  // Durante la caccia i punti personali sono nascosti (tradirebbero se si tiene ancora una zona).
  await expect(ghost.page.locator(".gf-role")).not.toContainText("pt");

  // Lo stato delle zone è un segreto: lo schermo non lo mostra e il cacciatore, che non è andato a vedere, non lo sa.
  await expect(screen.page.locator('.gf-zone[data-owner="hidden"]')).toHaveCount(2);
  await expect(screen.page.locator('.gf-zone[data-owner="ghost"], .gf-zone[data-owner="hunter"], .gf-zone[data-owner="free"]')).toHaveCount(0);
  await expect(hunter.page.locator('.gf-zone[data-seen="never"]')).toHaveCount(2);

  // Un codice sbagliato non fa niente.
  await ghost.page.getByPlaceholder("Codice della zona").fill("QQQQ");
  await ghost.page.getByRole("button", { name: "Controlla", exact: true }).click();
  await expect(ghost.page.getByRole("status")).toContainText("Codice non valido");
  await expect(card(ghost)).toHaveCount(0);

  // Il QR è un link: aprirlo dal telefono del cacciatore controlla il Giardino (libera) e pulisce l'indirizzo;
  // il bottone «Purifica» la conquista.
  await hunter.page.goto("/play?zona=WXYZ");
  await expect(card(hunter)).toContainText("Giardino");
  await expect(card(hunter)).toContainText("libera");
  expect(hunter.page.url()).not.toContain("zona");
  await hunter.page.getByRole("button", { name: "🔦 Purifica la zona" }).click();
  await expect(hunter.page.getByRole("status")).toContainText("Hai preso Giardino");
  await expect(hunter.page.locator('.gf-zone[data-seen="hunter"]', { hasText: "Giardino" })).toBeVisible();
  await expect(screen.page.locator('.gf-zone[data-owner="hidden"]')).toHaveCount(2); // nemmeno ora lo schermo sa nulla

  // La zona appena conquistata è bloccata: il fantasma che arriva la vede, ma non può riprendersela.
  await ghost.page.getByPlaceholder("Codice della zona").fill("WXYZ");
  await ghost.page.getByRole("button", { name: "Controlla", exact: true }).click();
  await expect(card(ghost)).toContainText("purificata");
  await expect(card(ghost)).toContainText("Bloccata ancora");
  await expect(card(ghost).getByRole("button", { name: /^Bloccata \d+s$/ })).toBeDisabled();
  await ghost.page.getByRole("button", { name: "Lascia stare" }).click();

  // Se la fotocamera è negata lo scanner lo dice e si può chiudere: il codice a mano resta disponibile.
  await hunter.page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("negato", "NotAllowedError"));
  });
  await hunter.page.getByRole("button", { name: /Scansiona il QR/ }).click();
  await expect(hunter.page.getByRole("alert")).toContainText("Permesso alla fotocamera negato");
  await hunter.page.getByRole("button", { name: "Chiudi" }).click();
  await expect(hunter.page.getByRole("dialog", { name: "Scanner QR" })).toHaveCount(0);
  await expect(hunter.page.getByPlaceholder("Codice della zona")).toBeVisible();

  // Il cacciatore non vede i ruoli né chi tiene una zona; della Cantina non sa ancora nulla.
  const hunterView = lastPlayerView(hunter.traffic)!;
  expect(JSON.stringify(hunterView)).not.toMatch(/"holder"|"roles"|"owner":"ghost"/); // sa solo del Giardino che ha preso lui
  expect(hunterView.mates).toEqual([]);
  expect(hunterView.zones.map((z: { seen: unknown }) => z.seen !== null)).toEqual([false, true]);

  // Per sapere chi controlla la Cantina deve andarci: scrive il suo codice e scopre che è infestata.
  await hunter.page.getByPlaceholder("Codice della zona").fill("ABCD");
  await hunter.page.getByRole("button", { name: "Controlla", exact: true }).click();
  await expect(card(hunter)).toContainText("infestata");
  await hunter.page.getByRole("button", { name: "Lascia stare" }).click();
  await expect(hunter.page.locator('.gf-zone[data-seen="ghost"]', { hasText: "Cantina" })).toBeVisible();

  // Il cacciatore accusa (con conferma in due passi) l'unico altro giocatore: è il fantasma.
  await hunter.page.getByRole("button", { name: ghostNick, exact: true }).click();
  await hunter.page.getByRole("button", { name: `Accusa ${ghostNick}` }).click();
  await expect(hunter.page.getByRole("status")).toContainText(`${ghostNick} era un fantasma`);
  await expect(ghost.page.getByText(/Sei in prigione/)).toBeVisible();
  // Solo ora lo schermo ne conosce l'identità (ma non lo stato delle zone).
  await expect(screen.page.locator(".gf-jail")).toContainText(ghostNick);
  await expect(screen.page.getByText(`${hunterNick} ha catturato ${ghostNick}`)).toBeVisible();
  await expect(screen.page.locator('.gf-zone[data-owner="hidden"]')).toHaveCount(2);
  // Le zone del fantasma sono tornate libere: il cacciatore lo scopre solo tornando a guardare la Cantina.
  await expect(hunter.page.locator('.gf-zone[data-seen="ghost"]', { hasText: "Cantina" })).toBeVisible(); // informazione ormai vecchia
  await hunter.page.getByPlaceholder("Codice della zona").fill("ABCD");
  await hunter.page.getByRole("button", { name: "Controlla", exact: true }).click();
  await expect(card(hunter)).toContainText("libera");
  await hunter.page.getByRole("button", { name: "Lascia stare" }).click();
  await expect(hunter.page.locator('.gf-zone[data-seen="free"]', { hasText: "Cantina" })).toBeVisible();
  // In prigione il fantasma non può né controllare né conquistare.
  await ghost.page.getByPlaceholder("Codice della zona").fill("ABCD");
  await expect(ghost.page.getByRole("button", { name: "Controlla", exact: true })).toBeDisabled();

  // Fin qui lo schermo non ha mai ricevuto lo stato delle zone né i totali.
  expect(screen.traffic.text()).not.toMatch(/"owner"|"seconds"|"holder"|"seen"/);

  // La regia vede tutto. Conclude: la rivelazione mostra vincitore, stato di ogni zona e per la prima volta i ruoli.
  await expect(admin.page.getByText(/Cantina libera/)).toBeVisible();
  await expect(admin.page.getByText(/Giardino 🔦/)).toBeVisible();
  await expect(screen.page.locator(".zh-role")).toHaveCount(0);
  await admin.page.getByRole("button", { name: "Termina la caccia" }).click();
  await expect(screen.page.getByRole("heading", { name: /Vincono|Pareggio/ })).toBeVisible();
  await expect(screen.page.locator('.gf-zone[data-owner="hunter"]', { hasText: "Giardino" })).toBeVisible();
  await expect(screen.page.locator(".gf-tug")).toContainText("×1,9"); // il peso dei fantasmi è dichiarato
  await expect(screen.page.locator('.gf-zone[data-owner="free"]', { hasText: "Cantina" })).toBeVisible();
  await expect(screen.page.locator(".zh-role")).toHaveCount(2);
  await expect(screen.page.locator(".zh-role.zh-zombie")).toContainText(ghostNick);
  // Chi vince sul tempo di controllo dipende da pochi secondi: i due telefoni devono solo essere coerenti.
  // (il tema può mettere il testo in maiuscolo: si confronta senza distinguere)
  const outcome = async (c: typeof hunter) => (await c.page.locator(".gf-ctrl .big").innerText()).trim().toLowerCase();
  for (const c of [hunter, ghost]) await expect(c.page.locator(".gf-ctrl .big")).toHaveText(/Avete vinto!|Avete perso|Pareggio/);
  const [h, gh] = [await outcome(hunter), await outcome(ghost)];
  expect(h === "pareggio" ? gh === "pareggio" : h !== gh, `hunter «${h}», fantasma «${gh}»`).toBe(true);

  // «Concludi» chiude il round e arriva la classifica.
  await admin.page.getByRole("button", { name: "Concludi" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});
