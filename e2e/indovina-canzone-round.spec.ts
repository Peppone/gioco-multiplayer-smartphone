import { expect, test as plain } from "@playwright/test";
import { addSongFiles, closeAdvanced, openAdvanced, silentWav, uploadTone } from "./audio-support";
import { adminToken, openAdmin, test, unique } from "./support";

// Quiz musicale: gestore delle categorie, round per categoria e scelta della categoria tra un round e l'altro.

const wav = (name: string) => ({ name, mimeType: "audio/wav", buffer: silentWav() });
const title = (n: number) => `Titolo e artista (solo regia) del brano ${n}`;

async function newEditor(browser: import("@playwright/test").Browser, request: import("@playwright/test").APIRequestContext) {
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Indovina la canzone" }).click();
  const name = unique("Canzoni round");
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(name);
  return { ...admin, name };
}

plain("gestore categorie: si aggiungono, si rinominano e si eliminano, e i brani e i round le seguono", async ({ browser, request }) => {
  const { page, name } = await newEditor(browser, request);
  const manager = page.locator(".category-manager");
  await addSongFiles(page, [wav("uno.wav"), wav("due.wav"), wav("tre.wav")]);
  await expect(page.locator(".song-row")).toHaveCount(3); // i titoli si scrivono a caricamento finito
  for (const n of [1, 2, 3]) await page.getByLabel(title(n)).fill(`Brano ${n}`);

  // Il gestore sta sopra l'elenco dei brani; si aggiungono due categorie (Invio o bottone), un doppione è rifiutato.
  await expect(manager).toBeVisible();
  await manager.getByLabel("Nome della nuova categoria").fill("Rock");
  await manager.getByRole("button", { name: "+ Aggiungi categoria" }).click();
  await manager.getByLabel("Nome della nuova categoria").fill("Pop");
  await manager.getByLabel("Nome della nuova categoria").press("Enter");
  await expect(manager.locator(".category-row")).toHaveCount(2);
  await manager.getByLabel("Nome della nuova categoria").fill("rock");
  await expect(manager.getByRole("alert")).toContainText("esiste già");
  await expect(manager.getByRole("button", { name: "+ Aggiungi categoria" })).toBeDisabled();
  await manager.getByLabel("Nome della nuova categoria").fill("");

  // I brani scelgono dal catalogo: il 1 e il 2 sono Rock, il 2 anche Pop.
  let panel = await openAdvanced(page, 1);
  await panel.getByRole("checkbox", { name: "Rock" }).check();
  await closeAdvanced(page, 1);
  panel = await openAdvanced(page, 2);
  await panel.getByRole("checkbox", { name: "Rock" }).check();
  await panel.getByRole("checkbox", { name: "Pop" }).check();
  await closeAdvanced(page, 2);
  await expect(manager.locator('[data-category="Rock"]')).toContainText("2 brani");
  await expect(manager.locator('[data-category="Pop"]')).toContainText("1 brano");
  await expect(manager).toContainText("1 brano senza categoria");

  // Un round con la categoria fissa la sceglie tra quelle del quiz.
  await page.getByRole("button", { name: "+ Aggiungi round" }).click();
  await page.getByLabel("Chi decide la categoria").selectOption("fixed");
  await page.getByLabel("Categoria del round").selectOption("Rock");
  await page.getByLabel("Brani del round").fill("2");

  // Rinominare cambia il nome nei brani e nel round.
  await manager.getByLabel("Nome della categoria 1").fill("Rock anni 90");
  await manager.getByLabel("Nome della categoria 1").press("Enter");
  await expect(manager.locator('[data-category="Rock anni 90"]')).toContainText("2 brani");
  await expect(page.getByRole("list", { name: "Impostazioni del brano 1" })).toContainText("categorie: Rock anni 90");
  await expect(page.getByLabel("Categoria del round")).toHaveValue("Rock anni 90");
  // Un nome già usato non vale: il campo torna com'era.
  await manager.getByLabel("Nome della categoria 2").fill("rock anni 90");
  await expect(manager.getByRole("alert")).toContainText("esiste già");
  await manager.getByLabel("Nome della categoria 2").press("Enter");
  await expect(manager.getByLabel("Nome della categoria 2")).toHaveValue("Pop");

  // Salvato e riaperto: catalogo, brani e round sono quelli.
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.locator(".library ul.list li", { hasText: name }).getByRole("button", { name: "Modifica" }).click();
  await expect(page.locator(".category-manager .category-row")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Impostazioni del brano 2" })).toContainText("categorie: Rock anni 90, Pop");
  await expect(page.getByLabel("Categoria del round")).toHaveValue("Rock anni 90");

  // Eliminare una categoria la toglie dai brani (che restano) e il round che la fissava resta senza categoria.
  await page.locator('.category-manager [data-category="Rock anni 90"]').getByRole("button", { name: /Elimina la categoria/ }).click();
  await expect(page.locator(".category-manager .category-row")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "Impostazioni del brano 1" })).toContainText("impostazioni predefinite");
  await expect(page.locator(".song-row")).toHaveCount(3);
  await expect(page.getByLabel("Categoria del round")).toHaveValue("");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText(/Round 1: scegli la categoria/)).toBeVisible();
});

plain("round: i controlli al salvataggio dicono quando un round non ha abbastanza brani", async ({ browser, request }) => {
  const { page } = await newEditor(browser, request);
  await addSongFiles(page, [wav("a.wav"), wav("b.wav")]);
  await expect(page.locator(".song-row")).toHaveCount(2);
  for (const n of [1, 2]) await page.getByLabel(title(n)).fill(`Brano ${n}`);
  const manager = page.locator(".category-manager");
  await manager.getByLabel("Nome della nuova categoria").fill("Jazz");
  await manager.getByLabel("Nome della nuova categoria").press("Enter");
  const panel = await openAdvanced(page, 1);
  await panel.getByRole("checkbox", { name: "Jazz" }).check();
  await closeAdvanced(page, 1);

  await page.getByRole("button", { name: "+ Aggiungi round" }).click();
  await page.getByLabel("Chi decide la categoria").selectOption("fixed");
  await page.getByLabel("Categoria del round").selectOption("Jazz");
  await page.getByLabel("Brani del round").fill("3");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText(/chiedono 3 brani in tutto, ma ce ne sono 1/)).toBeVisible();
});

plain("svela gradualmente: è nel pannello di ogni brano, serve un effetto e si salva brano per brano", async ({ browser, request }) => {
  const { page, name } = await newEditor(browser, request);
  await addSongFiles(page, [wav("a.wav"), wav("b.wav")]);
  await expect(page.locator(".song-row")).toHaveCount(2);
  for (const n of [1, 2]) await page.getByLabel(title(n)).fill(`Brano ${n}`);
  // Non è più un'impostazione del round.
  await expect(page.getByLabel(/Svela gradualmente il suono/)).toHaveCount(0);

  const panel = await openAdvanced(page, 1);
  await expect(panel.locator('[data-section="Svela gradualmente"]')).toBeVisible();
  await expect(panel.getByLabel("Suono nitido al (% dell'ascolto)")).toHaveCount(0);
  await panel.getByLabel(/Svela gradualmente il suono/).check();
  await panel.getByLabel("Suono nitido al (% dell'ascolto)").first().fill("70");
  await closeAdvanced(page, 1);
  // Senza effetti sul brano non c'è nulla da svelare: il salvataggio lo dice e indica il brano.
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText(/Brano 1: «Svela gradualmente» non ha effetto/)).toBeVisible();

  const again = await openAdvanced(page, 1);
  await again.getByRole("button", { name: "+ Aggiungi effetto" }).click();
  await again.getByLabel("Effetto", { exact: true }).first().selectOption("blur");
  await closeAdvanced(page, 1);
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();

  // Riaperto: il brano 1 svela con il 70%, il brano 2 no.
  await page.reload();
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.locator(".library ul.list li", { hasText: name }).getByRole("button", { name: "Modifica" }).click();
  const first = await openAdvanced(page, 1);
  await expect(first.getByLabel(/Svela gradualmente il suono/)).toBeChecked();
  await expect(first.getByLabel("Suono nitido al (% dell'ascolto)").first()).toHaveValue("70");
  await closeAdvanced(page, 1);
  const second = await openAdvanced(page, 2);
  await expect(second.getByLabel(/Svela gradualmente il suono/)).not.toBeChecked();
});

test("round: le squadre scelgono a turno la categoria di ogni round, la regia quella di un altro, e un brano non torna", async ({ newGame, request }) => {
  const [x1, x2, y1, z1] = [await uploadTone(request, "x1.wav", silentWav()), await uploadTone(request, "x2.wav", silentWav()), await uploadTone(request, "y1.wav", silentWav()), await uploadTone(request, "z1.wav", silentWav())];
  const g = await newGame([
    {
      typeId: "indovina-canzone",
      title: "Round e2e",
      config: {
        songs: [
          { audio: x1, answer: "X1-SEGRETO", categories: ["Round X"] },
          { audio: x2, answer: "X2-SEGRETO", categories: ["Round X"] },
          { audio: y1, answer: "Y1-SEGRETO", categories: ["Round Y"] },
          { audio: z1, answer: "Z1-SEGRETO", categories: ["Round Z"] },
        ],
        rounds: [
          { selection: "teams", songs: 2 },
          { selection: "host", songs: 1 },
        ],
        pickSeconds: 60,
        clipSeconds: 30,
      },
    },
  ]);
  const { screen, admin, a, b, teams, nickB } = g;

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  // Round 1: tocca alla prima squadra per nome (Blu), che sceglie per tutti.
  await expect(screen.page.getByText("Round 1 di 2")).toBeVisible();
  await expect(screen.page.getByText(`Tocca a ${teams.blue.name}: ${nickB} sceglie la categoria per tutti!`)).toBeVisible();
  await expect(b.page.getByText("Round 1: sei il capitano, scegli per tutti.")).toBeVisible();
  await expect(a.page.getByRole("button", { name: /Round/ })).toHaveCount(0);
  expect(a.traffic.text()).not.toContain("Round X");
  for (const client of [screen, a, b]) expect(client.traffic.text()).not.toContain("SEGRETO");
  await expect(admin.page.getByText("Round 1 di 2")).toBeVisible();

  await b.page.getByRole("button", { name: /Round X/ }).click();
  await expect(screen.page.getByText("Categoria: Round X")).toBeVisible();
  await expect(screen.page.getByText("Round 1 di 2 · brano 1 di 2")).toBeVisible();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await admin.page.getByRole("button", { name: "Salta il brano" }).click();
  await admin.page.getByRole("button", { name: "Prossimo brano" }).click();

  // Lo stesso round continua con un altro brano della categoria, senza nuova scelta.
  await expect(screen.page.getByText("Round 1 di 2 · brano 2 di 2")).toBeVisible();
  await expect(screen.page.getByText("Categoria: Round X")).toBeVisible();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await admin.page.getByRole("button", { name: "Salta il brano" }).click();
  await expect(screen.page.locator(".answer")).toContainText(/X[12]-SEGRETO/);
  await admin.page.getByRole("button", { name: "Prossimo brano" }).click();

  // Round 2: sceglie la regia, senza tempo e senza pulsanti sui telefoni; «Round X» è esaurita.
  await expect(screen.page.getByText("Round 2 di 2")).toBeVisible();
  await expect(screen.page.getByText("La regia sceglie la categoria…")).toBeVisible();
  await expect(screen.page.getByRole("list", { name: "Categorie" })).not.toContainText("Round X");
  await expect(screen.page.locator(".countdown")).toHaveCount(0);
  await expect(b.page.getByRole("button", { name: /Round/ })).toHaveCount(0);
  await expect(b.page.getByText("Sceglie la regia…")).toBeVisible();
  await expect(admin.page.getByRole("button", { name: /Scegli «Round X»/ })).toHaveCount(0);
  await admin.page.getByRole("button", { name: /Scegli «Round Z»/ }).click();
  await expect(screen.page.getByText("Categoria: Round Z")).toBeVisible();
  await admin.page.getByRole("button", { name: "Fai partire la musica" }).click();
  await admin.page.getByRole("button", { name: "Salta il brano" }).click();
  await expect(screen.page.locator(".answer")).toContainText("Z1-SEGRETO");
  // Era l'ultimo round.
  await admin.page.getByRole("button", { name: "Concludi" }).click();
  await expect(screen.page.getByRole("heading", { name: "Classifica dopo il round 1" })).toBeVisible();
});
