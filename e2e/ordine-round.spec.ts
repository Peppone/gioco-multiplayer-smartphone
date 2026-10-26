import { expect } from "@playwright/test";
import { test } from "./support";

const quiz = (title: string, text: string) => ({
  typeId: "quiz-multipla",
  title,
  config: { questions: [{ text, options: ["Sì", "No"], correctIndex: 0, timeSec: 60 }] },
});

test("la regia cambia l'ordine dei round ancora da giocare a partita avviata", async ({ newGame }) => {
  const g = await newGame([quiz("Quiz Uno", "Prima?"), quiz("Quiz Due", "Seconda?"), quiz("Quiz Tre", "Terza?")]);
  const { admin } = g;
  const order = admin.page.locator(".round-order li");

  await expect(order).toHaveText([/Quiz Uno/, /Quiz Due/, /Quiz Tre/]);
  await expect(admin.page.getByRole("button", { name: /Avvia round 1: Quiz Uno/ })).toBeVisible();

  // Prima del primo round: «Quiz Tre» passa in testa.
  await admin.page.getByRole("button", { name: "Anticipa Quiz Tre" }).click();
  await expect(order).toHaveText([/Quiz Uno/, /Quiz Tre/, /Quiz Due/]);
  await admin.page.getByRole("button", { name: "Anticipa Quiz Tre" }).click();
  await expect(order).toHaveText([/Quiz Tre/, /Quiz Uno/, /Quiz Due/]);
  await expect(admin.page.getByRole("button", { name: /Avvia round 1: Quiz Tre/ })).toBeVisible();

  // Round in corso: esce dall'elenco e non si può più spostare; gli altri sì.
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(g.a.page.getByText("Terza?")).toBeVisible();
  await expect(order).toHaveText([/Quiz Uno/, /Quiz Due/]);
  await admin.page.getByRole("button", { name: "Posticipa Quiz Uno" }).click();
  await expect(order).toHaveText([/Quiz Due/, /Quiz Uno/]);

  await admin.page.getByRole("button", { name: "Termina il round ora" }).click();
  await expect(admin.page.getByRole("button", { name: /Avvia round 2: Quiz Due/ })).toBeVisible();
  await admin.page.getByRole("button", { name: /Avvia round 2/ }).click();
  await expect(g.a.page.getByText("Seconda?")).toBeVisible();
  await expect(order).toHaveText([/Quiz Uno/]);
  await expect(admin.page.locator(".round-order button")).toHaveCount(2);
  for (const b of await admin.page.locator(".round-order button").all()) await expect(b).toBeDisabled();
});
