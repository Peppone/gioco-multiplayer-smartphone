import { type Page, expect } from "@playwright/test";
import { clueProblem } from "../packages/minigames/src/agenti-segreti/clue";
import { type Client, lastPlayerView, test } from "./support";

type Game = Awaited<ReturnType<Parameters<Parameters<typeof test>[2]>[0]["newGame"]>>;
type Side = "red" | "blue";
type Kind = Side | "civilian" | "assassin";

const config = (extra: Record<string, unknown> = {}) => [
  {
    typeId: "agenti-segreti",
    title: "Agenti e2e",
    theme: "retro80",
    config: { gridSize: "5x5", assassins: 1, clueSeconds: 0, guessSeconds: 0, maxTurns: 0, allowZeroInfinity: true, points: { win: 100, perAgent: 0 }, ...extra },
  },
];

const view = (c: Client) => lastPlayerView(c.traffic)!;

/** Tutte le viste del minigioco (oggetti con `phase` e `cards`) arrivate a una pagina con un certo evento. */
function viewsIn(c: Client, event: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, any>;
    if (typeof o.phase === "string" && Array.isArray(o.cards)) out.push(o);
    for (const v of Object.values(o)) walk(v);
  };
  for (const line of c.traffic.text().split("\n")) if (line.startsWith(`42["${event}"`)) walk(JSON.parse(line.slice(2))[1]);
  return out;
}

/** Nessuna carta coperta con il suo tipo (`kind`) e nessuna mappa, fino alla rivelazione finale. */
function expectNoSecrets(c: Client, event: string, who: string) {
  const views = viewsIn(c, event);
  expect(views.length, `${who}: viste ricevute`).toBeGreaterThan(0);
  for (const v of views) {
    if (v.phase === "reveal" || v.phase === "done") continue;
    expect(v.cards.filter((card: Record<string, unknown>) => !card.revealed && "kind" in card), `${who}: colori delle carte coperte in ${v.phase}`).toEqual([]);
    expect(v.me && "map" in v.me, `${who}: mappa in ${v.phase}`).toBeFalsy();
  }
}

/** Una parola che il controllo automatico accetta con questa griglia (nessuna parte in comune con le carte coperte). */
function validClue(words: string[], skip: string[] = []): string {
  const candidates = ["Quokka", "Ornitorinco", "Mirtillo", "Gazzella", "Uragan", "Bisonte", "Scoiattolo", "Lucciola", "Vortice", "Zampogna"];
  return candidates.find((w) => !skip.includes(w) && clueProblem(w, words) === null)!;
}

interface Table {
  spy: Record<Side, Client>;
  agents: Record<Side, Client[]>;
  map: Kind[];
  words: string[];
  starting: Side;
}

/** Chi è chi, letto dalle viste che i telefoni hanno davvero ricevuto (la mappa dal telefono di un Capo-spia). */
async function tableOf(clients: Client[]): Promise<Table> {
  await expect.poll(() => clients.every((c) => view(c)?.phase === "clue")).toBe(true);
  const spy = {} as Record<Side, Client>;
  const agents: Record<Side, Client[]> = { red: [], blue: [] };
  for (const c of clients) {
    const me = view(c).me;
    if (me.role === "spymaster") spy[me.side as Side] = c;
    else agents[me.side as Side].push(c);
  }
  const v = view(spy.red);
  return { spy, agents, map: v.me.map, words: v.cards.map((card: { word: string }) => card.word), starting: v.starting };
}

const other = (s: Side): Side => (s === "red" ? "blue" : "red");
const covered = (t: Table, c: Client) => view(c).cards.map((card: { revealed: boolean }, i: number) => (card.revealed ? null : i)).filter((i: number | null) => i !== null) as number[];
const firstOf = (t: Table, c: Client, kind: Kind, skip: number[] = []) => covered(t, c).find((i) => t.map[i] === kind && !skip.includes(i))!;
const cardButton = (p: Page, word: string) => p.locator("button.as-card", { has: p.locator(".as-word", { hasText: new RegExp(`^${word}$`) }) });

async function giveClue(c: Client, word: string, count: string) {
  await c.page.getByTestId("as-clue-input").fill(word);
  await c.page.getByRole("group", { name: "Quante carte" }).getByRole("button", { name: count, exact: true }).click();
  await c.page.getByTestId("as-clue-send").click();
}

/** Ogni agente tocca la sua carta (o «Passa») e conferma. */
async function vote(t: Table, side: Side, picks: (number | "pass")[]) {
  const agents = t.agents[side];
  for (let k = 0; k < agents.length; k++) {
    const p = agents[k]!.page;
    const pick = picks[k] ?? picks[0]!;
    if (pick === "pass") await p.getByTestId("as-pass").click();
    else await cardButton(p, t.words[pick]!).click();
    await expect(p.locator(pick === "pass" ? '[data-testid="as-pass"][data-mine]' : "button.as-card[data-mine]")).toHaveCount(1);
  }
  for (const c of agents) await c.page.getByTestId("as-confirm").click();
}

async function startRound(g: Game) {
  await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(g.admin.page.getByTestId("as-host")).toBeVisible();
  await expect(g.screen.page.getByTestId("as-setup")).toBeVisible();
}

test("agenti segreti: squadre e Capi-spia dalla regia, indizi, voto pari, Passa, annulla e assassino, senza far trapelare la mappa", async ({ newGame }) => {
  test.slow();
  const g = await newGame(config(), { playersPerTeam: 3 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await startRound(g);

  // Le squadre vengono dai team della serata (3 + 3): sulla TV ci sono i Capi-spia, la griglia no.
  await expect(screen.page.getByTestId("as-setup").locator("section")).toHaveCount(2);
  await expect(screen.page.getByTestId("as-grid")).toHaveCount(0);
  for (const c of clients) await expect(c.page.getByTestId("as-role")).toBeVisible();

  // La regia sposta un giocatore nell'altra squadra e uno indietro, poi cambia il Capo-spia dei Rossi.
  const host = admin.page.getByTestId("as-host");
  const redTeam = host.getByTestId("as-host-team-red");
  const blueTeam = host.getByTestId("as-host-team-blue");
  const redName = (await redTeam.locator("h3").innerText()).split(" (")[0]!;
  const blueName = (await blueTeam.locator("h3").innerText()).split(" (")[0]!;
  await redTeam.getByRole("button", { name: new RegExp(`^Sposta .* nei ${blueName}$`) }).first().click();
  await expect(redTeam.locator("li")).toHaveCount(2);
  await expect(blueTeam.locator("li")).toHaveCount(4);
  await expect(redTeam.getByRole("button", { name: /^Sposta/ }).first()).toBeDisabled(); // non sotto i 2
  await blueTeam.getByRole("button", { name: new RegExp(`^Sposta .* nei ${redName}$`) }).last().click();
  await expect(redTeam.locator("li")).toHaveCount(3);
  const newSpy = redTeam.getByRole("button", { name: / Capo-spia$/ }).first();
  const newSpyName = (await newSpy.getAttribute("aria-label"))!.replace(/ Capo-spia$/, "");
  await newSpy.click();
  await expect(redTeam.locator("li", { hasText: "Capo-spia" })).toContainText(newSpyName);
  await expect(screen.page.getByTestId("as-setup").locator("section").first()).toContainText(`Capo-spia: ${newSpyName}`);

  await host.getByTestId("as-deal").click();
  const t = await tableOf(clients);
  expect(t.map).toHaveLength(25);
  expect(view(t.spy.red).teams.red.spymaster.nickname).toBe(newSpyName);
  const s = t.starting;
  const o = other(s);
  await expect(screen.page.getByTestId("as-grid").locator(".as-card")).toHaveCount(25);
  await expect(screen.page.getByTestId("as-thinking")).toBeVisible();

  // Indizio rifiutato dal controllo automatico (una parola della griglia), poi uno valido.
  await giveClue(t.spy[s], t.words[0]!, "1");
  await expect(t.spy[s].page.getByTestId("as-clue-error")).toContainText("è una parola della griglia");
  for (const c of [...t.agents[s], t.spy[o]]) await expect(c.page.getByTestId("as-clue-error")).toHaveCount(0);
  const clue1 = validClue(t.words);
  await giveClue(t.spy[s], clue1, "2");
  await expect(screen.page.getByTestId("as-clue")).toContainText(`«${clue1}»`);

  // Voto pari (un agente su una carta, l'altro su un'altra): niente scoperte, il turno passa.
  await vote(t, s, [firstOf(t, t.agents[s][0]!, s), firstOf(t, t.agents[s][0]!, "civilian")]);
  await expect(screen.page.getByTestId("as-last-end")).toContainText("voto pari");
  expect(view(t.agents[s][0]!).cards.some((c: { revealed: boolean }) => c.revealed)).toBe(false);

  // L'altra squadra scopre un suo agente e poi «Passa».
  const clue2 = validClue(t.words, [clue1]);
  await giveClue(t.spy[o], clue2, "1");
  const mine = firstOf(t, t.agents[o][0]!, o);
  await vote(t, o, [mine]);
  await expect(screen.page.getByTestId("as-card").nth(mine)).toHaveAttribute("data-revealed", "true");
  await expect(screen.page.getByTestId("as-card").nth(mine)).toHaveAttribute("data-kind", o);
  await vote(t, o, ["pass"]);
  await expect(screen.page.getByTestId("as-last-end")).toContainText("ha passato");

  // La prima squadra scopre un civile; la regia annulla la scoperta e il voto riparte.
  const clue3 = validClue(t.words, [clue1, clue2]);
  await giveClue(t.spy[s], clue3, "∞");
  const civ = firstOf(t, t.agents[s][0]!, "civilian");
  await vote(t, s, [civ]);
  await expect(screen.page.getByTestId("as-card").nth(civ)).toHaveAttribute("data-kind", "civilian");
  await expect(screen.page.getByTestId("as-thinking")).toBeVisible(); // tocca all'altra squadra
  await host.getByTestId("as-undo").click();
  await expect(screen.page.getByTestId("as-card").nth(civ)).toHaveAttribute("data-revealed", "false");
  await expect(screen.page.getByTestId("as-card").nth(civ)).not.toHaveAttribute("data-kind");
  await expect(screen.page.getByTestId("as-clue")).toContainText(`«${clue3}»`);

  // Ora l'assassino: la squadra di turno perde subito.
  await vote(t, s, [firstOf(t, t.agents[s][0]!, "assassin")]);
  await expect(screen.page.getByTestId("as-outcome")).toContainText(`Vince la squadra ${view(t.spy[o]).teams[o].name}`);
  await expect(screen.page.getByTestId("as-outcome")).toContainText("ha scoperto l'assassino");
  // A fine partita la mappa intera è sulla TV.
  const kinds = await screen.page.getByTestId("as-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  expect(kinds).toEqual(t.map);

  // Privacy: la mappa è arrivata solo ai due Capi-spia; TV e agenti non hanno mai ricevuto il colore delle carte coperte.
  expectNoSecrets(screen, "game:screen", "schermo");
  for (const side of ["red", "blue"] as const) for (const c of t.agents[side]) expectNoSecrets(c, "game:player", `agente ${side}`);
  for (const side of ["red", "blue"] as const) expect(viewsIn(t.spy[side], "game:player").some((v) => v.me?.map)).toBe(true);

  // Punti: 100 a ogni membro della squadra vincitrice (Capo-spia compreso).
  const winners = view(t.spy[o]).teams[o].members.map((p: { nickname: string }) => p.nickname);
  await host.getByTestId("as-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  const rows = screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li");
  await expect(rows.filter({ hasText: winners[0] }).locator(".pts")).toHaveText("100");
});

test("agenti segreti 4×4 senza assassino: indizio ∞ e tutti gli agenti trovati; con la regia cieca la regia non vede la mappa", async ({ newGame }) => {
  const g = await newGame(config({ gridSize: "4x4", assassins: 0 }), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await startRound(g);
  const host = admin.page.getByTestId("as-host");
  // controllato dal server: si clicca e si aspetta che la vista della regia lo confermi
  await host.getByTestId("as-blind").click();
  await expect(host.getByTestId("as-blind")).toBeChecked();
  await host.getByTestId("as-deal").click();
  const t = await tableOf(clients);
  expect(t.map).toHaveLength(16);
  // Regia cieca: le carte coperte nel pannello non hanno colore.
  await expect(host.getByTestId("as-host-grid").locator(".as-card")).toHaveCount(16);
  await expect(host.getByTestId("as-host-grid").locator(".as-card[data-kind]")).toHaveCount(0);

  const s = t.starting;
  await giveClue(t.spy[s], validClue(t.words), "∞");
  const own = t.map.flatMap((k, i) => (k === s ? [i] : []));
  expect(own).toHaveLength(6);
  for (const i of own) {
    await vote(t, s, [i]);
    await expect(screen.page.getByTestId("as-card").nth(i)).toHaveAttribute("data-kind", s);
  }
  await expect(screen.page.getByTestId("as-outcome")).toContainText("Tutti gli agenti trovati");
  await expect(screen.page.getByTestId("as-blind-broken")).toHaveCount(0);
  // La regia cieca non ha mai ricevuto la mappa delle carte coperte prima della fine.
  const hostViews = viewsIn(admin, "game:admin").filter((v) => v.phase !== "reveal" && v.phase !== "done");
  expect(hostViews.length).toBeGreaterThan(0);
  for (const v of hostViews) expect(v.cards.filter((c: Record<string, unknown>) => !c.revealed && "kind" in c)).toEqual([]);
  await host.getByTestId("as-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});
