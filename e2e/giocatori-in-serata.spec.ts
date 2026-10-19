import { expect } from "@playwright/test";
import { joinPlayer, test } from "./support";

const quiz = {
  typeId: "quiz-multipla",
  title: "Quiz giocatori",
  config: { questions: [{ text: "Domanda per tutti?", options: ["Sì", "No"], correctIndex: 0, timeSec: 60 }] },
};
const second = {
  typeId: "quiz-multipla",
  title: "Secondo quiz",
  config: { questions: [{ text: "Seconda domanda?", options: ["Uno", "Due"], correctIndex: 1, timeSec: 60 }] },
};

test("la regia aggiunge e toglie giocatori a partita avviata: tra i round subito, durante un round dal successivo", async ({ browser, newGame }) => {
  const g = await newGame([quiz, second]);
  const { admin } = g;
  const roster = (nick: string) => admin.page.getByLabel(`Squadra di ${nick}`);
  const redOption = { label: `🔥 ${g.teams.red.name}` };
  const blueOption = { label: `🌊 ${g.teams.blue.name}` };

  await expect(admin.page.getByRole("heading", { name: /Giocatori della serata/ })).toBeVisible();

  // ---- Prima del primo round: un nuovo telefono si registra e la regia lo mette in squadra ----
  const cleo = await joinPlayer(browser, "CleoE2E");
  await expect(cleo.page.getByText("non sei stato aggiunto alla serata")).toBeVisible();
  await roster("CleoE2E").selectOption(redOption);
  await expect(cleo.page.getByText("Guarda lo schermo")).toBeVisible();
  await expect(cleo.page.getByText(g.teams.red.name)).toBeVisible();
  await expect(admin.page.getByText("Le modifiche valgono subito")).toBeVisible();

  // ---- Round 1: i tre rispondono; la regia aggiunge Dan e toglie Bob mentre il round è in corso ----
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(cleo.page.locator(".answer")).toHaveCount(2); // Cleo gioca già
  const dan = await joinPlayer(browser, "DanE2E");
  await roster("DanE2E").selectOption(blueOption);
  await expect(dan.page.getByText("entri dal prossimo round")).toBeVisible();
  await expect(admin.page.getByText(/ce n'è già qualcuna in attesa/)).toBeVisible();
  await roster(g.nickB).selectOption({ label: "Non in serata" });

  // Il round in corso non cambia: Bob gioca ancora, Dan guarda.
  await expect(g.b.page.locator(".answer")).toHaveCount(2);
  await expect(dan.page.locator(".answer")).toHaveCount(0);
  await g.b.page.getByRole("button", { name: /Sì/ }).click();
  await expect(g.b.page.getByText("Risposta inviata")).toBeVisible();

  // ---- Fine del round: le modifiche entrano in vigore ----
  await admin.page.getByRole("button", { name: "Termina il round ora" }).click();
  await expect(g.b.page.getByText("non sei stato aggiunto alla serata")).toBeVisible();
  await expect(dan.page.getByText("Guarda lo schermo")).toBeVisible();
  await expect(admin.page.getByText(/ce n'è già qualcuna in attesa/)).toHaveCount(0);
  await expect(g.screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li", { hasText: g.nickB })).toHaveCount(0);

  // ---- Round 2: giocano Ada, Cleo e Dan; Bob resta fuori ----
  await admin.page.getByRole("button", { name: /Avvia round 2/ }).click();
  await expect(dan.page.locator(".answer")).toHaveCount(2);
  await expect(cleo.page.locator(".answer")).toHaveCount(2);
  await expect(g.b.page.locator(".answer")).toHaveCount(0);

  // ---- Bob rientra mentre il round 2 è in corso: aspetta il prossimo ----
  await roster(g.nickB).selectOption(blueOption);
  await expect(g.b.page.getByText("entri dal prossimo round")).toBeVisible();

  for (const c of [cleo, dan]) await c.context.close();
});
