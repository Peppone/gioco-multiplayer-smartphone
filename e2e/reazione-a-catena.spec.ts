import { expect } from "@playwright/test";
import { adminApi, adminToken, test, unique } from "./support";

const WORDS = ["Pappagallo", "Lampione", "Zattera", "Orologio", "Violino", "Cactus", "Fisarmonica", "Tramonto"];

test("reazione a catena: la regia sceglie la terna, la parola va a chi dà gli indizi, il tempo si ferma e riparte solo col via", async ({ newGame }) => {
  const g = await newGame(
    [{ typeId: "reazione-a-catena", title: "Catena e2e", theme: "gameshow", config: { words: WORDS, turns: 1, timeSec: 60, maxPasses: 3 } }],
    { playersPerTeam: 2 },
  );
  const { screen, admin, a: ada, b: bob } = g;
  const rosa = g.reds[1]!;
  const bea = g.blues[1]!;

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(admin.page.getByRole("heading", { name: "Turno 1 di 1" })).toBeVisible();

  // La regia sceglie: Ada e Rosa danno gli indizi, Bob indovina, Bea guarda.
  const labels = await admin.page.getByLabel("Chi indovina").locator("option").allInnerTexts();
  const rosaNick = labels.find((l) => l.startsWith("Rosa"))!;
  const pick = async (label: string, nick: string) => {
    await admin.page.getByLabel(label).selectOption({ label: nick });
    await expect(admin.page.getByLabel(label)).toHaveValue(await admin.page.getByLabel(label).locator("option", { hasText: nick }).getAttribute("value") ?? "");
  };
  await pick("Primo che dà gli indizi", g.nickA);
  await pick("Secondo che dà gli indizi", rosaNick);
  await pick("Chi indovina", g.nickB);
  await expect(screen.page.getByText("indizio 1")).toBeVisible();
  await expect(screen.page.getByText("indovina", { exact: true })).toBeVisible();

  // Prima del via nessuno vede parole.
  await expect(screen.page.locator(".rc-word")).toHaveCount(0);
  await admin.page.getByRole("button", { name: /Via!/ }).click();

  // La parola è su schermo e sui telefoni di chi dà gli indizi, non su quello di chi indovina né degli spettatori.
  await expect(screen.page.locator(".rc-word")).toBeVisible();
  const first = (await screen.page.locator(".rc-word").innerText()).trim();
  expect(WORDS).toContain(first);
  await expect(ada.page.locator(".rc-word")).toHaveText(first);
  await expect(rosa.page.locator(".rc-word")).toHaveText(first);
  await expect(bob.page.getByRole("button", { name: "HO LA RISPOSTA!" })).toBeVisible();
  await expect(bob.page.locator(".rc-word")).toHaveCount(0);
  await expect(bea.page.locator(".rc-word")).toHaveCount(0);
  for (const c of [bob, bea]) expect(c.traffic.text()).not.toContain(first);
  await expect(admin.page.locator(".rc-host-word")).toHaveText(first);

  // Bob preme: il tempo si ferma; la regia giudica «giusta» e carica la parola dopo, che resta nascosta.
  await bob.page.getByRole("button", { name: "HO LA RISPOSTA!" }).click();
  await expect(screen.page.getByText("Risposta! Il tempo è fermo")).toBeVisible();
  await expect(screen.page.locator(".rc-timer.frozen")).toBeVisible();
  await admin.page.getByRole("button", { name: /Giusta/ }).click();
  await expect(screen.page.getByText(`Giusta: ${first}`)).toBeVisible();
  await expect(screen.page.locator(".rc-word")).toHaveCount(0);
  await expect(ada.page.locator(".rc-word")).toHaveCount(0);
  await expect(ada.page.getByText("Si aspetta il via del master")).toBeVisible();
  await expect(ada.page.getByRole("button", { name: /Passa/ })).toBeDisabled();

  // Il via della regia mostra la parola nuova (diversa dalla prima).
  await admin.page.getByRole("button", { name: "▶ Via alla parola" }).click();
  await expect(screen.page.locator(".rc-word")).toBeVisible();
  const second = (await screen.page.locator(".rc-word").innerText()).trim();
  expect(second).not.toBe(first);
  await expect(ada.page.locator(".rc-word")).toHaveText(second);
  await expect(screen.page.locator(".rc-stats .ok")).toHaveText("✔ 1");

  // Ada passa: il tempo si ferma e resta fermo finché la regia non dà il via; restano 2 passate.
  await ada.page.getByRole("button", { name: /Passa/ }).click();
  await expect(screen.page.getByText("Passata. Si aspetta il via del master")).toBeVisible();
  await expect(screen.page.locator(".rc-word")).toHaveCount(0);
  await admin.page.getByRole("button", { name: "▶ Via alla parola" }).click();
  await expect(ada.page.getByRole("button", { name: "Passa (2 rimaste)" })).toBeEnabled();

  // Errore: −1; poi tempo extra e chiusura del turno.
  await bob.page.getByRole("button", { name: "HO LA RISPOSTA!" }).click();
  await admin.page.getByRole("button", { name: /Sbagliata/ }).click();
  await expect(screen.page.locator(".rc-stats .ko")).toHaveText("✘ 1");
  await admin.page.getByRole("button", { name: "+ 30 s" }).click();
  await admin.page.getByRole("button", { name: "Chiudi il turno" }).click();
  await expect(screen.page.getByText("Turno finito!").first()).toBeVisible();
  await expect(admin.page.getByText("Turno finito: +0 punti a testa")).toBeVisible();

  // Fine del round: la classifica registra il netto (1 giusta − 1 errore = 0), quindi nessun punto a nessuno.
  await admin.page.getByRole("button", { name: "Concludi il round" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});

test("reazione a catena: lo schermo può non mostrare la parola e il tempo finito chiude il turno da solo", async ({ newGame }) => {
  const g = await newGame(
    [{ typeId: "reazione-a-catena", title: "Catena muta", theme: "gameshow", config: { words: WORDS, turns: 1, timeSec: 10, showWordOnScreen: false } }],
  );
  const { screen, admin, a, b } = g;
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: /Via!/ }).click();
  // in due giocatori uno dà gli indizi (vede la parola) e l'altro indovina (non la vede)
  await expect(a.page.getByRole("timer")).toBeVisible();
  await expect(b.page.getByRole("timer")).toBeVisible();
  await expect.poll(async () => (await a.page.locator(".rc-word").count()) + (await b.page.locator(".rc-word").count())).toBe(1);
  await expect(screen.page.locator(".rc-timer")).toBeVisible();
  await expect(screen.page.locator(".rc-word")).toHaveCount(0);
  // 10 secondi + tolleranza: il turno finisce da solo
  await expect(screen.page.getByText("Turno finito!").first()).toBeVisible({ timeout: 20_000 });
});

test("reazione a catena: una lista di parole della libreria serve a più round, e le parole già mostrate non tornano nel round dopo", async ({ newGame, request }) => {
  const api = adminApi(request, await adminToken(request));
  const list = await api.call<{ id: string }>("post", "/instances", {
    typeId: "word-list",
    title: unique("Lista"),
    config: { words: ["Alfa", "Beta", "Gamma", "Delta"] },
  });
  const round = (title: string, order: string) => ({
    typeId: "reazione-a-catena",
    title,
    theme: "gameshow",
    config: { wordList: list.id, order, turns: 1, timeSec: 60 },
  });
  const g = await newGame([round("Catena in ordine", "listed"), round("Catena ancora in ordine", "listed")]);
  const { screen, admin } = g;

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await admin.page.getByRole("button", { name: /Via!/ }).click();
  await expect(screen.page.locator(".rc-word")).toHaveText("Alfa");
  await admin.page.getByRole("button", { name: "Chiudi il turno" }).click();
  await admin.page.getByRole("button", { name: "Concludi il round" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();

  await admin.page.getByRole("button", { name: /Avvia round 2/ }).click();
  await admin.page.getByRole("button", { name: /Via!/ }).click();
  await expect(screen.page.locator(".rc-word")).toHaveText("Beta");
});
