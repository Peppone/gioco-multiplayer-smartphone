import { expect, test as plain } from "@playwright/test";
import { adminApi, adminToken, openAdmin, unique } from "./support";

// Libreria: creazione per famiglia, ricerca (titolo, minigioco, tema), filtri con conteggio, schede raggruppate e ordinate.

interface TypeInfo {
  id: string;
  sampleConfig: unknown;
}

async function setup(request: Parameters<typeof adminToken>[0]) {
  const token = await adminToken(request);
  const api = adminApi(request, token);
  const types = await api.call<TypeInfo[]>("get", "/minigame-types");
  const sample = (id: string) => types.find((t) => t.id === id)!.sampleConfig;
  const tag = unique("Zl");
  const make = (typeId: string, title: string, theme?: string) =>
    api.call("post", "/instances", { typeId, title: `${tag} ${title}`, theme, config: sample(typeId) });
  return { token, tag, make };
}

plain("libreria: i pulsanti di creazione stanno sotto il nome della loro famiglia", async ({ browser, request }) => {
  const { token } = await setup(request);
  const { page } = await openAdmin(browser, token);
  await page.getByRole("button", { name: "Libreria" }).click();

  const quiz = page.getByRole("group", { name: "Quiz e domande" });
  await expect(quiz.getByRole("button", { name: "+ Quiz a scelta multipla" })).toBeVisible();
  await expect(quiz.getByRole("button", { name: "+ Buzzer" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Cooperativi" }).getByRole("button", { name: "+ Artificieri" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Contenuti riusabili" }).getByRole("button", { name: "+ Mazzo di carte (Duello)" })).toBeVisible();
});

plain("libreria: la ricerca trova per titolo, minigioco o tema, ignorando maiuscole e accenti", async ({ browser, request }) => {
  const { token, tag, make } = await setup(request);
  await make("quiz-multipla", "Cultura generale");
  await make("buzzer", "Sfida lampo", "manga");
  await make("zombie-hunt", "Notte di Halloween");

  const { page } = await openAdmin(browser, token);
  await page.getByRole("button", { name: "Libreria" }).click();
  const search = page.getByLabel("Cerca un'istanza");
  const card = (name: string) => page.locator(".library ul.list li", { hasText: name });

  await search.fill(tag);
  await expect(card("Cultura generale")).toBeVisible();
  await expect(card("Sfida lampo")).toBeVisible();
  await expect(card("Notte di Halloween")).toBeVisible();

  await search.fill(`${tag} CULTURA`);
  await expect(card("Cultura generale")).toBeVisible();
  await expect(card("Sfida lampo")).toHaveCount(0);

  await search.fill(`${tag} zombie`); // nome del minigioco
  await expect(card("Notte di Halloween")).toBeVisible();
  await expect(card("Cultura generale")).toHaveCount(0);

  await search.fill(`${tag} manga`); // tema
  await expect(card("Sfida lampo")).toBeVisible();
  await expect(card("Notte di Halloween")).toHaveCount(0);

  await search.fill(`${tag} nessuna-corrispondenza`);
  await expect(page.getByText("Nessuna istanza corrisponde alla ricerca.")).toBeVisible();
  await search.fill("");
  await expect(page.getByText("Nessuna istanza corrisponde alla ricerca.")).toHaveCount(0);
});

plain("libreria: i filtri per famiglia mostrano i conteggi e le schede stanno sotto il loro gruppo, in ordine", async ({ browser, request }) => {
  const { token, tag, make } = await setup(request);
  await make("quiz-multipla", "Beta");
  await make("quiz-multipla", "Alfa");
  await make("zombie-hunt", "Orda");

  const { page } = await openAdmin(browser, token);
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByLabel("Cerca un'istanza").fill(tag);
  const filters = page.getByRole("group", { name: "Famiglia di minigioco" });

  await expect(filters.getByRole("button", { name: /^Tutte\s*3$/ })).toBeVisible();
  await expect(filters.getByRole("button", { name: /Quiz e domande\s*2$/ })).toBeEnabled();
  await expect(filters.getByRole("button", { name: /Azione e sfide\s*1$/ })).toBeEnabled();
  await expect(filters.getByRole("button", { name: /Cooperativi\s*0$/ })).toBeDisabled();

  await expect(page.getByRole("heading", { name: /Quiz e domande \(2\)/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Azione e sfide \(1\)/ })).toBeVisible();

  // Dentro la famiglia le schede sono in ordine alfabetico di titolo (stesso minigioco).
  const titles = page.getByRole("region", { name: "Quiz e domande" }).locator(".lib-title strong");
  await expect(titles).toHaveText([`${tag} Alfa`, `${tag} Beta`]);

  await filters.getByRole("button", { name: /Azione e sfide/ }).click();
  await expect(page.locator(".library ul.list li", { hasText: `${tag} Orda` })).toBeVisible();
  await expect(page.locator(".library ul.list li", { hasText: `${tag} Alfa` })).toHaveCount(0);

  // Un secondo clic toglie il filtro.
  await filters.getByRole("button", { name: /Azione e sfide/ }).click();
  await expect(page.locator(".library ul.list li", { hasText: `${tag} Alfa` })).toBeVisible();
});
