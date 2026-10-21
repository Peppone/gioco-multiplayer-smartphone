import { type Browser, devices, expect } from "@playwright/test";
import { type Client, adminApi, adminToken, captureSocketTraffic, lastPlayerView, test } from "./support";

const CONFIG = {
  rows: 3,
  cols: 3,
  rooms: ["A", "C", "S", "T", "I", "U", "R", "O", "M"].map((letter, i) => ({ letter, note: `Nota segreta ${i + 1}` })),
  anchor: 0,
  words: ["MORTA", "USCITA"],
  solution: "USCITA",
  defaultSightSec: 2,
  clockIntervalSec: 5,
  messageCooldownSec: 0,
};

/** Il telefono del Game Master: si entra solo con il link limitato (il token sta nel frammento dell'indirizzo). */
async function openMaster(browser: Browser, hash: string): Promise<Client> {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  const traffic = captureSocketTraffic(page);
  await page.goto(`/master${hash}`);
  return { context, page, traffic };
}

test("stanze segrete: il Game Master conduce la sessione dal telefono, con lettere, permessi, messaggi ed eventi", async ({ newGame, browser, request }) => {
  // Sessione completa con 6 browser: con gli altri test in parallelo supera il minuto del limite generale.
  test.slow();
  const g = await newGame([{ typeId: "stanze-segrete", title: "Complesso e2e", theme: "retro80", config: CONFIG }], { playersPerTeam: 2 });
  const { screen, admin } = g;
  const phones = [g.reds[0]!, g.reds[1]!, g.blues[0]!, g.blues[1]!];
  const nicks: string[] = [];
  for (const p of phones) nicks.push((await p.page.locator("h1").first().innerText()).trim());
  const [n0, n1, n2, n3] = nicks as [string, string, string, string];
  const [p0, p1, p2, p3] = phones as [Client, Client, Client, Client];

  // ---- La regia avvia il round e genera il link del Game Master ----
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(admin.page.getByRole("heading", { name: "Link del Game Master" })).toBeVisible();
  await expect(admin.page.locator(".sh")).toBeVisible(); // la regia ha la stessa interfaccia del GM
  await admin.page.getByRole("button", { name: "Genera il link" }).click();
  const url = await admin.page.locator(".master-url").innerText();
  const hash = url.slice(url.indexOf("#"));
  expect(hash).toMatch(/^#t=[0-9a-f]{48}$/);

  const gm = await openMaster(browser, hash);
  const m = gm.page;
  await expect(m.getByRole("heading", { name: "Game Master" })).toBeVisible();
  await expect(m.locator(".sh")).toBeVisible();
  expect(m.url()).not.toContain("#t="); // il token è stato tolto dall'indirizzo
  // Il GM non è un giocatore e non compare né in lobby né in classifica.
  await expect(m.locator(".sh-player")).toHaveCount(4);

  // La mappa non si conosce a priori: schermo e telefoni non ricevono né griglia né dimensioni.
  await expect(screen.page.locator(".ss-room")).toHaveCount(0);
  await expect(screen.page.getByText("Il complesso si sta preparando")).toBeVisible();
  expect(screen.traffic.text()).not.toMatch(/"rows"|"cols"|"positions"/);
  for (const p of [p0, p1]) expect(p.traffic.text()).not.toMatch(/"rows"|"cols"/);
  await expect(p0.page.getByText("Aspetta il Game Master").first()).toBeVisible();

  // ---- Stanze di partenza scelte dal GM: tocca il giocatore, poi la stanza ----
  const unplaced = m.getByRole("status");
  const place = async (nick: string, room: number) => {
    await unplaced.getByRole("button", { name: nick, exact: true }).click();
    await m.getByRole("button", { name: new RegExp(`^Stanza ${room}, lettera`) }).click();
  };
  await place(n0, 1);
  await place(n1, 5);
  await place(n2, 9);
  await expect(m.getByRole("button", { name: "Inizia", exact: true })).toBeDisabled(); // n3 non è piazzato
  await place(n3, 5);
  await expect(m.getByRole("button", { name: "Inizia", exact: true })).toBeEnabled();
  await expect(p0.page.getByRole("heading", { name: "Sei nella Stanza 1" })).toBeVisible();
  await expect(p1.page.getByRole("heading", { name: "Sei nella Stanza 5" })).toBeVisible();
  await expect(p2.page.getByRole("heading", { name: "Sei nella Stanza 9" })).toBeVisible();
  await m.getByRole("button", { name: "Inizia", exact: true }).click();
  // Sul telefono toccare un giocatore sulla mappa apre un foglio dal basso con le sue azioni.
  await m.locator(".sh-av").first().click();
  const sheet = m.getByRole("complementary");
  await expect(sheet).toBeVisible();
  const vp = m.viewportSize()!;
  const sb = (await sheet.boundingBox())!;
  expect(sb.width).toBeGreaterThanOrEqual(vp.width - 2);
  expect(sb.y + sb.height).toBeGreaterThanOrEqual(vp.height - 2); // ancorato in basso
  await sheet.getByRole("button", { name: "Chiudi il menu" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(screen.page.getByText(/avvolto nel buio/)).toBeVisible();
  await expect(p0.page.locator(".ss-mini")).toHaveCount(0);
  expect(screen.traffic.text()).not.toMatch(/"positions"/);
  // Il GM mostra la mappa quando vuole, e la può nascondere di nuovo.
  await m.getByRole("button", { name: "Mostra la mappa a schermo e telefoni" }).click();
  await expect(screen.page.locator(".ss-room")).toHaveCount(9);
  await expect(screen.page.locator('.ss-room[data-cell="4"] .ss-avatar')).toHaveCount(2);
  await expect(p0.page.locator(".ss-mini-room")).toHaveCount(9);
  await m.getByRole("button", { name: "Nascondi la mappa" }).click();
  await expect(screen.page.locator(".ss-room")).toHaveCount(0);
  await expect(p0.page.locator(".ss-mini")).toHaveCount(0);

  // ---- Mappa esplorata: ogni telefono vede solo le stanze visitate e chi sta con lui ----
  await expect(p0.page.locator(".ss-explored")).toHaveCount(0);
  await m.getByRole("button", { name: "Mostra le stanze esplorate ai telefoni" }).click();
  await expect(p0.page.locator(".ss-explored .ss-mini-room")).toHaveCount(1); // solo la stanza di partenza
  await expect(p0.page.locator('.ss-explored .ss-mini-room[data-cell="0"]')).toHaveClass(/me/);
  await expect(p1.page.locator(".ss-explored")).toContainText(`Con te: ${n3}`); // n1 e n3 sono nella stanza 5
  await expect(p2.page.locator(".ss-explored")).not.toContainText("Con te");
  await expect(p0.page.locator(".ss-mini-room")).toHaveCount(1); // né la griglia intera né le dimensioni
  // Il traffico di prima contiene la mappa intera mostrata poco fa: qui conta l'ultima vista, personale di ognuno.
  const lastOf = (c: Client) => lastPlayerView(c.traffic)!;
  await expect.poll(() => lastOf(p0).explored?.rooms.map((r: { cell: number }) => r.cell)).toEqual([0]);
  await expect.poll(() => lastOf(p1).explored?.rooms.map((r: { cell: number }) => r.cell)).toEqual([4]); // ognuno vede solo le sue stanze
  const mine = JSON.stringify(lastOf(p0));
  expect(lastOf(p0)).not.toHaveProperty("rows"); // le dimensioni del complesso restano ignote (rows/cols dentro «explored» sono solo il riquadro delle stanze visitate)
  expect(lastOf(p0).rules).not.toHaveProperty("rows");
  expect(mine).not.toContain("letter");
  for (const other of [n1, n2, n3]) expect(mine).not.toContain(other); // gli altri sono in stanze mai visitate da n0
  expect(screen.traffic.text()).not.toMatch(/explored/); // lo schermo non la riceve
  await m.getByRole("button", { name: "Nascondi le stanze esplorate" }).click();
  await expect(p0.page.locator(".ss-explored")).toHaveCount(0);

  const card =(nick: string) => m.locator(`details.sh-player[data-player="${nick}"]`);
  const open = async (nick: string) => {
    if (!(await card(nick).evaluate((d) => (d as HTMLDetailsElement).open))) await card(nick).locator("summary").click();
  };

  // ---- Tempo: il contatore del GM parte con «Inizia» e avvisa a ogni intervallo; cronometri a piacere ----
  const gameClock = m.locator('.sh-timer[data-timer="t0"]');
  await expect(gameClock.locator(".sh-clock")).toHaveText(/^[0-9][0-9]:[0-9][0-9]$/);
  await expect(gameClock.locator("[data-laps]")).not.toHaveText("0", { timeout: 12_000 }); // ogni 5 s
  await expect(gameClock).toContainText("intervallo scaduto");
  // L'avviso arriva anche nella barra fissa in alto, e si chiude toccandolo.
  const bar = m.getByTestId("notice-bar");
  await expect(bar).toContainText("intervallo scaduto");
  expect(await bar.evaluate((e) => getComputedStyle(e).position)).toBe("sticky");
  await bar.getByRole("button", { name: /intervallo scaduto/ }).first().click();
  await m.getByLabel("Nome del cronometro").fill("Gas nella Stanza 5");
  await m.getByLabel(/Intervallo in minuti/).fill("0.1"); // 6 secondi
  await m.getByRole("button", { name: "Aggiungi", exact: true }).click();
  const gas = m.locator(".sh-timer", { hasText: "Gas nella Stanza 5" });
  await expect(gas).toContainText("00:00");
  await gas.getByRole("button", { name: "Avvia" }).click();
  await expect(gas.locator("[data-laps]")).toHaveText("1", { timeout: 12_000 });
  await gas.getByRole("button", { name: "Pausa" }).click();
  const frozen = await gas.locator(".sh-clock").innerText();
  await m.waitForTimeout(1500);
  expect(await gas.locator(".sh-clock").innerText()).toBe(frozen); // in pausa il contatore non avanza
  await gas.getByRole("button", { name: "Azzera" }).click();
  await expect(gas.locator(".sh-clock")).toHaveText("00:00");
  await gas.getByRole("button", { name: "Elimina" }).click();
  await expect(gas).toHaveCount(0);
  // Il tempo è roba del master: né i telefoni né lo schermo ne ricevono traccia.
  for (const c of [...phones, screen]) expect(c.traffic.text()).not.toMatch(/Tempo di gioco|Gas nella|"timers"/);

  // ---- Oggetti: esistono (misteriosi) per i presenti, poi il GM li palesa a tutti o solo ad alcuni ----
  const scopa = m.locator('.sh-item[data-item="scopa"]');
  await scopa.getByLabel(/Stanza di/).selectOption("4"); // Stanza 5: ci sono n1 e n3
  const item = (c: Client, known: string) => c.page.locator(`.ss-item[data-known="${known}"]`);
  await expect(item(p1, "false")).toHaveCount(0); // assegnato ma non ancora abilitato: nessuno lo sa
  await scopa.getByRole("button", { name: /Nascosto ai giocatori/ }).click();
  for (const p of [p1, p3]) {
    await expect(item(p, "false")).toContainText("Un oggetto");
    await expect(item(p, "false")).toContainText("non sai cosa");
  }
  await expect(p0.page.locator(".ss-item")).toHaveCount(0); // chi è in un'altra stanza non lo sa
  await expect(p2.page.locator(".ss-item")).toHaveCount(0);
  for (const p of phones) expect(p.traffic.text()).not.toContain("Una scopa");
  await scopa.getByRole("button", { name: `Palesa a ${n1}` }).click(); // solo a n1
  await expect(item(p1, "true")).toContainText("Una scopa");
  await expect(item(p3, "false")).toBeVisible();
  expect(p3.traffic.text()).not.toContain("Una scopa");
  await scopa.getByRole("button", { name: /Palesa ai presenti/ }).click();
  await expect(item(p3, "true")).toContainText("Una scopa");
  expect(screen.traffic.text()).not.toContain("Una scopa");
  expect(p0.traffic.text()).not.toContain("Una scopa");

  // Un oggetto nuovo, creato a partita in corso, già nella Stanza 5 e percepibile.
  await m.locator(".sh-new-item summary").click();
  await m.getByLabel("Nome del nuovo oggetto").fill("Una chiave arrugginita");
  await m.getByLabel("Icona del nuovo oggetto").fill("🗝️");
  await m.getByLabel("Testo leggibile del nuovo oggetto").fill("Sul manico è inciso un 7");
  await m.getByLabel("Stanza del nuovo oggetto").selectOption("4");
  await m.getByRole("button", { name: "Aggiungi l'oggetto" }).click();
  await expect(m.locator(".sh-item", { hasText: "Una chiave arrugginita" })).toBeVisible();
  await expect(p1.page.locator('.ss-item[data-known="false"]')).toHaveCount(1); // la chiave è misteriosa (la scopa è già stata palesata)
  for (const p of phones) expect(p.traffic.text()).not.toContain("chiave arrugginita");
  await m.locator(".sh-item", { hasText: "Una chiave arrugginita" }).getByRole("button", { name: `Palesa a ${n1}` }).click();
  await expect(p1.page.locator(".ss-item[data-known=true]")).toHaveCount(2);
  await expect(p1.page.locator(".ss-item[data-known=true]", { hasText: "chiave" })).toContainText("inciso un 7");
  // Il telefono del GM da link non può toccare la libreria: il salvataggio nell'istanza non gli viene offerto.
  await expect(m.locator("#sh-config")).toHaveCount(0);
  // Descrizione privata di una stanza: il GM la scrive dalla mappa, nessun altro la riceve.
  await m.getByRole("button", { name: /^Stanza 5, lettera/ }).click();
  await m.getByLabel("Descrizione della Stanza 5").fill("Muffa alle pareti e una grata sul soffitto");
  const saveNote = m.locator("[data-room-note] button[type=submit]");
  await saveNote.click();
  await expect(saveNote).toBeDisabled(); // salvata: non ci sono più modifiche in sospeso
  await expect(m.locator(".sh-note", { hasText: "Muffa alle pareti" })).toBeVisible();
  for (const c of [...phones, screen]) expect(c.traffic.text()).not.toContain("Muffa alle pareti");
  // Il GM modifica la descrizione: chi conosce l'oggetto la vede aggiornata subito.
  const chiave = m.locator(".sh-item", { hasText: "Una chiave arrugginita" });
  await chiave.locator("summary", { hasText: "Modifica" }).click();
  await chiave.getByLabel("Testo leggibile di Una chiave arrugginita").fill("Sul manico è inciso un 9");
  await chiave.getByRole("button", { name: "Salva le modifiche" }).click();
  await expect(p1.page.locator(".ss-item[data-known=true]", { hasText: "chiave" })).toContainText("inciso un 9");
  m.once("dialog", (d) => void d.accept());
  await m.getByRole("button", { name: "Elimina Una chiave arrugginita" }).click();
  await expect(m.locator(".sh-item", { hasText: "Una chiave arrugginita" })).toHaveCount(0);
  await expect(p1.page.locator(".ss-item")).toHaveCount(1); // resta solo la scopa (palesata)

  // ---- Lettere: solo a chi il GM abilita, a tempo ----
  await open(n0);
  await card(n0).locator('.sh-toggle[data-action="sight"]').click();
  const sightBtn = (c: Client) => c.page.getByRole("button", { name: /Guarda la lettera/ });
  await expect(sightBtn(p0)).toBeVisible();
  await expect(sightBtn(p1)).toHaveCount(0);
  await expect(sightBtn(p0)).toContainText("1 uso");
  await sightBtn(p0).click();
  const hold = p0.page.locator(".ss-hold");
  await expect(hold).toBeVisible();
  await expect(p0.page.getByTestId("letter")).toHaveCount(0); // nascosta finché non si tiene premuto
  await hold.dispatchEvent("pointerdown");
  await expect(p0.page.getByTestId("letter")).toHaveText("A");
  await hold.dispatchEvent("pointerup");
  await expect(p0.page.getByTestId("letter")).toHaveCount(0);
  await expect(hold).toHaveCount(0, { timeout: 6_000 }); // scaduta l'occhiata sparisce
  expect(lastPlayerView(p0.traffic)!.sighting).toBeNull();
  await expect(sightBtn(p0)).toHaveCount(0); // usi finiti
  // Nessuna lettera è mai arrivata a chi non era abilitato, né allo schermo.
  for (const other of [p1, p2, p3]) expect(other.traffic.text()).not.toMatch(/"letters?":/);
  expect(screen.traffic.text()).not.toMatch(/"letters?":/);
  expect(screen.traffic.text()).not.toContain("Nota segreta");
  expect(p0.traffic.text()).not.toContain("Nota segreta");

  // ---- Muoversi: croce con una direzione bloccata, il GM approva ----
  await open(n1);
  await card(n1).locator('.sh-toggle[data-action="move"]').click();
  await card(n1).locator('.sh-dir[data-dir="down"]').click(); // blocca «giù»
  const arrow = (c: Client, d: string) => c.page.locator(`.ss-arrow[data-dir="${d}"]`);
  await expect(arrow(p1, "down")).toHaveAttribute("data-state", "blocked");
  await expect(arrow(p1, "down")).toBeDisabled();
  await expect(arrow(p1, "right")).toBeEnabled();
  await arrow(p1, "right").click();
  await expect(p1.page.getByText(/Hai chiesto di andare a destra/)).toBeVisible();
  await expect(p1.page.getByRole("heading", { name: "Sei nella Stanza 5" })).toBeVisible(); // non si muove senza approvazione
  const req = m.locator('.sh-req[data-kind="move"]');
  await expect(req).toContainText(n1);
  await req.getByRole("button", { name: "Approva" }).click();
  await expect(p1.page.getByRole("heading", { name: "Sei nella Stanza 6" })).toBeVisible();
  await expect(p1.page.getByText("Il Master ti ha fatto entrare nella Stanza 6")).toBeVisible();
  await m.getByRole("button", { name: "Mostra la mappa a schermo e telefoni" }).click(); // lo schermo la mostra di nuovo
  await expect(screen.page.locator('.ss-room[data-cell="5"] .ss-avatar')).toHaveCount(1);

  // ---- Spegnere una capacità: il controllo sparisce dal telefono ----
  await card(n1).locator('.sh-toggle[data-action="move"]').click();
  await expect(p1.page.locator('.ss-compass[data-kind="move"]')).toHaveCount(0);

  // ---- Messaggio segreto: il giocatore legge e risponde dal telefono ----
  await open(n0);
  await card(n0).getByPlaceholder(`Messaggio a ${n0}`).fill("Senti un rumore sopra di te");
  await card(n0).getByRole("button", { name: "Invia", exact: true }).click();
  await p0.page.getByRole("button", { name: /Nuovo messaggio dal Master/ }).click();
  await expect(p0.page.locator(".ss-thread")).toContainText("Senti un rumore sopra di te");
  await p0.page.getByLabel("Rispondi").fill("Che rumore?");
  await p0.page.locator(".ss-thread").getByRole("button", { name: "Invia" }).click();
  await expect(m.locator(".sh-inbox")).toContainText("Che rumore?");
  // Chat del GM: la conversazione con n0 ha il non letto; aprirla lo azzera e si risponde lì.
  const thread = m.locator(`.sh-thread-open`).filter({ hasText: n0 });
  await expect(thread.locator(".sh-count")).toHaveText("1");
  await m.getByTestId("notice-bar").getByRole("button", { name: /Posta/ }).click(); // apre la chat col messaggio da leggere
  const chat = m.locator(".sh-chat");
  await expect(chat.locator("h4")).toHaveText(n0);
  await expect(chat.locator(".sh-bubbles li.gm")).toContainText("Senti un rumore sopra di te");
  await expect(chat.locator(".sh-bubbles li.pl")).toContainText("Che rumore?");
  await chat.getByLabel("Testo del messaggio").fill("Guarda in alto");
  await chat.getByRole("button", { name: "Invia", exact: true }).click();
  await expect(chat.locator(".sh-bubbles li.gm").last()).toContainText("Guarda in alto");
  await chat.getByRole("button", { name: "Torna alle conversazioni" }).click();
  await expect(m.locator(".sh-thread-open").filter({ hasText: n0 }).locator(".sh-count")).toHaveCount(0);
  // Dalla scheda del giocatore si salta alla sua chat, che mostra tutto il filo.
  await card(n0).getByRole("button", { name: /Apri nella chat/ }).click();
  await expect(m.locator(".sh-chat .sh-bubbles li")).toHaveCount(3);
  await m.getByRole("button", { name: "Torna alle conversazioni" }).click();
  // gli altri non vedono la conversazione
  for (const other of [p1, p2, p3, screen]) expect(other.traffic.text()).not.toContain("Senti un rumore");
  expect(screen.traffic.text()).not.toContain("Che rumore?");
  // senza il permesso «Scrivi al Master» non si può scrivere di propria iniziativa
  await expect(p0.page.getByText("Puoi scrivere al Master quando ti abilita.")).toBeVisible();
  await p0.page.getByRole("button", { name: "Gioco", exact: true }).click();

  // ---- Evento in broadcast: ogni telefono lo mostra, lo accetta, il GM vede chi ha accettato ----
  const events = m.locator(".sh-events");
  await events.getByLabel("Testo dell'evento").fill("Crolla il soffitto della Stanza 5");
  await events.getByRole("button", { name: /Invia l'evento a tutti/ }).click();
  for (const p of phones) {
    const ev = p.page.getByTestId("event-card");
    await expect(ev).toBeVisible();
    await expect(ev).toContainText("Evento: Crolla il soffitto della Stanza 5");
  }
  await expect(m.locator('.sh-event-list li[data-event]').first()).toContainText("Accettato da 0 di 4");
  for (const p of phones) await p.page.getByRole("button", { name: "Accetta" }).click();
  await expect(m.locator(".sh-event-list li").first()).toContainText("Accettato da 4 di 4");
  for (const p of phones) await expect(p.page.getByTestId("event-card")).toHaveCount(0);

  // ---- Evento in multicast: solo i due scelti ----
  await events.getByRole("button", { name: "Nessuno" }).click();
  await events.getByRole("button", { name: n1, exact: true }).click();
  await events.getByRole("button", { name: n2, exact: true }).click();
  await events.getByLabel("Testo dell'evento").fill("Segreto per due giocatori");
  await events.getByRole("button", { name: /Invia l'evento a 2/ }).click();
  for (const p of [p1, p2]) await expect(p.page.getByTestId("event-card")).toContainText("Evento: Segreto per due giocatori");
  await expect(p0.page.getByTestId("event-card")).toHaveCount(0);
  await expect(p3.page.getByTestId("event-card")).toHaveCount(0);
  await p1.page.getByRole("button", { name: "Accetta" }).click();
  await expect(m.locator(".sh-event-list li").first()).toContainText("Accettato da 1 di 2");
  await expect(m.locator(".sh-event-list li").first()).toContainText(`mancano: ${n2}`);
  // annullato prima che tutti accettino: sparisce da chi non l'aveva accettato
  await m.locator(".sh-event-list li").first().getByRole("button", { name: "Annulla" }).click();
  await expect(p2.page.getByTestId("event-card")).toHaveCount(0);
  for (const other of [p0, p3, screen]) expect(other.traffic.text()).not.toContain("Segreto per due giocatori");

  // ---- Cronologia eventi: ognuno vede solo i propri ----
  await p1.page.getByRole("button", { name: /Eventi/ }).click();
  await expect(p1.page.locator(".ss-history li")).toHaveCount(2);
  await p0.page.getByRole("button", { name: /Eventi/ }).click();
  await expect(p0.page.locator(".ss-history li")).toHaveCount(1);
  await expect(p0.page.locator(".ss-history")).not.toContainText("Segreto per due");
  await p2.page.getByRole("button", { name: /Eventi/ }).click();
  await expect(p2.page.locator(".ss-history li.cancelled")).toHaveCount(1);

  // ---- Regole con i dati veri ----
  await p0.page.getByRole("button", { name: /Regole/ }).click();
  await expect(p0.page.locator(".ss-rules")).toContainText("2 secondi"); // defaultSightSec: 2
  await expect(p0.page.locator(".ss-rules")).toContainText("9 stanze"); // la mappa è stata mostrata

  // ---- Esito, rivelazione, fine ----
  await p0.page.getByRole("button", { name: "Gioco", exact: true }).click();
  await open(n0);
  await card(n0).getByLabel("Esito").selectOption("fuggito");
  await expect(p0.page.getByText("Sei fuggito!")).toBeVisible();
  await m.getByRole("button", { name: "Rivela la mappa sullo schermo" }).click();
  await expect(screen.page.locator(".ss-letter")).toHaveCount(9);
  await expect(screen.page.locator(".ss-words")).toContainText("MORTA");
  await expect(screen.page.locator(".ss-words")).toContainText("USCITA");
  await expect(screen.page.locator(".ss-outcomes")).toContainText(`${n0}: è fuggito`);
  await m.getByRole("button", { name: "Concludi", exact: true }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  // Finito il round il GM non ha più nulla da condurre; a partita finita il suo link non vale più e il socket viene chiuso.
  await expect(m.getByText("In attesa del round…")).toBeVisible();
  await admin.page.getByRole("button", { name: "Termina la partita" }).click();
  await expect(m.getByRole("heading", { name: "Link non più valido" })).toBeVisible({ timeout: 15_000 });

  // ---- La regia ritrova messaggi ed eventi nell'archivio ----
  const token = await adminToken(request);
  const api = adminApi(request, token);
  const eventsList = await api.call<{ id: string }[]>("get", "/events");
  let eventId = "";
  for (const ev of eventsList) {
    const rows = await api.call<{ text: string }[]>("get", `/events/${ev.id}/messages`);
    if (rows.some((r) => r.text === "Crolla il soffitto della Stanza 5")) eventId = ev.id;
  }
  expect(eventId).not.toBe("");
  await admin.page.getByRole("button", { name: "Messaggi", exact: true }).click();
  await admin.page.getByLabel("Serata").selectOption(eventId);
  const archive = admin.page.locator(".msg-archive");
  await expect(archive).toContainText("Senti un rumore sopra di te");
  await expect(archive).toContainText("Che rumore?");
  await expect(archive).toContainText("Accettato da 4 di 4");
  await expect(archive).toContainText("Accettato da 1 di 2");
  await admin.page.getByLabel("Filtro").selectOption("event");
  await expect(archive).not.toContainText("Che rumore?");
  await expect(archive.locator("li.event")).toHaveCount(2);
  await gm.context.close();
});

test("stanze segrete: il telefono non scarica l'interfaccia del GM né la regia", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.goto("/play");
  await expect(page.getByPlaceholder("Nome")).toBeVisible();
  expect(urls.filter((u) => /StanzeHost|\/Master-|\/Admin-/.test(u))).toEqual([]);
  await context.close();
});

test("stanze segrete: un link del GM sbagliato non apre nulla", async ({ browser }) => {
  const gm = await openMaster(browser, "#t=" + "0".repeat(48));
  await expect(gm.page.getByRole("heading", { name: "Link non più valido" })).toBeVisible();
  expect(gm.traffic.text()).not.toContain("game:master");
  await gm.context.close();
});

test("stanze segrete: la regia può fare il Game Master da sola, senza link", async ({ newGame, request }) => {
  const g = await newGame([{ typeId: "stanze-segrete", title: "Complesso solo regia", theme: "retro80", config: CONFIG }], { playersPerTeam: 1 });
  const { admin, screen, a, b } = g;
  const nick = async (c: Client) => (await c.page.locator("h1").first().innerText()).trim();
  const [na, nb] = [await nick(a), await nick(b)];
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(admin.page.getByRole("note")).toContainText("Stai conducendo tu come Game Master");

  // Nessun link generato: la regia piazza i giocatori e inizia dal proprio pannello.
  const sh = admin.page.locator(".sh");
  await sh.getByRole("button", { name: "Distribuisci", exact: true }).first().click();
  await expect(a.page.getByRole("heading", { name: /^Sei nella Stanza [0-9]$/ })).toBeVisible();
  await sh.getByRole("button", { name: "Inizia", exact: true }).click();
  // Abilita una capacità, manda un messaggio e un evento, ricevuti dai telefoni.
  await sh.locator(`details.sh-player[data-player="${na}"] summary`).click();
  await sh.locator(`details.sh-player[data-player="${na}"] .sh-toggle[data-action="message"]`).click();
  await expect(a.page.getByRole("button", { name: /Scrivi al Master/ }).or(a.page.getByRole("button", { name: /Master/ }).first())).toBeVisible();
  await sh.getByLabel("Testo dell'evento").fill("Dalla regia");
  await sh.getByRole("button", { name: /Invia l'evento a tutti/ }).click();
  for (const c of [a, b]) await expect(c.page.getByTestId("event-card")).toContainText("Evento: Dalla regia");
  for (const c of [a, b]) await c.page.getByRole("button", { name: "Accetta" }).click();
  await expect(sh.locator(".sh-event-list li").first()).toContainText("Accettato da 2 di 2");
  expect(nb).not.toBe(na);

  // Da PC toccare il giocatore sulla mappa apre un menu laterale a destra con le azioni per lui.
  await sh.locator(".sh-av", { hasText: "" }).first().waitFor();
  await admin.page.getByRole("button", { name: "Mostra la mappa a schermo e telefoni" }).click();
  await sh.locator(`.sh-av[aria-label="${na}"]`).click();
  const menu = admin.page.getByRole("complementary", { name: `Azioni per ${na}` });
  await expect(menu).toBeVisible();
  const mb = (await menu.boundingBox())!;
  const win = admin.page.viewportSize()!;
  expect(mb.x + mb.width).toBeGreaterThanOrEqual(win.width - 2); // a destra
  expect(mb.x).toBeGreaterThan(win.width / 2);
  expect(mb.height).toBeGreaterThanOrEqual(win.height - 2); // a tutta altezza
  expect(await sh.locator(".sh-map").evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(mb.x + 1); // non copre la mappa
  // evento solo per lui
  await menu.getByLabel(`Evento per ${na}`).fill("Un brivido ti scende lungo la schiena");
  await menu.getByRole("button", { name: "Invia", exact: true }).last().click();
  await expect(a.page.getByTestId("event-card")).toContainText("Un brivido");
  await expect(b.page.getByTestId("event-card")).toHaveCount(0);
  await a.page.getByRole("button", { name: "Accetta" }).click();
  // spostamento dal menu
  await menu.getByLabel(`Stanza di destinazione di ${na}`).selectOption("8");
  await menu.getByRole("button", { name: "Sposta", exact: true }).click();
  await expect(a.page.getByRole("heading", { name: "Sei nella Stanza 9" })).toBeVisible();
  // Escape chiude il menu
  await admin.page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(screen.page.locator(".ss-room")).toHaveCount(9); // la mappa è stata mostrata dalla regia

  // Descrizione di una stanza scritta in partita, poi salvata nell'istanza in libreria (solo dalla regia).
  await sh.getByRole("button", { name: /^Stanza 9, lettera/ }).click();
  await sh.getByLabel("Descrizione della Stanza 9").fill("Una cella stretta con una grata");
  await sh.locator("[data-room-note] button[type=submit]").click();
  const token = await adminToken(request);
  const instance = async () => {
    const list = await adminApi(request, token).call<{ title: string; config: { rooms: { note: string }[] } }[]>("get", "/instances");
    return list.find((i) => i.title === "Complesso solo regia")!;
  };
  expect((await instance()).config.rooms[8]!.note).toBe("Nota segreta 9"); // finora solo nella partita
  await sh.getByRole("button", { name: "Salva nell'istanza" }).click(); // il dialogo di conferma è accettato dalla fixture
  await expect(sh.locator("#sh-config [role=status]")).toHaveText("Salvato nell'istanza.");
  expect((await instance()).config.rooms[8]!.note).toBe("Una cella stretta con una grata");

  // Salva con nome: nasce una nuova istanza, quella del round non cambia.
  // La fixture accetta i dialoghi senza testo: per il prompt del nome serve un gestore che lo scriva.
  admin.page.removeAllListeners("dialog");
  admin.page.on("dialog", (d) => void d.accept(d.type() === "prompt" ? "Complesso bis" : undefined));
  await sh.getByRole("button", { name: "Salva con nome…" }).click();
  await expect(sh.locator("#sh-config [role=status]")).toHaveText("Salvata come «Complesso bis».");
  const all = () => adminApi(request, token).call<{ title: string; typeId: string; config: { rooms: { note: string }[] } }[]>("get", "/instances");
  const bis = (await all()).find((i) => i.title === "Complesso bis")!;
  expect(bis.typeId).toBe("stanze-segrete");
  expect(bis.config.rooms[8]!.note).toBe("Una cella stretta con una grata");

  // Esporta in JSON: stesso formato della libreria (si reimporta da lì).
  const [download] = await Promise.all([admin.page.waitForEvent("download"), sh.getByRole("button", { name: "Esporta JSON" }).click()]);
  expect(download.suggestedFilename()).toBe("complesso-solo-regia.json");
  const exported = JSON.parse(await (await import("node:fs/promises")).readFile((await download.path())!, "utf8"));
  expect(exported).toMatchObject({ kind: expect.any(String), typeId: "stanze-segrete", title: "Complesso solo regia" });
  expect(exported.config.rooms[8].note).toBe("Una cella stretta con una grata");

  // Carica: da un'istanza della libreria e da un file; il giocatore non vede nulla, la descrizione cambia nella partita.
  await sh.getByLabel("Descrizione della Stanza 9").fill("Testo provvisorio"); // la Stanza 9 è ancora selezionata
  await sh.locator("[data-room-note] button[type=submit]").click();
  await sh.getByLabel("Configurazione salvata da caricare").selectOption({ label: "Complesso bis" });
  await sh.getByRole("button", { name: "Carica", exact: true }).click();
  await expect(sh.locator("#sh-config [role=status]")).toHaveText("Configurazione caricata.");
  await expect(sh.getByLabel("Descrizione della Stanza 9")).toHaveValue("Una cella stretta con una grata");
  exported.config.rooms[8].note = "Dal file";
  await sh.getByLabel("File JSON da caricare").setInputFiles({ name: "config.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(sh.getByLabel("Descrizione della Stanza 9")).toHaveValue("Dal file");
  // Un file di un altro tipo è rifiutato con un messaggio chiaro.
  await sh.getByLabel("File JSON da caricare").setInputFiles({ name: "altro.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...exported, typeId: "quiz" })) });
  await expect(sh.locator("#sh-config [role=status]")).toHaveText("Il file è di un altro tipo di minigioco.");
  for (const c of [a, b, screen]) expect(c.traffic.text()).not.toContain("Dal file");
});

test("stanze segrete: dadi richiesti dal Master, tirati dal telefono, anche con risultato nascosto", async ({ newGame }) => {
  const g = await newGame([{ typeId: "stanze-segrete", title: "Complesso dadi", theme: "retro80", config: CONFIG }], { playersPerTeam: 1 });
  const { admin, a, b } = g;
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  const sh = admin.page.locator(".sh");
  await sh.getByRole("button", { name: "Distribuisci", exact: true }).first().click();
  await sh.getByRole("button", { name: "Inizia", exact: true }).click();
  const dice = sh.locator("#sh-dice");

  // Il Master sceglie un d20 e lo fa tirare a tutti: sui telefoni compare il pulsante.
  await dice.getByRole("radio", { name: /d20/ }).click();
  await dice.getByLabel("Motivo del lancio").fill("Forza");
  await dice.getByRole("button", { name: "Fai tirare d20" }).click();
  for (const c of [a, b]) await expect(c.page.getByTestId("dice-ask")).toContainText("Forza");

  // Il telefono A tira: il dado rotola e poi mostra un numero da 1 a 20; B non vede il risultato di A.
  await a.page.getByRole("button", { name: "Lancia il d20" }).click();
  const stage = a.page.getByTestId("dice-stage");
  await expect(stage).toHaveAttribute("data-state", "rolling");
  await expect(stage).toHaveAttribute("data-state", "landed", { timeout: 4000 });
  const got = Number(await stage.getAttribute("data-result"));
  expect(got).toBeGreaterThanOrEqual(1);
  expect(got).toBeLessThanOrEqual(20);
  await expect(a.page.getByTestId("dice-ask")).toHaveCount(0);
  await expect(b.page.getByTestId("dice-result")).toHaveCount(0);
  // La regia vede lo stesso numero.
  await expect(dice.getByTestId("dice-last")).toContainText(`: ${got}`);

  // Tiro nascosto: il dado rotola sul telefono ma si ferma su «?», e il numero non viaggia sul socket.
  await dice.getByRole("radio", { name: /d6/ }).click();
  await dice.getByLabel("Nascondi il risultato al giocatore").check();
  await dice.getByRole("button", { name: "Tira io per loro" }).click();
  for (const c of [a, b]) {
    await expect(c.page.getByTestId("dice-result").getByTestId("dice-stage")).toHaveAttribute("data-result", "?", { timeout: 4000 });
    await expect(c.page.getByTestId("dice-result")).toContainText("Il Master vede il risultato");
  }
  const hiddenRolls = (await dice.locator(".sh-dice-list li").allInnerTexts()).filter((t) => t.includes("nascosto"));
  expect(hiddenRolls.length).toBe(2);
  expect(b.traffic.text()).not.toMatch(/"hidden":true,"result":[0-9]/);

  // Lancio privato del Master: nessun telefono riceve nulla di nuovo.
  const before = await a.page.getByTestId("dice-result").count();
  await dice.getByRole("button", { name: "Tira per me (privato)" }).click();
  await expect(dice.locator(".sh-dice-list li")).toHaveCount(5);
  expect(await a.page.getByTestId("dice-result").count()).toBe(before);

  // Richiesta annullata prima che il giocatore tiri.
  await dice.getByRole("button", { name: "Fai tirare d6" }).click();
  await expect(a.page.getByTestId("dice-ask")).toBeVisible();
  // In attesa: il d20 di B (mai tirato) e i due d6 appena chiesti.
  for (let left = 3; left > 0; left--) {
    await expect(dice.locator(".sh-dice-list li.wait")).toHaveCount(left);
    await dice.locator(".sh-dice-list li.wait").first().getByRole("button", { name: "Annulla" }).click();
  }
  for (const c of [a, b]) await expect(c.page.getByTestId("dice-ask")).toHaveCount(0);
});
