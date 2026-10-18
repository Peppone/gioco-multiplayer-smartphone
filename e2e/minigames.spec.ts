import { expect } from "@playwright/test";
import { test } from "./support";

test("vero/falso a raffica: risposte, rivelazione automatica, passaggio da solo alla successiva", async ({ newGame }) => {
  const g = await newGame([
    {
      typeId: "vero-falso",
      title: "Raffica e2e",
      theme: "retro80",
      config: {
        statements: [
          { text: "Il Sole è una stella.", answer: true },
          { text: "Il Monte Bianco è in Svizzera.", answer: false },
        ],
        timeSec: 30,
        // Passa da sola all'affermazione dopo: abbastanza da controllare schermo e telefoni anche sotto carico.
        revealSec: 6,
        wrongPenalty: 0,
      },
    },
  ]);
  const { screen, admin, a, b } = g;

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.locator('main.screen[data-theme="retro80"]')).toBeVisible();
  await expect(screen.page.getByText("Il Sole è una stella.")).toBeVisible();

  // Ada risponde giusto. Prima che rispondano tutti la risposta non è visibile né nel DOM né nel traffico.
  await a.page.getByRole("button", { name: "VERO", exact: true }).click();
  await expect(a.page.getByText("Risposta inviata!")).toBeVisible();
  await expect(screen.page.getByText("Hanno risposto 1 / 2")).toBeVisible();
  await expect(screen.page.locator(".tf-tile.right")).toHaveCount(0);
  for (const c of [screen, a, b]) expect(c.traffic.text()).not.toMatch(/"answer":(true|false)/);
  expect(admin.traffic.text()).toContain("VERO"); // la regia conosce la risposta

  // Bob sbaglia: hanno risposto tutti, si rivela da sola
  await b.page.getByRole("button", { name: "FALSO", exact: true }).click();
  // Controlli insieme, prima che la rivelazione passi da sola alla successiva.
  await Promise.all([
    expect(screen.page.locator(".tf-true.right")).toBeVisible(),
    expect(a.page.getByText(/Giusto! \+\d+/)).toBeVisible(),
    expect(b.page.getByText(/Sbagliato/)).toBeVisible(),
  ]);

  // Dopo la pausa passa da sola alla seconda affermazione
  await expect(screen.page.getByText("Il Monte Bianco è in Svizzera.")).toBeVisible();
  await a.page.getByRole("button", { name: "FALSO", exact: true }).click();
  await b.page.getByRole("button", { name: "FALSO", exact: true }).click();
  await expect(screen.page.locator(".tf-false.right")).toBeVisible();

  // Finita l'ultima affermazione il round si chiude da solo con la classifica
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  await expect(screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li")).toHaveCount(2);
});

test("stima numerica e sondaggio: stime nascoste, voti anonimi, punti alla rivelazione", async ({ newGame }) => {
  const g = await newGame([
    {
      typeId: "stima",
      title: "Stima e2e",
      theme: "pixel",
      config: { questions: [{ text: "Quanto è lungo il fiume?", answer: 100, unit: "km" }], timeSec: 120 },
    },
    {
      typeId: "sondaggio",
      title: "Sondaggio e2e",
      theme: "manga",
      config: {
        questions: [
          { text: "Ananas sulla pizza?", kind: "options", options: ["Sì", "No"] },
          { text: "Chi arriva sempre tardi?", kind: "players" },
        ],
        timeSec: 120,
        crowdPoints: 50,
        winnerPoints: 100,
      },
    },
  ]);
  const { screen, admin, a, b, nickA, nickB } = g;

  // ---- Stima ----
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.locator('main.screen[data-theme="pixel"]')).toBeVisible();
  await a.page.getByLabel("La tua stima").fill("90");
  await a.page.getByRole("button", { name: "Invia" }).click();
  await expect(a.page.getByText(/Tua stima: 90/)).toBeVisible();
  // si può cambiare idea finché c'è tempo
  await a.page.getByLabel("La tua stima").fill("99");
  await a.page.getByRole("button", { name: "Aggiorna" }).click();
  await expect(a.page.getByText(/Tua stima: 99/)).toBeVisible();
  await b.page.getByLabel("La tua stima").fill("130,5"); // virgola decimale all'italiana
  await b.page.getByRole("button", { name: "Invia" }).click();

  await expect(screen.page.getByText("Hanno risposto 2 / 2")).toBeVisible();
  await expect(screen.page.getByText(/Risposta:/)).toHaveCount(0);
  for (const c of [screen, a, b]) expect(c.traffic.text(), "valore esatto nel traffico").not.toMatch(/"answer":100/);
  // le stime dei giocatori non transitano verso lo schermo prima della rivelazione (si cercano le chiavi, non i numeri)
  expect(screen.traffic.text(), "stime nel traffico dello schermo").not.toMatch(/"value":|"guesses"/);

  await admin.page.getByRole("button", { name: "Rivela ora" }).click();
  await expect(screen.page.getByText("Risposta: 100 km")).toBeVisible();
  await expect(screen.page.locator(".results li").first()).toContainText(nickA);
  await expect(a.page.getByText(/1° posto/)).toBeVisible();
  await expect(b.page.getByText(/2° posto/)).toBeVisible();
  await admin.page.getByRole("button", { name: "Concludi" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();

  // ---- Sondaggio ----
  await admin.page.getByRole("button", { name: /Avvia round 2/ }).click();
  await expect(screen.page.locator('main.screen[data-theme="manga"]')).toBeVisible();
  await a.page.getByRole("button", { name: "Sì", exact: true }).click();
  await b.page.getByRole("button", { name: "Sì", exact: true }).click();
  await expect(screen.page.getByText(/Hanno votato 2 \/ 2/)).toBeVisible();
  await expect(screen.page.locator(".bars")).toHaveCount(0); // niente totali prima della rivelazione
  // anonimato: nessun voto individuale nel traffico di schermo e telefoni
  for (const c of [screen, a, b]) expect(c.traffic.text()).not.toMatch(/"votes"/);

  await admin.page.getByRole("button", { name: "Rivela i risultati" }).click();
  await expect(screen.page.locator(".bars li", { hasText: "Sì" }).locator(".n")).toHaveText("2");
  await expect(a.page.getByText("+50 punti!")).toBeVisible();
  await expect(b.page.getByText("+50 punti!")).toBeVisible();

  // Seconda domanda: voto a un giocatore (non si può votare sé stessi)
  await admin.page.getByRole("button", { name: "Prossima domanda" }).click();
  await expect(a.page.locator(".answer", { hasText: nickB })).toBeVisible();
  await expect(a.page.locator(".answer", { hasText: nickA })).toHaveCount(0);
  await a.page.locator(".answer", { hasText: nickB }).click();
  await b.page.locator(".answer", { hasText: nickA }).click();
  await admin.page.getByRole("button", { name: "Rivela i risultati" }).click();
  await expect(a.page.getByText("+100 punti!")).toBeVisible(); // parità: entrambi i più votati
  await expect(b.page.getByText("+100 punti!")).toBeVisible();
  await expect(screen.page.locator(".bars li.top")).toHaveCount(2);

  await admin.page.getByRole("button", { name: "Concludi" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 2")).toBeVisible();
  // Totale di Ada: 1000 (1° nella stima) + 50 + 100 = 1150
  await expect(screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li", { hasText: nickA })).toContainText("1150");
});

test("stima con cursore: il telefono rispetta minimo e massimo", async ({ newGame }) => {
  const g = await newGame([
    {
      typeId: "stima",
      title: "Cursore e2e",
      config: { questions: [{ text: "Quanti gradi?", answer: 50, unit: "°C", min: 0, max: 100 }], timeSec: 120 },
    },
  ]);
  await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(g.a.page.getByLabel("Cursore della stima")).toBeVisible();
  await g.a.page.getByLabel("La tua stima").fill("500"); // fuori dai limiti
  await expect(g.a.page.getByRole("button", { name: "Invia" })).toBeDisabled();
  await g.a.page.getByLabel("La tua stima").fill("42");
  await expect(g.a.page.getByRole("button", { name: "Invia" })).toBeEnabled();
  await g.a.page.getByRole("button", { name: "Invia" }).click();
  await expect(g.a.page.getByText(/Tua stima: 42/)).toBeVisible();
});
