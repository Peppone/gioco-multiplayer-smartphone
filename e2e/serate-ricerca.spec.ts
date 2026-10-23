import { expect, test as plain } from "@playwright/test";
import { adminApi, adminToken, joinPlayer, openAdmin, unique } from "./support";

// Elenco delle serate: ricerca per nome (anche della partita), filtri per tipo, gruppi, avvio diretto dal pannello Live.

const QUIZ = { questions: [{ text: "Quale lettera è la seconda?", options: ["Alfa", "Beta", "Gamma"], correctIndex: 1, timeSec: 60 }] };

async function setup(request: Parameters<typeof adminToken>[0]) {
  const token = await adminToken(request);
  const api = adminApi(request, token);
  const quiz = await api.call<{ id: string }>("post", "/instances", { typeId: "quiz-multipla", title: unique("Quiz serate"), config: QUIZ });
  const tag = unique("Zz");
  const make = async (name: string, status: "draft" | "live" | "closed", matchName?: string, withRound = true) => {
    const ev = await api.call<{ id: string }>("post", "/events", { name });
    if (status !== "draft") await api.call("patch", `/events/${ev.id}`, { status });
    let matchId: string | undefined;
    if (matchName) {
      matchId = (await api.call<{ id: string }>("post", `/events/${ev.id}/matches`, { name: matchName })).id;
      if (withRound) await api.call("post", `/matches/${matchId}/rounds`, { instanceId: quiz.id });
    }
    return { id: ev.id, name, matchId, matchName };
  };
  return { api, token, tag, make };
}

plain("serate: la ricerca trova per nome della serata o della partita, ignora maiuscole e accenti", async ({ browser, request }) => {
  const { token, tag, make } = await setup(request);
  const natale = await make(`${tag} Cena di Natale`, "closed", `${tag} Tombola`);
  const venerdi = await make(`${tag} Torneo del venerdì`, "live", `${tag} Semifinale`);
  const bozza = await make(`${tag} Compleanno`, "draft");

  const admin = await openAdmin(browser, token);
  const { page } = admin;
  await page.getByRole("button", { name: "Serate", exact: true }).click();
  const search = page.getByLabel("Cerca una serata o una partita");
  const card = (name: string) => page.locator(".event-card", { hasText: name });

  await search.fill(tag);
  await expect(card(natale.name)).toBeVisible();
  await expect(card(venerdi.name)).toBeVisible();
  await expect(card(bozza.name)).toBeVisible();

  await search.fill(`${tag} VENERDI`); // senza accento e in maiuscolo
  await expect(card(venerdi.name)).toBeVisible();
  await expect(card(natale.name)).toHaveCount(0);
  await expect(card(bozza.name)).toHaveCount(0);

  await search.fill(`${tag} tombola`); // nome della partita
  await expect(card(natale.name)).toBeVisible();
  await expect(card(venerdi.name)).toHaveCount(0);

  await search.fill(`${tag} nessuna-corrispondenza`);
  await expect(page.getByText("Nessuna serata corrisponde alla ricerca.")).toBeVisible();

  await search.fill("");
  await expect(page.getByText("Nessuna serata corrisponde alla ricerca.")).toHaveCount(0);
});

plain("serate: i pulsanti filtrano per tipo e mostrano quante serate ci sono di ogni tipo", async ({ browser, request }) => {
  const { token, tag, make } = await setup(request);
  await make(`${tag} Chiusa`, "closed", `${tag} Partita C`);
  await make(`${tag} Attiva`, "live", `${tag} Partita A`);
  await make(`${tag} Bozza`, "draft");

  const admin = await openAdmin(browser, token);
  const { page } = admin;
  await page.getByRole("button", { name: "Serate", exact: true }).click();
  await page.getByLabel("Cerca una serata o una partita").fill(tag);
  const filters = page.getByRole("group", { name: "Tipo di serata" });
  const card = (name: string) => page.locator(".event-card", { hasText: name });

  // I conteggi seguono la ricerca; senza serate «in corso» il pulsante è spento.
  await expect(filters.getByRole("button", { name: /^Tutte\s*3$/ })).toBeVisible();
  await expect(filters.getByRole("button", { name: /^Attive\s*1$/ })).toBeEnabled();
  await expect(filters.getByRole("button", { name: /^Bozze\s*1$/ })).toBeEnabled();
  await expect(filters.getByRole("button", { name: /^Chiuse\s*1$/ })).toBeEnabled();
  await expect(filters.getByRole("button", { name: /^In corso\s*0$/ })).toBeDisabled();

  // Con una ricerca in atto le serate stanno sotto il titolo del loro gruppo.
  await expect(page.getByRole("heading", { name: "Attive (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chiuse (1)" })).toBeVisible();

  await filters.getByRole("button", { name: /^Attive/ }).click();
  await expect(filters.getByRole("button", { name: /^Attive/ })).toHaveAttribute("aria-pressed", "true");
  await expect(card(`${tag} Attiva`)).toBeVisible();
  await expect(card(`${tag} Bozza`)).toHaveCount(0);
  await expect(card(`${tag} Chiusa`)).toHaveCount(0);

  // Un secondo clic toglie il filtro.
  await filters.getByRole("button", { name: /^Attive/ }).click();
  await expect(card(`${tag} Bozza`)).toBeVisible();
});

plain("serate: senza ricerca le chiuse restano ripiegate in fondo, e si aprono con un clic", async ({ browser, request }) => {
  const { token, tag, make } = await setup(request);
  const closed = await make(`${tag} Vecchia serata`, "closed", `${tag} Finale`);
  await make(`${tag} Serata nuova`, "draft");

  const admin = await openAdmin(browser, token);
  const { page } = admin;
  await page.getByRole("button", { name: "Serate", exact: true }).click();

  const details = page.locator("details.event-group", { hasText: "Chiuse" });
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute("open", "");
  await expect(page.locator(".event-card", { hasText: closed.name })).toBeHidden();
  await details.locator("summary").click();
  await expect(page.locator(".event-card", { hasText: closed.name })).toBeVisible();

  // Cercandola, la serata chiusa compare senza dover aprire nulla.
  await page.getByLabel("Cerca una serata o una partita").fill(closed.name);
  await expect(page.locator("details.event-group")).toHaveCount(0);
  await expect(page.locator(".event-card", { hasText: closed.name })).toBeVisible();
});

plain("serate: l'elenco mostra partite e giocatori di ogni serata, e Apri porta alla serata", async ({ browser, request }) => {
  const { token, tag, make } = await setup(request);
  const ev = await make(`${tag} Serata con partita`, "draft", `${tag} Partita uno`);

  const admin = await openAdmin(browser, token);
  const { page } = admin;
  await page.getByRole("button", { name: "Serate", exact: true }).click();
  await page.getByLabel("Cerca una serata o una partita").fill(ev.name);
  const card = page.locator(".event-card", { hasText: ev.name });
  await expect(card).toContainText("1 partita");
  await expect(card).toContainText("0 giocatori");
  await expect(card).toContainText(ev.matchName!);
  await expect(card.locator(".badge")).toHaveText("Bozza");
  await card.getByRole("button", { name: "Apri" }).click();
  await expect(page.getByRole("heading", { name: ev.name })).toBeVisible();
});

plain("pannello Live: si cerca la serata e si avvia la partita dall'elenco, senza menu a tendina", async ({ browser, request }) => {
  const { api, token, tag, make } = await setup(request);
  const a = await make(`${tag} Alfa`, "draft", `${tag} Partita alfa`);
  const b = await make(`${tag} Beta`, "live", `${tag} Partita beta`);
  const vuota = await make(`${tag} Gamma`, "draft", `${tag} Senza round`, false);

  // La serata da avviare ha un giocatore (senza, l'avvio è rifiutato).
  const nick = unique("Eva");
  await joinPlayer(browser, nick);
  const eva = (await api.call<{ id: string; nickname: string }[]>("get", "/players")).find((p) => p.nickname === nick)!;
  await api.call("put", `/events/${a.id}/players/${eva.id}`, { teamId: null });

  const admin = await openAdmin(browser, token);
  const { page } = admin;
  await expect(page.getByRole("heading", { name: "Avvia una partita" })).toBeVisible();
  await expect(page.locator(".panel select")).toHaveCount(0); // niente più menu a tendina per scegliere la serata

  const search = page.getByLabel("Cerca una serata o una partita");
  await search.fill(tag);
  // Le attive stanno sopra le bozze.
  await expect(page.locator(".event-card")).toHaveCount(3);
  const names = await page.locator(".event-card .event-title strong").allInnerTexts();
  expect(names.indexOf(b.name)).toBeLessThan(names.indexOf(a.name));

  // Una partita senza round non si può avviare.
  const empty = page.locator(".event-card", { hasText: vuota.name }).locator(".match-row", { hasText: vuota.matchName! });
  await expect(empty.getByRole("button", { name: "Avvia" })).toBeDisabled();
  await expect(empty).toContainText("0 round");

  // Si cerca per nome della partita e la si avvia con un clic: la serata diventa attiva e la partita «in corso».
  await search.fill(`${tag} partita alfa`);
  await expect(page.locator(".event-card")).toHaveCount(1);
  await expect(page.locator(".event-card .badge")).toHaveText("Bozza");
  await page.locator(".match-row", { hasText: a.matchName! }).getByRole("button", { name: "Avvia" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(a.matchName!) })).toBeVisible();
  await expect(page.getByRole("button", { name: /Avvia round 1/ })).toBeVisible();

  const events = await api.call<{ id: string; status: string; matches: { status: string }[] }[]>("get", "/events");
  expect(events.find((e) => e.id === a.id)).toMatchObject({ status: "live", matches: [{ status: "running" }] });

  // Pulizia: la partita si conclude e si torna alla lobby (il server è condiviso con gli altri test).
  await page.getByRole("button", { name: "Termina la partita" }).click();
  await page.getByRole("button", { name: "Torna alla lobby" }).click();
  await expect(page.getByRole("heading", { name: "Avvia una partita" })).toBeVisible();

  // Tornata la scelta, la partita giocata risulta conclusa e non si riavvia.
  await page.getByLabel("Cerca una serata o una partita").fill(a.name);
  await expect(page.locator(".match-row", { hasText: a.matchName! })).toContainText("conclusa");
  await expect(page.locator(".match-row", { hasText: a.matchName! }).getByRole("button", { name: "Avvia" })).toBeDisabled();
});
