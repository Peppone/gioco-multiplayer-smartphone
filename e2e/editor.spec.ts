import { expect, test } from "@playwright/test";
import { adminToken, openAdmin, unique } from "./support";

test.describe("editor della libreria (form generato dallo schema)", () => {
  test("crea un quiz dal modulo, lo esporta e lo reimporta", async ({ browser, request }) => {
    const admin = await openAdmin(browser, await adminToken(request));
    const { page } = admin;
    const title = unique("Quiz modulo");

    await page.getByRole("button", { name: "Libreria" }).click();
    await page.getByRole("button", { name: "+ Quiz a scelta multipla" }).click();
    await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(title);

    // Il modulo parte dall'esempio del plugin (2 domande): modifico la prima.
    const q1 = page.locator(".item.card").first();
    await q1.getByLabel("Domanda", { exact: true }).fill("Chi scrisse la Divina Commedia?");
    await q1.getByLabel("Risposta 1").fill("Dante");
    await q1.getByLabel("Risposta 2").fill("Petrarca");
    // La risposta corretta si sceglie con un pulsante accanto alle risposte, non digitando un indice.
    await q1.locator(".radios label", { hasText: "A: Dante" }).click();
    await expect(q1.locator(".radios label.on")).toContainText("Dante");

    // Aggiungere e togliere elementi rispetta i limiti dello schema (minimo 2 risposte).
    await expect(q1.getByRole("button", { name: "Elimina" }).first()).toBeEnabled();

    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Salvato.")).toBeVisible();
    const row = page.locator(".library ul.list li", { hasText: title });
    await expect(row).toBeVisible();

    // Esporta: il file contiene tipo, titolo e configurazione
    const [download] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: "Esporta" }).click()]);
    const exported = JSON.parse(await (await import("node:fs/promises")).readFile((await download.path())!, "utf8"));
    expect(exported).toMatchObject({ kind: "gioco-ros/instance", typeId: "quiz-multipla", title });
    expect(exported.config.questions[0]).toMatchObject({ text: "Chi scrisse la Divina Commedia?", correctIndex: 0 });

    // Reimporta lo stesso file: compare una seconda istanza con lo stesso titolo
    await page.locator('input[type="file"]').setInputFiles({
      name: "quiz.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });
    await expect(page.getByText("Importate 1 istanze.")).toBeVisible();
    await expect(page.locator(".library ul.list li", { hasText: title })).toHaveCount(2);
  });

  test("segnala configurazioni non valide e file di import sbagliati", async ({ browser, request }) => {
    const admin = await openAdmin(browser, await adminToken(request));
    const { page } = admin;
    await page.getByRole("button", { name: "Libreria" }).click();
    await page.getByRole("button", { name: "+ Buzzer" }).click();
    await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Buzzer rotto"));

    // JSON sintatticamente sbagliato
    await page.getByRole("button", { name: "JSON avanzato" }).click();
    await page.locator("textarea").fill("{ non json");
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Il JSON non è valido.")).toBeVisible();

    // JSON valido ma contro lo schema: il server spiega dove sta il problema
    await page.locator("textarea").fill(JSON.stringify({ questions: [] }));
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.locator(".error")).toContainText("Controlla i dati");
    await expect(page.locator(".error")).toContainText("questions");

    // File di import che non è un export di Gioco
    await page.locator('input[type="file"]').setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"foo":1}') });
    await expect(page.locator(".error")).toContainText("non è un export di Gioco");
  });

  test("i round si riordinano e non si toccano a partita avviata (via API)", async ({ request }) => {
    const token = await adminToken(request);
    const headers = { Authorization: `Bearer ${token}` };
    const post = async (path: string, data: unknown) => (await request.post(`/api/admin${path}`, { headers, data })).json();
    const cfg = { questions: [{ text: "D?", options: ["a", "b"], correctIndex: 0 }] };
    const i1 = await post("/instances", { typeId: "quiz-multipla", title: "R1", config: cfg });
    const i2 = await post("/instances", { typeId: "quiz-multipla", title: "R2", config: cfg });
    const ev = await post("/events", { name: unique("Ev") });
    const m = await post(`/events/${ev.id}/matches`, { name: "P" });
    const r1 = (await post(`/matches/${m.id}/rounds`, { instanceId: i1.id }))[0];
    const r2 = (await post(`/matches/${m.id}/rounds`, { instanceId: i2.id }))[1];
    const res = await request.put(`/api/admin/matches/${m.id}/rounds/order`, { headers, data: { roundIds: [r2.id, r1.id] } });
    expect((await res.json()).map((r: { title: string }) => r.title)).toEqual(["R2", "R1"]);
    const bad = await request.put(`/api/admin/matches/${m.id}/rounds/order`, { headers, data: { roundIds: [r1.id] } });
    expect(bad.status()).toBe(400);
  });
});

test("un plugin nuovo ha il suo editor senza codice: sondaggio con etichette e valori predefiniti", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Sondaggio e voto" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique("Sondaggio form"));

  // Le scelte dell'enum hanno etichette in italiano (da .meta({ enumLabels })), non i valori tecnici
  const kind = page.getByLabel("Tipo di voto").first();
  await expect(kind.locator("option")).toHaveText(["Scelta tra opzioni", "Voto a un giocatore"]);

  // Una nuova domanda nasce già valida: tipo options e opzioni Sì/No di default
  await page.getByRole("button", { name: "+ Aggiungi domanda" }).click();
  const added = page.locator(".item.card").last();
  await expect(added.getByLabel("Tipo di voto")).toHaveValue("options");
  await expect(added.getByLabel("Opzione 1")).toHaveValue("Sì");
  await added.getByLabel("Domanda", { exact: true }).fill("Domanda aggiunta dal modulo");

  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
});

test("tutti i tipi di minigioco sono nella libreria con un esempio valido e salvabile", async ({ browser, request }) => {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  for (const type of ["Quiz a scelta multipla", "Buzzer", "Vero o falso a raffica", "Stima numerica", "Sondaggio e voto", "Zombie Hunt"]) {
    await page.getByRole("button", { name: `+ ${type}` }).click();
    await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(unique(type.slice(0, 8)));
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Salvato."), `salvataggio di ${type}`).toBeVisible();
  }
});

test("editor del mazzo di carte: carte ed effetti dal modulo, etichette in italiano, validazione", async ({ browser, request }) => {
  const token = await adminToken(request);
  const admin = await openAdmin(browser, token);
  const { page } = admin;
  const title = unique("Mazzo form");

  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Mazzo di carte (Duello)" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(title);

  // Il mazzo parte dal mazzo base: 15 carte, la prima è il Fendente con un effetto di attacco
  const cards = page.locator('fieldset.field.array:has(> legend:has-text("Carte")) > .item.card');
  await expect(cards).toHaveCount(15);
  await expect(cards.first().getByLabel("Nome", { exact: true }).first()).toHaveValue("Fendente");
  // gli effetti hanno etichette leggibili, non i valori tecnici
  const kind = cards.first().getByLabel("Effetto").first();
  await expect(kind.locator("option")).toHaveText([
    "Attacco",
    "Colpo pesante (si risolve per ultimo)",
    "Scudo",
    "Contrattacco",
    "Cura",
    "Veleno",
    "Furto di una carta",
    "Spia (svela una carta avversaria)",
    "Sabotaggio (malus ai punti)",
  ]);

  // Nuova carta: nasce valida (valori predefiniti), la si compila
  await page.getByRole("button", { name: "+ Aggiungi carta" }).click();
  await expect(cards).toHaveCount(16);
  const added = cards.last();
  await added.getByLabel("Identificatore").fill("scatto-rapido");
  await added.getByLabel("Nome", { exact: true }).first().fill("Scatto rapido");
  await added.getByLabel("Effetto").first().selectOption("heal");
  await added.getByLabel("Valore").first().fill("4");

  // Identificatore duplicato: il server lo rifiuta spiegando il motivo
  await added.getByLabel("Identificatore").fill("fendente");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.locator(".error")).toContainText("diversi");

  await added.getByLabel("Identificatore").fill("scatto-rapido");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();

  const saved = (await (await request.get("/api/admin/instances", { headers: { Authorization: `Bearer ${token}` } })).json()) as { title: string; typeId: string; config: { cards: { id: string; effects: { kind: string; amount: number }[] }[] } }[];
  const deck = saved.find((i) => i.title === title)!;
  expect(deck.typeId).toBe("deck");
  expect(deck.config.cards).toHaveLength(16);
  expect(deck.config.cards.find((c) => c.id === "scatto-rapido")!.effects[0]).toMatchObject({ kind: "heal", amount: 4 });
});
