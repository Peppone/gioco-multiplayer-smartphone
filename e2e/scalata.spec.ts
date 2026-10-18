import { expect } from "@playwright/test";
import { test } from "./support";

test("la scalata: chi sbaglia continua a rispondere con punti ridotti, chi non sbaglia mai prende il montepremi", async ({ newGame }) => {
  const g = await newGame(
    [
      {
        typeId: "scalata",
        title: "Scalata e2e",
        theme: "gameshow",
        config: {
          questions: [
            { text: "Primo livello?", options: ["Alfa", "Beta", "Gamma"], correctIndex: 0 },
            { text: "Secondo livello?", options: ["Delta", "Epsilon", "Zeta"], correctIndex: 1 },
          ],
          prizePoints: 1000,
          defaultTimeSec: 60,
          basePoints: 100,
          afterOutPercent: 50,
          // La rivelazione passa da sola al livello dopo: deve durare abbastanza da controllare schermo e telefoni
          // anche con la macchina carica (i controlli partono insieme, vedi sotto).
          revealSec: 8,
        },
      },
    ],
    { playersPerTeam: 2 },
  );
  const { screen, admin, a: ada, b: bob } = g;
  const rosa = g.reds[1]!;
  const bea = g.blues[1]!;
  const pick = (c: typeof ada, name: RegExp) => c.page.getByRole("button", { name }).click();

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText("Livello 1 di 2")).toBeVisible();
  await expect(screen.page.getByText("In palio: 1000 punti")).toBeVisible();
  await expect(screen.page.locator(".sc-alive li")).toHaveCount(4);

  // Livello 1: Bea sbaglia. Finché non rivela, la risposta giusta non transita da nessuna parte.
  await pick(ada, /Alfa/);
  await pick(bea, /Beta/);
  await expect(screen.page.getByText("Hanno risposto 2 / 4")).toBeVisible();
  for (const c of [screen, ada, bea]) expect(c.traffic.text()).not.toContain("correctIndex");
  await pick(bob, /Alfa/);
  await pick(rosa, /Alfa/);
  // Controlli insieme: uno dopo l'altro si sommerebbero le attese e la rivelazione potrebbe finire prima dell'ultimo.
  await Promise.all([
    expect(screen.page.getByText(/Primo errore per:/)).toBeVisible(),
    expect(bea.page.getByText("Sbagliato: sei fuori dal montepremi")).toBeVisible(),
    expect(ada.page.getByText("+100 punti!")).toBeVisible(),
  ]);

  // Livello 2: Bea ha già sbagliato ma risponde lo stesso (vale la metà); Bob e Rosa sbagliano, resta solo Ada.
  await expect(screen.page.getByText("Livello 2 di 2")).toBeVisible();
  await expect(screen.page.locator(".sc-alive li")).toHaveCount(3);
  await expect(bea.page.getByText(/Hai già sbagliato/)).toBeVisible();
  await expect(bea.page.getByRole("button", { name: /Epsilon/ })).toBeEnabled();
  await pick(bea, /Epsilon/);
  await pick(ada, /Epsilon/);
  await pick(bob, /Delta/);
  await pick(rosa, /Zeta/);
  await Promise.all([
    expect(bea.page.getByText("+100 punti!")).toBeVisible(), // 200 × 50%
    expect(ada.page.getByText("+200 punti!")).toBeVisible(),
  ]);

  // Finito il livello 2 resta Ada sola: il round si chiude e la classifica dà a lei 100 + 200 + 1000 di montepremi, agli altri 100 a testa.
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  const rows = screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText(g.nickA);
  await expect(rows.first()).toContainText("1300");
  await expect(rows.last()).not.toContainText("1300");
});
