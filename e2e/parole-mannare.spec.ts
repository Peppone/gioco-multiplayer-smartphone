import { expect, type Locator } from "@playwright/test";
import { type Client, lastPlayerView, test } from "./support";

const WORDS = ["Zanzibar", "Quokka", "Pergamena"];

const round = (extra: Record<string, unknown> = {}) => [
  {
    typeId: "parole-mannare",
    title: "Parole e2e",
    theme: "manga",
    config: {
      words: WORDS.map((text) => ({ text, difficulty: "media" })),
      difficulty: "media",
      wordChoices: 3,
      wordPickSeconds: 120,
      nightSeconds: 120,
      questionSeconds: 240,
      correctGraceSeconds: 4,
      seerHuntSeconds: 120,
      voteSeconds: 120,
      runoffSeconds: 120,
      winPoints: 100,
      ...extra,
    },
  },
];

/** Trascina con il mouse (Pointer Events) da un elemento a un altro, a piccoli passi come un dito. */
async function drag(from: Locator, to: Locator) {
  const page = from.page();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 15, a.y + a.height / 2 + 15, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

interface Seat {
  client: Client;
  id: string;
  nickname: string;
  role: string;
  isMayor: boolean;
}

const view = (c: Client) => lastPlayerView(c.traffic)!;

/** Chi è chi, letto dalle viste che i telefoni hanno davvero ricevuto. */
async function seats(clients: Client[]): Promise<Seat[]> {
  for (const c of clients) await expect(c.page.locator(".pm-ctrl")).toBeVisible();
  return clients.map((client) => {
    const v = view(client);
    const nickname = v.players.find((p: { id: string }) => p.id === v.me.id).nickname as string;
    return { client, id: v.me.id as string, nickname, role: v.me.role as string, isMayor: v.me.isMayor as boolean };
  });
}

/** Porta la partita alle domande: distribuzione, scelta della parola, notte. */
async function toQuestions(g: Awaited<ReturnType<Parameters<Parameters<typeof test>[2]>[0]["newGame"]>>) {
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText("Parole Mannare")).toBeVisible();
  await expect(screen.page.getByText(/Il Sindaco è/)).toBeVisible();
  // La regia vede parola (le proposte) e ruoli; lo schermo e i telefoni, per ora, nulla di tutto ciò.
  await expect(admin.page.getByText("Ruoli (segreto)")).toBeVisible();
  await admin.page.getByRole("button", { name: "Distribuisci i ruoli" }).click();

  const mayor = clients[(await Promise.all(clients.map((c) => c.page.getByTestId("pm-words").count()))).findIndex((n) => n > 0)]!;
  await expect(mayor.page.getByTestId("pm-words").locator("button")).toHaveCount(3);
  for (const c of clients) if (c !== mayor) await expect(c.page.getByText("Il Sindaco sta scegliendo la parola…")).toBeVisible();
  await mayor.page.getByTestId("pm-words").locator("button").first().click();

  // Notte: ognuno vede il proprio ruolo solo tenendo premuto, poi «Ho visto».
  for (const c of clients) await expect(c.page.getByText("È notte: guarda il tuo ruolo")).toBeVisible();
  await expect(screen.page.getByText("È notte…")).toBeVisible();
  const all = await seats(clients);
  const wolf = all.find((s) => s.role === "werewolf")!;
  const hold = wolf.client.page.getByTestId("pm-hold");
  await expect(wolf.client.page.getByTestId("pm-secret")).toHaveCount(0);
  await hold.dispatchEvent("pointerdown");
  await expect(wolf.client.page.getByTestId("pm-secret")).toContainText("Lupo");
  await expect(wolf.client.page.getByTestId("pm-secret")).toContainText("Parola:");
  await hold.dispatchEvent("pointerup");
  for (const c of clients) await c.page.getByRole("button", { name: "Ho visto" }).click();
  for (const s of all) await expect(s.client.page.locator('.pm-ctrl[data-phase="questions"]')).toBeVisible();
  await expect(screen.page.locator(".pm-board-row")).toHaveCount(4);
  return all;
}

test("parole mannare: gettoni trascinati, avvisi, annulla, Esatto e caccia al Veggente", async ({ newGame }) => {
  const g = await newGame(round(), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  const all = await toQuestions(g);
  const mayor = all.find((s) => s.isMayor)!;
  const others = all.filter((s) => !s.isMayor);
  const [p, q, r] = others as [Seat, Seat, Seat];
  const m = mayor.client.page;
  const word = view(mayor.client).me.word as string;
  expect(WORDS).toContain(word);

  // Privacy fin qui: lo schermo non ha mai ricevuto parola, proposte, ruoli o amici dei Lupi.
  const screenTraffic = () => screen.traffic.text();
  for (const w of WORDS) expect(screenTraffic()).not.toContain(w);
  expect(screenTraffic()).not.toMatch(/"role"|"roles"|"mates"|"wordOptions"|"votes"/);
  // I giocatori che non conoscono la parola non l'hanno mai ricevuta.
  for (const s of all) {
    const knows = s.isMayor || s.role !== "villager";
    if (!knows) for (const w of WORDS) expect(JSON.stringify(s.client.traffic.text())).not.toContain(w);
    if (s.role !== "werewolf") expect(view(s.client).me.mates).toEqual([]);
  }

  // Il Sindaco trascina un nome su un gettone: «Sì» a p.
  const name = (s: Seat) => m.locator(`[data-dd="player:${s.id}"]`);
  const token = (t: string) => m.locator(`[data-dd="token:${t}"]`);
  await expect(m.locator(".pm-name-chip")).toHaveCount(3);
  await drag(name(p), token("yes"));
  // I telefoni mostrano a tutti a chi è andato il gettone; chi lo riceve vede «a te».
  await expect(p.client.page.getByTestId("pm-notice")).toContainText("a te");
  await expect(p.client.page.getByTestId("pm-notice")).toHaveAttribute("data-mine", "true");
  await expect(q.client.page.getByTestId("pm-notice")).toContainText(`Sì → ${p.nickname}`);
  await expect(q.client.page.getByTestId("pm-notice")).toHaveAttribute("data-mine", "false");
  await expect(m.getByTestId("pm-notice")).toHaveCount(0); // il Sindaco ha già la conferma sul pulsante Annulla
  await expect(m.getByTestId("pm-undo")).toContainText(`Sì a ${p.nickname}`);
  // La TV aggiorna conteggi, riserva e evidenzia la riga.
  await expect(screen.page.locator(`[data-player="${p.id}"]`)).toContainText("✅ 1");
  await expect(screen.page.locator(`[data-player="${p.id}"]`)).toHaveAttribute("data-flash", "given");
  await expect(screen.page.getByTestId("pm-reserves")).toContainText("Sì/No: 35");

  // Un gettone su un nome (direzione opposta): «No» a q.
  await drag(token("no"), name(q));
  await expect(screen.page.locator(`[data-player="${q.id}"]`)).toContainText("❌ 1");
  await expect(screen.page.getByTestId("pm-reserves")).toContainText("Sì/No: 34");

  // Tocco-tocco: «Ci sei quasi» a r; il gettone è unico e poi risulta esaurito.
  await name(r).click();
  await expect(name(r)).toHaveAttribute("data-selected", "true");
  await token("close").click();
  await expect(screen.page.locator(`[data-player="${r.id}"]`)).toContainText("🟡");
  await expect(token("close")).toHaveAttribute("data-disabled", "true");
  await expect(screen.page.getByTestId("pm-reserves")).toContainText("🟡 usato");
  // Un rilascio su un gettone esaurito non fa nulla.
  await drag(name(p), token("close"));
  await expect(screen.page.locator(`[data-player="${p.id}"]`)).not.toContainText("🟡");

  // Annulla: l'ultima voce («Ci sei quasi» a r) torna disponibile e tutti vedono «Annullato».
  await m.getByTestId("pm-undo").click();
  await expect(token("close")).toHaveAttribute("data-disabled", "false");
  await expect(screen.page.locator(`[data-player="${r.id}"]`)).not.toContainText("🟡");
  await expect(r.client.page.getByTestId("pm-notice")).toContainText("Annullato");
  await expect(q.client.page.getByTestId("pm-notice")).toHaveAttribute("data-kind", "undone");
  // Annullando ancora (più volte di seguito) si torna indietro: via «No» a q, poi «Sì» a p.
  await m.getByTestId("pm-undo").click();
  await expect(screen.page.locator(`[data-player="${q.id}"]`)).not.toContainText("❌");
  await m.getByTestId("pm-undo").click();
  await expect(screen.page.locator(`[data-player="${p.id}"]`)).not.toContainText("✅");
  await expect(screen.page.getByTestId("pm-reserves")).toContainText("Sì/No: 36");
  await expect(m.getByTestId("pm-undo")).toBeDisabled();

  // «Esatto» chiede conferma; annullato nella finestra riprende le domande.
  await drag(name(q), token("correct"));
  await expect(m.getByTestId("pm-confirm")).toContainText(`${q.nickname} ha indovinato?`);
  await m.getByTestId("pm-confirm").getByRole("button", { name: "No" }).click();
  await expect(m.getByTestId("pm-confirm")).toHaveCount(0);
  await expect(screen.page.getByText("Parola indovinata!")).toHaveCount(0);
  await drag(name(q), token("correct"));
  await m.getByTestId("pm-confirm").getByRole("button", { name: "Sì" }).click();
  await expect(screen.page.getByText("Parola indovinata!")).toBeVisible();
  await expect(screen.page.getByText(`${q.nickname} ha indovinato`)).toBeVisible();
  await m.getByTestId("pm-undo").click();
  await expect(screen.page.locator('.pm-screen[data-phase="questions"]')).toBeVisible();
  // …e poi confermato davvero: scade la finestra e i Lupi si rivelano.
  await drag(name(q), token("correct"));
  await m.getByTestId("pm-confirm").getByRole("button", { name: "Sì" }).click();
  await expect(screen.page.getByText("I Lupi si rivelano!")).toBeVisible({ timeout: 15_000 });
  const wolf = all.find((s) => s.role === "werewolf")!;
  const seer = all.find((s) => s.role === "seer")!;
  await expect(screen.page.getByText(wolf.nickname).first()).toBeVisible();
  // Nessuno può più annullare dal telefono: la finestra è chiusa.
  expect(await m.getByTestId("pm-undo").count()).toBe(0);

  // Caccia al Veggente: votano solo i Lupi, gli altri aspettano.
  for (const s of all) {
    if (s.role === "werewolf") await expect(s.client.page.getByTestId("pm-vote")).toBeVisible();
    else await expect(s.client.page.getByText("I Lupi cercano il Veggente…")).toBeVisible();
  }
  // Nel frattempo la parola non è ancora pubblica.
  for (const w of WORDS) expect(screenTraffic()).not.toContain(w);
  // Il Lupo non può scegliere un altro Lupo né se stesso: vede solo i non-Lupi.
  await expect(wolf.client.page.getByTestId("pm-vote").locator("button")).toHaveCount(3);
  await expect(wolf.client.page.getByTestId("pm-vote").getByRole("button", { name: wolf.nickname, exact: true })).toHaveCount(0);
  await wolf.client.page.getByTestId("pm-vote").getByRole("button", { name: seer.nickname, exact: true }).click();

  // Il Lupo ha indicato il Veggente: vincono i Lupi. Rivelazione con ruoli e parola.
  await expect(screen.page.getByRole("heading", { name: /Vincono i LUPI/ })).toBeVisible();
  await expect(screen.page.locator(".pm-role-row")).toHaveCount(4);
  await expect(screen.page.locator('.pm-role-row[data-role="werewolf"]')).toContainText(wolf.nickname);
  await expect(screen.page.getByText(word, { exact: false }).first()).toBeVisible();
  for (const s of all) await expect(s.client.page.getByText("I Lupi hanno trovato il Veggente")).toBeVisible();

  // «Avanti» chiude il round: la classifica premia i Lupi.
  await admin.page.getByRole("button", { name: "Avanti" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  void clients;
});

test("parole mannare: voto sul Lupo in pareggio, ballottaggio e regole in app", async ({ newGame }) => {
  const g = await newGame(round(), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const all = await toQuestions(g);
  const word = view(all.find((s) => s.isMayor)!.client).me.word as string;

  // Le regole in app riportano i numeri di questa partita e la parte del proprio ruolo.
  const mayor = all.find((s) => s.isMayor)!;
  const dialog = mayor.client.page.getByRole("dialog", { name: "Regole del gioco" });
  await mayor.client.page.getByTestId("pm-rules").click();
  await expect(dialog).toContainText("Sei il SINDACO");
  await expect(dialog).toContainText("4 giocatori");
  await expect(dialog).toContainText("1 Lupo e");
  await expect(dialog).toContainText("4 minuti");
  await expect(dialog).toContainText("riserva comune di 36");
  await expect(dialog.getByRole("button", { name: "Ho capito" })).toBeInViewport();
  await dialog.getByRole("button", { name: "Ho capito" }).click();

  // La regia chiude le domande: la parola diventa pubblica e tutti votano.
  await admin.page.getByRole("button", { name: "Chiudi le domande" }).click();
  await expect(screen.page.getByText("Chi è il Lupo?")).toBeVisible();
  await expect(screen.page.getByText(word).first()).toBeVisible();
  for (const s of all) await expect(s.client.page.getByTestId("pm-vote")).toBeVisible();
  // Nessun voto in chiaro sullo schermo: solo quanti hanno votato.
  const vote = async (from: Seat, to: Seat) => from.client.page.getByTestId("pm-vote").getByRole("button", { name: to.nickname, exact: true }).click();
  const [a, b, c, d] = all as [Seat, Seat, Seat, Seat];
  await vote(a, b);
  await expect(screen.page.getByTestId("pm-voted")).toContainText("1 su 4");
  // Chi vota non può votare se stesso.
  await expect(a.client.page.getByTestId("pm-vote").getByRole("button", { name: a.nickname, exact: true })).toHaveCount(0);
  await vote(b, a);
  await vote(c, a);
  await vote(d, b);

  // 2 a 2: ballottaggio solo tra a e b, con tutti i giocatori a votare.
  await expect(screen.page.getByRole("heading", { name: "Ballottaggio!" })).toBeVisible();
  await expect(screen.page.getByTestId("pm-runoff").locator("li")).toHaveCount(2);
  await expect(screen.page.getByTestId("pm-runoff")).toContainText(a.nickname);
  await expect(screen.page.getByTestId("pm-runoff")).toContainText(b.nickname);
  await expect(screen.page.getByTestId("pm-voted")).toContainText("0 su 4");
  await expect(c.client.page.getByTestId("pm-vote").locator("button")).toHaveCount(2);
  await expect(c.client.page.getByTestId("pm-vote")).toContainText("Ballottaggio");

  // Ancora pari: il villaggio non ha deciso e vincono i Lupi.
  await vote(a, b);
  await vote(b, a);
  await vote(c, a);
  await vote(d, b);
  await expect(screen.page.getByRole("heading", { name: /Vincono i LUPI/ })).toBeVisible();
  await expect(screen.page.getByText("Il villaggio non ha deciso")).toBeVisible();
  await expect(screen.page.locator(".pm-role-row")).toHaveCount(4);

  await admin.page.getByRole("button", { name: "Avanti" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});
