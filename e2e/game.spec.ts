import { expect, test } from "@playwright/test";
import { adminApi, adminToken, joinPlayer, openAdmin, openScreen, unique } from "./support";

const SECRET = "SEGRETA-E2E";

test("partita completa: quiz e buzzer, dal telefono alla classifica finale", async ({ browser, request }) => {
  const api = adminApi(request, await adminToken(request));

  // ---- Contenuti (creati via API: l'editor a form ha un suo test) ----
  const rossi = await api.call<{ id: string }>("post", "/teams", { name: unique("Rossi"), color: "#ef4444", emblem: "🔥" });
  const blu = await api.call<{ id: string }>("post", "/teams", { name: unique("Blu"), color: "#3b82f6", emblem: "🌊" });
  const eventName = unique("Serata");
  const event = await api.call<{ id: string }>("post", "/events", { name: eventName });
  await api.call("put", `/events/${event.id}/teams`, { teamIds: [rossi.id, blu.id] });

  const quiz = await api.call<{ id: string }>("post", "/instances", {
    typeId: "quiz-multipla",
    title: "Quiz e2e",
    theme: "pixel",
    config: { questions: [{ text: "Quale lettera è la seconda?", options: ["Alfa", "Beta", "Gamma"], correctIndex: 1, timeSec: 60 }] },
  });
  const buzzer = await api.call<{ id: string }>("post", "/instances", {
    typeId: "buzzer",
    title: "Buzzer e2e",
    theme: "manga",
    config: { questions: [{ text: "Domanda del buzzer?", answer: SECRET }], defaultPoints: 100, wrongPenalty: 50 },
  });
  const matchName = unique("Partita");
  const match = await api.call<{ id: string }>("post", `/events/${event.id}/matches`, { name: matchName, mode: "classic" });
  await api.call("post", `/matches/${match.id}/rounds`, { instanceId: quiz.id });
  await api.call("post", `/matches/${match.id}/rounds`, { instanceId: buzzer.id });

  // ---- Schermo e telefoni ----
  const screen = await openScreen(browser);
  const nickA = unique("Ada");
  const nickB = unique("Bob");
  const a = await joinPlayer(browser, nickA);
  const b = await joinPlayer(browser, nickB);
  await expect(screen.page.locator(".lobby li", { hasText: nickA })).toBeVisible();
  await expect(screen.page.locator(".lobby li", { hasText: nickB })).toBeVisible();

  // La regia assegna i giocatori ai team
  const players = await api.call<{ id: string; nickname: string }[]>("get", "/players");
  const idOf = (nick: string) => players.find((p) => p.nickname === nick)!.id;
  await api.call("put", `/events/${event.id}/players/${idOf(nickA)}`, { teamId: rossi.id });
  await api.call("put", `/events/${event.id}/players/${idOf(nickB)}`, { teamId: blu.id });

  // ---- La regia avvia la partita dal pannello Live ----
  const admin = await openAdmin(browser, await adminToken(request));
  await admin.page.locator("select").first().selectOption({ label: eventName });
  await admin.page.locator("li", { hasText: matchName }).getByRole("button", { name: "Avvia" }).click();
  await expect(screen.page.getByText("Si comincia tra poco!")).toBeVisible();
  await expect(a.page.getByText("Guarda lo schermo")).toBeVisible();

  // ---- Round 1: quiz (tema pixel) ----
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.locator('main.screen[data-theme="pixel"]')).toBeVisible();
  await expect(screen.page.getByText("Quale lettera è la seconda?")).toBeVisible();
  await expect(a.page.locator('main.controller[data-theme="pixel"]')).toBeVisible();
  await expect(a.page.locator(".answer")).toHaveCount(3);

  // Ada risponde (giusto). Finché non rispondono tutti, la risposta corretta non è visibile a nessuno.
  await a.page.getByRole("button", { name: /Beta/ }).click();
  await expect(a.page.getByText("Risposta inviata")).toBeVisible();
  await expect(screen.page.getByText("Hanno risposto 1 / 2")).toBeVisible();
  await expect(screen.page.locator(".option.right")).toHaveCount(0);
  for (const c of [screen, a, b]) expect(c.traffic.text(), "nessuna risposta corretta nel traffico").not.toMatch(/correct/i);

  // Ricarico il telefono di Ada a metà round: lo stato torna da solo (token + risincronizzazione).
  await a.page.reload();
  await expect(a.page.getByText("Risposta inviata")).toBeVisible();
  await expect(a.page.locator(".answer.chosen")).toContainText("Beta");

  // Bob risponde (sbagliato): hanno risposto tutti, la domanda si rivela da sola.
  await b.page.getByRole("button", { name: /Alfa/ }).click();
  await expect(screen.page.locator(".option.right")).toContainText("Beta");
  await expect(a.page.getByText(/\+\d+ punti!/)).toBeVisible();
  await expect(b.page.getByText("Risposta sbagliata")).toBeVisible();

  // La regia chiude il quiz: classifica con Ada prima.
  await admin.page.getByRole("button", { name: "Concludi il quiz" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  const firstPlayer = screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li").first();
  await expect(firstPlayer).toContainText(nickA);
  await expect(a.page.getByText(/1° posto/)).toBeVisible();

  // ---- Round 2: buzzer (tema manga) ----
  await admin.page.getByRole("button", { name: /Avvia round 2/ }).click();
  await expect(screen.page.locator('main.screen[data-theme="manga"]')).toBeVisible();
  await expect(a.page.locator(".buzz-btn")).toBeDisabled(); // non ancora aperto
  await admin.page.getByRole("button", { name: "Apri il buzzer" }).click();
  await expect(a.page.locator(".buzz-btn")).toBeEnabled();
  await expect(screen.page.getByText("PRENOTATEVI!")).toBeVisible();

  await b.page.locator(".buzz-btn").click();
  await expect(screen.page.getByText(`${nickB} risponde!`)).toBeVisible();
  await expect(b.page.getByText("Tocca a te")).toBeVisible();
  await expect(admin.page.getByText(SECRET)).toBeVisible(); // la regia vede la risposta segreta

  await admin.page.getByRole("button", { name: "Risposta corretta" }).click();
  await expect(screen.page.getByText(`${nickB} +100!`)).toBeVisible();
  await expect(b.page.getByText("Hai vinto la domanda")).toBeVisible();

  // ---- Fine partita ----
  await admin.page.getByRole("button", { name: "Concludi" }).first().click(); // chiude la domanda (e il round)
  await expect(screen.page.getByText("Classifica dopo il round 2")).toBeVisible();
  await admin.page.getByRole("button", { name: "Concludi la partita" }).click();
  await expect(screen.page.getByRole("heading", { name: "Classifica finale" })).toBeVisible();
  await expect(a.page.getByText("Partita conclusa")).toBeVisible();
  // Squadre e giocatori compaiono entrambi nella classifica finale
  const finalTeams = screen.page.locator(".lb-table", { hasText: "Squadre" });
  await expect(finalTeams.locator("li")).toHaveCount(2);
  const finalPlayers = screen.page.locator(".lb-table", { hasText: "Giocatori" });
  await expect(finalPlayers.locator("li")).toHaveCount(2);

  // ---- Torna alla lobby: lo schermo rimostra i QR e i giocatori connessi ----
  await admin.page.getByRole("button", { name: "Torna alla lobby" }).click();
  await expect(screen.page.getByRole("heading", { name: "Gioco" })).toBeVisible();
  await expect(screen.page.locator(".lobby li", { hasText: nickA })).toBeVisible();
  await expect(a.page.getByText("Sei in lobby")).toBeVisible();

  // ---- Segreti: la risposta del buzzer non è mai transitata verso schermo e telefoni ----
  for (const c of [screen, a, b]) expect(c.traffic.text()).not.toContain(SECRET);
  expect(admin.traffic.text()).toContain(SECRET); // ma la regia sì (controllo che il test sappia vederla)
});

test("la regia assegna punti a mano e la classifica si aggiorna", async ({ browser, request }) => {
  const api = adminApi(request, await adminToken(request));
  const team = await api.call<{ id: string }>("post", "/teams", { name: unique("Verdi"), color: "#22c55e", emblem: "🌿" });
  const eventName = unique("Serata");
  const event = await api.call<{ id: string }>("post", "/events", { name: eventName });
  await api.call("put", `/events/${event.id}/teams`, { teamIds: [team.id] });
  const quiz = await api.call<{ id: string }>("post", "/instances", {
    typeId: "quiz-multipla",
    title: "Quiz rettifica",
    config: { questions: [{ text: "Domanda?", options: ["Sì", "No"], correctIndex: 0 }] },
  });
  const matchName = unique("Partita");
  const match = await api.call<{ id: string }>("post", `/events/${event.id}/matches`, { name: matchName, mode: "classic" });
  await api.call("post", `/matches/${match.id}/rounds`, { instanceId: quiz.id });

  const nick = unique("Eva");
  const phone = await joinPlayer(browser, nick);
  const players = await api.call<{ id: string; nickname: string }[]>("get", "/players");
  await api.call("put", `/events/${event.id}/players/${players.find((p) => p.nickname === nick)!.id}`, { teamId: team.id });

  const screen = await openScreen(browser);
  const admin = await openAdmin(browser, await adminToken(request));
  await admin.page.locator("select").first().selectOption({ label: eventName });
  await admin.page.locator("li", { hasText: matchName }).getByRole("button", { name: "Avvia" }).click();

  await admin.page.getByRole("combobox").filter({ hasText: "Assegna punti a…" }).selectOption({ label: `🦊 ${nick}` });
  await admin.page.locator('input[type="number"]').fill("250");
  await admin.page.getByPlaceholder("Motivo").fill("Bonus simpatia");
  await admin.page.getByRole("button", { name: "Assegna" }).click();

  await expect(screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li").first()).toContainText("250");
  await expect(phone.page.getByText("250 punti")).toBeVisible();

  // Pulizia: la partita si termina e si torna alla lobby (il server è condiviso con gli altri test).
  await admin.page.getByRole("button", { name: "Termina la partita" }).click();
  await admin.page.getByRole("button", { name: "Torna alla lobby" }).click();
  await expect(screen.page.getByRole("heading", { name: "Gioco" })).toBeVisible();
});
