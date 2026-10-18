import { expect } from "@playwright/test";
import { type Client, lastPlayerView, test } from "./support";

const config = (extra: Record<string, unknown> = {}) => [
  {
    typeId: "stanze-col-botto",
    title: "Botto e2e",
    theme: "boom",
    config: {
      firstRoomName: "Salotto",
      secondRoomName: "Cucina",
      roomAssignment: "random",
      roundMode: "custom",
      customRounds: [
        { seconds: 300, hostages6to10: 1, hostages11to21: 1, hostages22plus: 1 },
        { seconds: 300, hostages6to10: 1, hostages11to21: 1, hostages22plus: 1 },
        { seconds: 300, hostages6to10: 1, hostages11to21: 1, hostages22plus: 1 },
      ],
      lockSeconds: 30,
      hostageSeconds: 60,
      startAfterFirstSeconds: 30,
      startAfterExchangeSeconds: 60,
      gambleSeconds: 60,
      winPoints: 100,
      ...extra,
    },
  },
];

type Game = Awaited<ReturnType<Parameters<Parameters<typeof test>[2]>[0]["newGame"]>>;

interface Seat {
  client: Client;
  id: string;
  nickname: string;
}

const view = (c: Client) => lastPlayerView(c.traffic)!;
const sheetOf = (c: Client, id: string) => c.page.getByTestId(`scb-player-${id}`);

/** Chi è chi, letto dalle viste che i telefoni hanno davvero ricevuto. */
function seatsOf(clients: Client[]): Seat[] {
  return clients.map((client) => {
    const v = view(client);
    return { client, id: v.me.id as string, nickname: v.rooms.flat().find((p: { id: string }) => p.id === v.me.id)?.nickname ?? "?" };
  });
}

const roomOf = (c: Client) => view(c).me.room as 0 | 1;

async function act(c: Client, targetId: string, action: string) {
  await sheetOf(c, targetId).click();
  await c.page.getByTestId(`scb-action-${action}`).click();
}

/** Avvia il round dal pannello Live e distribuisce le carte (abbinamento a caso). */
async function toDeal(g: Game) {
  await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(g.admin.page.getByTestId("scb-host")).toBeVisible();
  await expect(g.screen.page.getByText("Stanze col botto")).toBeVisible();
  await expect(g.screen.page.getByTestId("scb-room-0")).toBeVisible();
  await g.admin.page.getByTestId("scb-deal").click();
  await expect(g.screen.page.getByText("Carte distribuite!")).toBeVisible();
}

test("stanze col botto: partita completa con voto, nomina, mostra, scambia, ostaggi e rivelazione", async ({ newGame }) => {
  const g = await newGame(config(), { playersPerTeam: 3 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];

  // Abbinamento a caso: le stanze sono già composte e lo schermo le mostra, senza carte.
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByTestId("scb-room-0").locator("li")).toHaveCount(3);
  await expect(screen.page.getByTestId("scb-room-1").locator("li")).toHaveCount(3);
  for (const c of clients) await expect(c.page.getByTestId("scb-joined")).toBeVisible();
  await admin.page.getByTestId("scb-deal").click();

  // Carte distribuite: ognuno sa solo la propria, e la vede tenendo premuto.
  for (const c of clients) await expect(c.page.getByTestId("scb-go")).toBeVisible();
  const seats = seatsOf(clients);
  expect(seats.map((s) => view(s.client).me.card.character).sort()).toEqual(["blue-member", "blue-member", "bomber", "president", "red-member", "red-member"]);
  const president = seats.find((s) => view(s.client).me.card.character === "president")!;
  const bomber = seats.find((s) => view(s.client).me.card.character === "bomber")!;
  await expect(president.client.page.getByTestId("scb-secret")).toHaveCount(0);
  await president.client.page.getByTestId("scb-hold").dispatchEvent("pointerdown");
  await expect(president.client.page.getByTestId("scb-secret")).toContainText("Presidente");
  await president.client.page.getByTestId("scb-hold").dispatchEvent("pointerup");

  // Privacy: né lo schermo né i telefoni degli altri hanno visto un personaggio che non è il proprio.
  expect(screen.traffic.text()).not.toMatch(/"president"|"bomber"|"blue-member"|"red-member"/);
  for (const s of seats) {
    if (s !== president) expect(s.client.traffic.text(), `${s.nickname} non deve ricevere il Presidente`).not.toContain('"president"');
    if (s !== bomber) expect(s.client.traffic.text(), `${s.nickname} non deve ricevere il Bombarolo`).not.toContain('"bomber"');
  }

  await admin.page.getByTestId("scb-start-round").click();
  for (const c of clients) await expect(c.page.locator('.scb-ctrl[data-phase="round"]')).toBeVisible();
  // Con 6 giocatori il solo colore non è ammesso.
  const room0 = seats.filter((s) => roomOf(s.client) === 0);
  const room1 = seats.filter((s) => roomOf(s.client) === 1);
  expect(room0).toHaveLength(3);
  expect(room1).toHaveLength(3);
  await sheetOf(room0[0]!.client, room0[1]!.id).click();
  await expect(room0[0]!.client.page.getByTestId("scb-action-reveal-card")).toBeVisible();
  await expect(room0[0]!.client.page.getByTestId("scb-action-reveal-color")).toHaveCount(0);
  await room0[0]!.client.page.getByRole("button", { name: "Annulla" }).click();

  // Stanza 0: due voti su tre eleggono il leader. Stanza 1: nomina.
  const [a0, b0, c0] = room0 as [Seat, Seat, Seat];
  await act(a0.client, b0.id, "vote");
  await expect(c0.client.page.getByTestId(`scb-player-${b0.id}`)).toContainText("✋1");
  await act(c0.client, b0.id, "vote");
  await expect(b0.client.page.getByTestId("scb-leader-line")).toContainText("Leader: tu");
  await expect(a0.client.page.getByTestId("scb-leader-line")).toContainText(b0.nickname);
  const [a1, b1] = room1 as [Seat, Seat, Seat];
  await expect(a1.client.page.getByTestId("scb-leader-line")).toContainText("Nessun leader");
  await act(a1.client, b1.id, "appoint");
  await expect(b1.client.page.getByTestId("scb-leader-line")).toContainText("Leader: tu");

  // Il leader della propria stanza si vede subito; quello dell'altra e lo schermo no, prima del blocco.
  expect(a1.client.traffic.text()).not.toContain(`"leader":{"id":"${b0.id}"`);
  await expect(screen.page.getByTestId("scb-leader-0")).toHaveCount(0);
  expect(screen.traffic.text()).not.toContain(`"leaders":[{"id":"${b0.id}"`);

  // «Mostra» a senso unico: a0 mostra la carta a c0, che la vede a tutto schermo; a0 non vede nulla in cambio.
  await act(a0.client, c0.id, "reveal-card");
  const mine = view(a0.client).me.card.character as string;
  await expect(c0.client.page.getByTestId("scb-flash")).toContainText(a0.nickname);
  await expect(c0.client.page.getByTestId("scb-flash").getByTestId("scb-card")).toHaveAttribute("data-character", mine);
  await expect(a0.client.page.getByTestId("scb-known-open")).toContainText("(0)");
  await c0.client.page.getByTestId("scb-flash").click();
  await expect(c0.client.page.getByTestId("scb-known-open")).toContainText("(1)");
  // Il terzo della stanza non ha visto niente.
  await expect(b0.client.page.getByTestId("scb-known-open")).toContainText("(0)");
  expect(view(b0.client).me.known, "b0 non riceve la carta di a0").toEqual([]);

  // «Scambia»: rifiutato non rivela nulla, accettato rivela a entrambi.
  await act(b0.client, a0.id, "share-card");
  await expect(a0.client.page.getByTestId("scb-offer")).toContainText(`${b0.nickname} vuole scambiare la carta`);
  await a0.client.page.getByTestId("scb-offer-decline").click();
  await expect(b0.client.page.getByTestId("scb-known-open")).toContainText("(0)");
  await act(b0.client, a0.id, "share-card");
  await a0.client.page.getByTestId("scb-offer-accept").click();
  await expect(a0.client.page.getByTestId("scb-flash")).toBeVisible();
  await expect(b0.client.page.getByTestId("scb-flash")).toBeVisible();
  await a0.client.page.getByTestId("scb-flash").click();
  await b0.client.page.getByTestId("scb-flash").click();
  await expect(a0.client.page.getByTestId("scb-known-open")).toContainText("(1)");
  await expect(b0.client.page.getByTestId("scb-known-open")).toContainText("(1)");

  // Fine del round: i leader si bloccano e compaiono a tutti; la regia ha chiuso il round.
  await admin.page.getByTestId("scb-end-round").click();
  await expect(screen.page.getByTestId("scb-leader-0")).toContainText(b0.nickname);
  await expect(screen.page.getByTestId("scb-leader-1")).toContainText(b1.nickname);
  await expect(a1.client.page.getByTestId("scb-leaders-pub")).toContainText(b0.nickname);

  // Ostaggi: il leader ne sceglie uno, la stanza lo vede, l'altra no; poi conferma.
  const swap = async (leader: Seat, mate: Seat, other: Seat) => {
    await act(leader.client, mate.id, "hostage");
    await expect(leader.client.page.getByTestId("scb-hostage-bar")).toContainText("(1/1)");
    await expect(other.client.page.getByTestId("scb-hostage-seen")).toContainText(mate.nickname);
  };
  await swap(b0, a0, c0);
  await expect(a1.client.page.getByTestId("scb-hostage-seen")).toHaveCount(0);
  expect(screen.traffic.text()).not.toContain('"hostagePicks"');
  await b0.client.page.getByTestId("scb-confirm").click();
  await swap(b1, a1, room1[2]!);
  await b1.client.page.getByTestId("scb-confirm").click();

  // Scambio: gli ostaggi vedono dove andare, lo schermo mostra le frecce, le stanze si aggiornano.
  await expect(a0.client.page.getByTestId("scb-travel")).toContainText("Vai in Cucina");
  await expect(a1.client.page.getByTestId("scb-travel")).toContainText("Vai in Salotto");
  await expect(screen.page.getByTestId("scb-exchange").locator("li")).toHaveCount(2);
  await expect(screen.page.getByTestId("scb-room-0").locator("li")).toHaveCount(3);
  await expect(a0.client.page.getByTestId("scb-room-name")).toHaveText("Cucina");

  // Il round parte quando entrambi i leader premono «Avvia il round».
  await b0.client.page.getByTestId("scb-start").click();
  await expect(screen.page.getByTestId("scb-pressed")).toContainText("Salotto: leader pronto ✓");
  await b1.client.page.getByTestId("scb-start").click();
  for (const c of clients) await expect(c.page.locator('.scb-ctrl[data-phase="round"]')).toBeVisible();
  await expect(screen.page.getByText("Round 2 di 3")).toBeVisible();
  // Il leader resta in carica e lo schermo lo ricorda come quello del round precedente.
  await expect(screen.page.getByTestId("scb-leader-0")).toContainText("Leader al round precedente");

  // Round 2 e 3: la regia chiude il round, i leader scelgono e confermano, poi la regia avvia il prossimo.
  for (const round of [2, 3]) {
    await admin.page.getByTestId("scb-end-round").click();
    await expect(screen.page.getByTestId("scb-hostages")).toBeVisible();
    for (const leader of seats.filter((s) => view(s.client).me.isLeader)) {
      const v = view(leader.client);
      const mate = (v.rooms[v.me.room] as { id: string }[]).find((p) => p.id !== leader.id)!;
      await act(leader.client, mate.id, "hostage");
      await leader.client.page.getByTestId("scb-confirm").click();
    }
    await expect(screen.page.getByTestId("scb-exchange")).toBeVisible();
    await admin.page.getByTestId("scb-start-round").click();
    if (round === 2) await expect(screen.page.getByText("Round 3 di 3")).toBeVisible();
  }

  // Rivelazione: lo schermo mostra il botto (o il mancato botto) coerente con le stanze e tutte le carte.
  await expect(screen.page.getByTestId("scb-outcome")).toBeVisible();
  await expect(screen.page.locator(".scb-cards li")).toHaveCount(6);
  const sameRoom = (await screen.page.locator(".scb-room").evaluateAll((rooms) => rooms.map((r) => r.querySelectorAll("li[data-special='true']").length))).some((n) => n === 2);
  await expect(screen.page.getByTestId("scb-boom")).toHaveAttribute("data-boom", sameRoom ? "yes" : "no");
  await expect(screen.page.getByTestId("scb-outcome")).toContainText(sameRoom ? "ROSSA" : "BLU");
  for (const c of clients) await expect(c.page.getByTestId("scb-end")).toContainText(sameRoom ? "ROSSA" : "BLU");

  // Chiusura: i punti vanno alla squadra vincitrice (3 giocatori da 100).
  await admin.page.getByTestId("scb-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});

test("stanze col botto: abbinamento con i QR, codice a mano, stanza piena e spostamento dalla regia", async ({ newGame }) => {
  const g = await newGame(config({ roomAssignment: "qr" }), { playersPerTeam: 3 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();

  // Lo schermo mostra due QR con i codici; nessuno è ancora abbinato.
  await expect(screen.page.getByTestId("scb-qr-0")).toContainText("Salotto");
  const code0 = (await screen.page.getByTestId("scb-qr-0").locator("code").innerText()).trim();
  const code1 = (await screen.page.getByTestId("scb-qr-1").locator("code").innerText()).trim();
  expect(code0).not.toBe(code1);
  await expect(screen.page.getByTestId("scb-unassigned")).toBeVisible();
  // Il distribuire è bloccato solo se le stanze non si possono bilanciare: qui i non abbinati riempiono la più vuota.
  const joinByCode = async (c: Client, code: string) => {
    await c.page.getByRole("textbox", { name: "Codice della stanza" }).fill(code);
    await c.page.getByRole("button", { name: "Entra" }).click();
  };
  // Il primo entra aprendo il link del QR, gli altri scrivendo il codice.
  const url = new URL(clients[0]!.page.url());
  await clients[0]!.page.goto(`${url.origin}/play?stanza=${code0}`);
  await expect(clients[0]!.page.getByTestId("scb-joined")).toContainText("Salotto");
  expect(clients[0]!.page.url()).not.toContain("stanza=");
  await joinByCode(clients[1]!, code0.toLowerCase());
  await joinByCode(clients[2]!, code0);
  for (const c of clients.slice(0, 3)) await expect(c.page.getByTestId("scb-joined")).toContainText("Salotto");
  // Stanza piena (3 su 6): il quarto è rifiutato e può scegliere l'altra.
  await joinByCode(clients[3]!, code0);
  await expect(clients[3]!.page.getByTestId("scb-full")).toContainText("Salotto è piena");
  await joinByCode(clients[3]!, "ZZZZZ");
  await expect(clients[3]!.page.getByTestId("scb-joined")).toHaveCount(0);
  await joinByCode(clients[3]!, code1);
  await expect(clients[3]!.page.getByTestId("scb-joined")).toContainText("Cucina");
  await expect(screen.page.getByTestId("scb-room-0").locator("li")).toHaveCount(3);
  await expect(screen.page.getByTestId("scb-room-1").locator("li")).toHaveCount(1);
  // La regia sposta un giocatore: dal Salotto alla Cucina.
  await admin.page.getByTestId("scb-host-room-0").getByTitle("Sposta nell'altra stanza").first().click();
  await expect(screen.page.getByTestId("scb-room-1").locator("li")).toHaveCount(2);
  // Distribuzione: i due non abbinati vanno nella stanza più vuota.
  await admin.page.getByTestId("scb-deal").click();
  await expect(screen.page.getByText("Carte distribuite!")).toBeVisible();
  await expect(screen.page.getByTestId("scb-room-0").locator("li")).toHaveCount(3);
  await expect(screen.page.getByTestId("scb-room-1").locator("li")).toHaveCount(3);
  // I codici non compaiono più sullo schermo.
  await expect(screen.page.getByTestId("scb-qr-0")).toHaveCount(0);
});

test("stanze col botto: regia cieca senza segreti sul socket e avviso se si disattiva", async ({ newGame }) => {
  const g = await newGame(config(), { playersPerTeam: 3 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(admin.page.getByTestId("scb-host")).toBeVisible();
  await admin.page.getByTestId("scb-blind").click();
  await expect(admin.page.getByTestId("scb-host")).toHaveAttribute("data-blind", "true");
  // I frame ricevuti prima di attivare la modalità cieca non contano: si guarda solo ciò che arriva dopo.
  const sinceBlind = admin.traffic.text().length;
  await admin.page.getByTestId("scb-deal").click();
  await admin.page.getByTestId("scb-start-round").click();
  for (const c of clients) await expect(c.page.locator('.scb-ctrl[data-phase="round"]')).toBeVisible();

  const seats = seatsOf(clients);
  const room0 = seats.filter((s) => roomOf(s.client) === 0);
  await act(room0[0]!.client, room0[1]!.id, "reveal-card");
  await act(room0[1]!.client, room0[2]!.id, "vote");
  await act(room0[0]!.client, room0[2]!.id, "vote");
  await expect(room0[2]!.client.page.getByTestId("scb-leader-line")).toContainText("Leader: tu");
  const room1 = seats.filter((s) => roomOf(s.client) === 1);
  await act(room1[0]!.client, room1[1]!.id, "appoint");
  await expect(room1[1]!.client.page.getByTestId("scb-leader-line")).toContainText("Leader: tu");

  // La regia cieca conduce senza vedere carte, voti, condivisioni né scelte.
  const traffic = admin.traffic.text().slice(sinceBlind);
  expect(traffic.length, "la regia ha ricevuto aggiornamenti dopo l'attivazione").toBeGreaterThan(1000);
  for (const secret of ["president", "bomber", "blue-member", "red-member", "leaderVotes", "audience", '"shares"', '"cards"']) {
    expect(traffic.includes(secret), `la regia cieca non deve ricevere ${secret}`).toBe(false);
  }
  await expect(admin.page.getByTestId("scb-host-room-0")).not.toContainText(/Presidente|Bombarolo|Squadra/);
  await admin.page.getByTestId("scb-end-round").click();
  await expect(screen.page.getByTestId("scb-hostages")).toBeVisible();
  await act(room0[2]!.client, room0[0]!.id, "hostage");
  await expect(room0[2]!.client.page.getByTestId("scb-hostage-bar")).toContainText("(1/1)");
  await expect(room0[0]!.client.page.getByTestId("scb-hostage-seen")).toBeVisible();
  const after = admin.traffic.text().slice(sinceBlind);
  expect(after.includes('"picks"') || after.includes('"hostagePicks"'), "la regia cieca non vede le scelte degli ostaggi").toBe(false);
  await expect(admin.page.getByTestId("scb-host-room-0")).toContainText("sceglie gli ostaggi");

  // Disattivarla chiede conferma (la accetta il fixture) e lo schermo avvisa.
  await expect(screen.page.getByTestId("scb-host-sees")).toHaveCount(0);
  await admin.page.getByTestId("scb-blind").click();
  await expect(screen.page.getByTestId("scb-host-sees")).toContainText("La regia vede le carte");
  await expect(admin.page.getByTestId("scb-host-room-0")).toContainText(/Presidente|Bombarolo|Squadra/);
});

test("stanze col botto: con più di 10 giocatori il solo colore è ammesso e non svela il personaggio", async ({ newGame }) => {
  const g = await newGame(config(), { playersPerTeam: 6 });
  const { admin } = g;
  const clients = [...g.reds, ...g.blues];
  await toDeal(g);
  await admin.page.getByTestId("scb-start-round").click();
  for (const c of clients) await expect(c.page.locator('.scb-ctrl[data-phase="round"]')).toBeVisible();
  const seats = seatsOf(clients);
  const room0 = seats.filter((s) => roomOf(s.client) === 0);
  const [a, b] = room0 as [Seat, Seat];
  await sheetOf(a.client, b.id).click();
  await expect(a.client.page.getByTestId("scb-action-reveal-color")).toBeVisible();
  await a.client.page.getByTestId("scb-action-reveal-color").click();
  const flash = b.client.page.getByTestId("scb-flash");
  await expect(flash.getByTestId("scb-color")).toBeVisible();
  await expect(flash.getByTestId("scb-card")).toHaveCount(0);
  const known = view(b.client).me.known as { card: object }[];
  expect(known).toHaveLength(1);
  expect(Object.keys(known[0]!.card), "il colore non porta il personaggio").toEqual(["team"]);
});

test("stanze col botto: l'editor della libreria crea l'istanza dal modulo, con il tema boom già scelto", async ({ browser, request }) => {
  const { adminToken, openAdmin, unique } = await import("./support");
  const admin = await openAdmin(browser, await adminToken(request));
  const { page } = admin;
  const title = unique("Botto modulo");
  await page.getByRole("button", { name: "Libreria" }).click();
  await page.getByRole("button", { name: "+ Stanze col botto" }).click();
  await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(title);
  await expect(page.getByLabel("Tema")).toHaveValue("boom");
  await page.getByLabel("Nome della prima stanza").fill("Terrazza");
  await page.getByLabel("Abbinamento alle stanze").selectOption({ label: "Con i QR" });
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText("Salvato.")).toBeVisible();
  const row = page.locator(".library ul.list li", { hasText: title });
  await expect(row).toContainText("Stanze col botto");
  await expect(row).toContainText("Boom");
  await admin.context.close();
});
