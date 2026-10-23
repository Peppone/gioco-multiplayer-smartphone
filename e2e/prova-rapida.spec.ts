import { expect, test as plain } from "@playwright/test";
import { adminApi, adminToken, openAdmin, test, unique } from "./support";

// Prova rapida: dalla libreria si prova un minigioco con giocatori finti, senza serata, squadre e partita da preparare.

const QUIZ = { questions: [{ text: "Quale lettera è la seconda?", options: ["Alfa", "Beta", "Gamma"], correctIndex: 1, timeSec: 60 }] };

async function makeQuiz(request: Parameters<typeof adminToken>[0], title: string) {
  const api = adminApi(request, await adminToken(request));
  const inst = await api.call<{ id: string }>("post", "/instances", { typeId: "quiz-multipla", title, theme: "pixel", config: QUIZ });
  return { api, id: inst.id };
}

// Un test che fallisce a metà non deve lasciare la prova aperta: occuperebbe l'unico engine del server e farebbe fallire i test dopo.
plain.afterEach(async ({ request }) => {
  await request.delete("/api/admin/test-session", { headers: { Authorization: `Bearer ${await adminToken(request)}` } });
});

const sessionOf = async (api: ReturnType<typeof adminApi>) => (await api.call<{ session: { matchId: string } | null }>("get", "/test-session")).session;

plain("prova rapida: un clic dalla libreria e il quiz gira con schermo e telefoni di prova nella stessa pagina", async ({ browser, request }) => {
  const title = unique("Quiz prova");
  const { api } = await makeQuiz(request, title);
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria", exact: true }).click();

  // I contenuti (mazzi, liste di parole) non si giocano: niente pulsante. I minigiochi sì.
  await expect(page.getByRole("button", { name: `Prova ${title}` })).toBeVisible();

  await page.getByRole("button", { name: `Prova ${title}` }).click();
  const form = page.getByRole("form", { name: `Prova di ${title}` });
  await form.getByLabel("Telefoni di prova").fill("4");
  await form.getByRole("button", { name: "Avvia la prova" }).click();

  // Si passa alla scheda della prova, già dentro il primo round.
  await expect(page.getByRole("heading", { name: `🧪 Prova: ${title}` })).toBeVisible();
  const screen = page.frameLocator("iframe[title='Schermo di prova']");
  await expect(screen.getByText("Quale lettera è la seconda?")).toBeVisible();
  await expect(page.locator("iframe[title^='Telefono di']")).toHaveCount(4);

  // Ogni telefono è un giocatore diverso, e risponde davvero: la scelta arriva al server e torna alla vista di quel telefono.
  const first = page.frameLocator("iframe[title='Telefono di Prova 1']");
  const second = page.frameLocator("iframe[title='Telefono di Prova 2']");
  await expect(first.locator(".answer")).toHaveCount(3);
  await first.locator(".answer", { hasText: "Beta" }).click();
  await expect(first.getByText("Risposta inviata")).toBeVisible();
  await expect(second.getByText("Risposta inviata")).toHaveCount(0);
  await expect(screen.getByText("Hanno risposto 1 / 4")).toBeVisible();

  // I comandi della regia sono qui accanto, senza scelta di serata né giocatori.
  await expect(page.getByRole("button", { name: "Termina il round ora" })).toBeVisible();
  await expect(page.getByText("Avvia una partita")).toHaveCount(0);

  // I telefoni di prova non toccano il profilo del browser (condiviso da tutte le pagine dello stesso indirizzo).
  expect(await page.evaluate(() => localStorage.getItem("gioco.token"))).toBeNull();
  // …né compaiono tra i giocatori, le squadre o le serate vere.
  expect((await api.call<{ nickname: string }[]>("get", "/players")).filter((p) => p.nickname.startsWith("Prova "))).toEqual([]);
  expect((await api.call<{ name: string }[]>("get", "/teams")).filter((t) => t.name.includes("(prova)"))).toEqual([]);
  expect((await api.call<{ name: string }[]>("get", "/events")).filter((e) => e.name.startsWith("Prova"))).toEqual([]);

  // Si conclude il round: la classifica compare sullo schermo di prova.
  await page.getByRole("button", { name: "Termina il round ora" }).click();
  await expect(screen.getByText("Classifica dopo il round 1")).toBeVisible();

  // Chiudere la prova riporta alla libreria e non lascia nulla.
  await page.getByRole("button", { name: "Chiudi la prova" }).click();
  await expect(page.getByRole("heading", { name: "Libreria minigiochi" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^🧪 Prova$/ })).toHaveCount(0);
  expect(await sessionOf(api)).toBeNull();
});

plain("prova rapida: ricaricando la pagina la prova in corso si ritrova, e dal pannello Live si può concludere", async ({ browser, request }) => {
  const title = unique("Quiz ricarica");
  const { api, id } = await makeQuiz(request, title);
  await api.call("post", "/test-session", { instanceId: id, players: 2, teams: false });
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;

  // Appena rientrata, la regia è sulla scheda della prova.
  await expect(page.getByRole("heading", { name: `🧪 Prova: ${title}` })).toBeVisible();
  await expect(page.locator("iframe[title^='Telefono di']")).toHaveCount(2);

  // Senza squadre i telefoni non ne mostrano il nome.
  await expect(page.locator(".test-phone figcaption small")).toHaveCount(0);

  // La prova è una partita come le altre: dal pannello Live si conclude e si chiude, e la scheda sparisce da sola.
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await page.getByRole("button", { name: "Termina la partita" }).click();
  await page.getByRole("button", { name: "Torna alla lobby" }).click();
  await expect(page.getByRole("button", { name: /^🧪 Prova$/ })).toHaveCount(0, { timeout: 10_000 });
  expect(await sessionOf(api)).toBeNull();
  expect((await api.call<{ nickname: string }[]>("get", "/players")).filter((p) => p.nickname.startsWith("Prova "))).toEqual([]);
});

plain("prova rapida: due squadre di prova con il loro nome sotto i telefoni; con troppi giocatori l'errore è chiaro e non resta nulla", async ({ browser, request }) => {
  const title = unique("Quiz squadre");
  const { api, id } = await makeQuiz(request, title);
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  await page.getByRole("button", { name: "Libreria", exact: true }).click();

  // Un minigioco con un massimo di giocatori (Parole Mannare: 12) rifiuta la prova con troppi telefoni.
  const wolves = await api.call<{ id: string }>("post", "/instances", {
    typeId: "parole-mannare",
    title: unique("Parole prova"),
    config: (await api.call<{ id: string; sampleConfig: unknown }[]>("get", "/minigame-types")).find((t) => t.id === "parole-mannare")!.sampleConfig,
  });
  expect(wolves.id).toBeTruthy();
  const refused = await request.post("/api/admin/test-session", { headers: { Authorization: `Bearer ${await adminToken(request)}` }, data: { instanceId: wolves.id, players: 20 } });
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as { detail: string }).detail).toContain("massimo 12 giocatori");
  expect(await sessionOf(api)).toBeNull();
  expect((await api.call<{ nickname: string }[]>("get", "/players")).filter((p) => p.nickname.startsWith("Prova "))).toEqual([]);

  await page.getByRole("button", { name: `Prova ${title}` }).click();
  await page.getByRole("form", { name: `Prova di ${title}` }).getByRole("button", { name: "Avvia la prova" }).click();
  await expect(page.getByRole("heading", { name: `🧪 Prova: ${title}` })).toBeVisible();
  await expect(page.locator(".test-phone figcaption", { hasText: "Rossi (prova)" })).toHaveCount(3);
  await expect(page.locator(".test-phone figcaption", { hasText: "Blu (prova)" })).toHaveCount(3);
  await page.getByRole("button", { name: "Chiudi la prova" }).click();
  await expect(page.getByRole("heading", { name: "Libreria minigiochi" })).toBeVisible();
});

test("prova rapida: durante una partita vera il pulsante dice di concluderla e non la tocca", async ({ newGame, request }) => {
  const g = await newGame([{ typeId: "quiz-multipla", title: "Quiz vero", theme: "pixel", config: QUIZ }]);
  const api = adminApi(request, await adminToken(request));
  const quiz = (await api.call<{ id: string; title: string }[]>("get", "/instances")).find((i) => i.title === "Quiz vero")!;

  const { page } = g.admin;
  await page.getByRole("button", { name: "Libreria", exact: true }).click();
  await page.getByRole("button", { name: `Prova ${quiz.title}` }).click();
  await page.getByRole("button", { name: "Avvia la prova" }).click();
  await expect(page.getByText("C'è già una partita in corso")).toBeVisible();
  await expect(page.getByRole("button", { name: /^🧪 Prova$/ })).toHaveCount(0);
  expect(await sessionOf(api)).toBeNull();

  // La partita vera è rimasta com'era.
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(g.screen.page.getByText("Si comincia tra poco!")).toBeVisible();
  // Il pannello Live è appena tornato: si aspetta che sia pronto, così la pulizia di fine test lo trova per terminare la partita.
  await expect(page.getByRole("button", { name: "Termina la partita" })).toBeVisible();
});

// Alcuni minigiochi partono da una bozza da completare (parole da scrivere): per la prova si compila qui.
const WORDS = Array.from({ length: 40 }, (_, i) => `parola${i + 1}`);
const OWN_CONFIG: Record<string, unknown> = {
  "reazione-a-catena": { words: WORDS.slice(0, 8), order: "random" },
  "agenti-segreti": { words: WORDS, gridSize: "5x5" },
};

plain("prova rapida: ogni minigioco della libreria parte con un clic e schermo e telefono lo disegnano senza errori", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const token = await adminToken(request);
  const api = adminApi(request, token);
  const types = (await api.call<{ id: string; kind: string; title: string; sampleConfig: unknown }[]>("get", "/minigame-types")).filter((t) => t.kind === "minigame");
  expect(types.length).toBeGreaterThanOrEqual(15);

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const screen = await context.newPage();
  const phone = await context.newPage();
  const errors: string[] = [];
  for (const p of [screen, phone]) p.on("pageerror", (e) => errors.push(e.message));
  await screen.goto("/screen");

  const played: string[] = [];
  for (const type of types) {
    // Il duello riferisce altri minigiochi della libreria: gli si dà un quiz come unico minigioco.
    const config = type.id === "knight-duel" ? { pool: [(await makeQuiz(request, unique("Quiz duello"))).id], hp: 10, minigamesPerBattle: 1, maxBattles: 3 } : (OWN_CONFIG[type.id] ?? type.sampleConfig);
    const created = await request.post("/api/admin/instances", { headers: { Authorization: `Bearer ${token}` }, data: { typeId: type.id, title: unique(`Prova ${type.id}`), config } });
    expect(created.ok(), `${type.id}: ${await created.text()}`).toBe(true);
    const inst = (await created.json()) as { id: string };
    const session = await api.call<{ players: { token: string }[] }>("post", "/test-session", { instanceId: inst.id });

    await expect(screen.locator(`main.screen`)).toContainText(/Round 1\/1/, { timeout: 15_000 });
    await phone.goto(`/play?as=${session.players[0]!.token}&silent=1`);
    await expect(phone.locator("main.controller[data-theme]")).toBeVisible({ timeout: 15_000 });
    // Il telefono è nel round: niente schermata d'attesa.
    await expect(phone.locator("main.controller.waiting"), `${type.id}: il telefono è rimasto in attesa`).toHaveCount(0);
    played.push(type.id);

    expect((await request.delete("/api/admin/test-session", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(204);
  }
  expect(played).toEqual(types.map((t) => t.id));
  expect(errors).toEqual([]);
  await context.close();
});
