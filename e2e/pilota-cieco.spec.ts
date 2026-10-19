import { expect } from "@playwright/test";
import { doorOpen } from "../packages/shared/src/timeline";
import { type Client, lastPlayerView, test } from "./support";

type Game = Awaited<ReturnType<Parameters<Parameters<typeof test>[2]>[0]["newGame"]>>;

const config = (extra: Record<string, unknown> = {}) => [
  {
    typeId: "pilota-cieco",
    title: "Pilota e2e",
    theme: "pixel",
    config: { mode: "insieme", levels: 1, size: "piccolo", mineDensity: 10, doors: 3, keys: 1, patrols: false, stepMs: 150, penaltyMs: 1000, levelSeconds: 150, ...extra },
  },
];

const view = (c: Client) => lastPlayerView(c.traffic)!;

/** Tutte le viste del gioco (oggetti con `phase` e `settings`) arrivate a una pagina con un certo evento, in ordine. */
function viewsIn(c: Client, event: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, any>;
    if (typeof o.phase === "string" && o.settings && typeof o.settings === "object" && "lanes" in o) out.push(o);
    for (const v of Object.values(o)) walk(v);
  };
  for (const line of c.traffic.text().split("\n")) if (line.startsWith(`42["${event}"`)) walk(JSON.parse(line.slice(2))[1]);
  return out;
}

function keysOf(values: unknown[], acc = new Set<string>()): Set<string> {
  for (const v of values) {
    if (Array.isArray(v)) keysOf(v, acc);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (acc.add(k), keysOf([x], acc));
  }
  return acc;
}

const hostInfo = (admin: Client): Record<string, any> => viewsIn(admin, "game:admin").at(-1)!;
const laneOf = (admin: Client, teamId: string) => hostInfo(admin).lanes.find((l: any) => l.teamId === teamId);
const secretsOf = (admin: Client, teamId: string) => hostInfo(admin).secrets.find((s: any) => s.teamId === teamId);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Labirinto: lo stesso formato del server (bit per lato aperto) ----
type Dir = "up" | "right" | "down" | "left";
function neighbours(cells: number[], w: number, i: number): { dir: Dir; to: number }[] {
  const out: { dir: Dir; to: number }[] = [];
  if (cells[i]! & 1) out.push({ dir: "up", to: i - w });
  if (cells[i]! & 2) out.push({ dir: "right", to: i + 1 });
  if (cells[i]! & 4) out.push({ dir: "down", to: i + w });
  if (cells[i]! & 8) out.push({ dir: "left", to: i - 1 });
  return out;
}

/** Percorso più breve evitando alcune caselle (le mine): celle da `from` a `to`, estremi compresi. */
function path(cells: number[], w: number, from: number, to: number, avoid: number[] = []): number[] | null {
  const prev = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let q = 0; q < queue.length && !prev.has(to); q++) {
    for (const { to: j } of neighbours(cells, w, queue[q]!)) {
      if (prev.has(j) || (avoid.includes(j) && j !== to)) continue;
      prev.set(j, queue[q]!);
      queue.push(j);
    }
  }
  if (!prev.has(to)) return null;
  const out = [to];
  while (out[0] !== from) out.unshift(prev.get(out[0]!)!);
  return out;
}

const dirBetween = (cells: number[], w: number, a: number, b: number): Dir => neighbours(cells, w, a).find((n) => n.to === b)!.dir;

/** Una porta è aperta ora e lo resta per almeno `marginMs`? (stesso orologio: server e test girano sulla stessa macchina) */
const openFor = (door: any, levelStartedAt: number, marginMs: number) => doorOpen(door, Date.now() - levelStartedAt) && doorOpen(door, Date.now() - levelStartedAt + marginMs);
const closedFor = (door: any, levelStartedAt: number, marginMs: number) => !doorOpen(door, Date.now() - levelStartedAt) && !doorOpen(door, Date.now() - levelStartedAt + marginMs);

interface Table {
  pilot: Client;
  navigators: Client[];
  teamId: string;
}

/** Chi è pilota e chi navigatore di ogni squadra, dalle viste che i telefoni hanno davvero ricevuto. */
async function tables(clients: Client[]): Promise<Table[]> {
  await expect.poll(() => clients.every((c) => view(c)?.me)).toBe(true);
  const by = new Map<string, Table>();
  for (const c of clients) {
    const me = view(c).me;
    const t = by.get(me.teamId) ?? { pilot: undefined as unknown as Client, navigators: [], teamId: me.teamId };
    if (me.role === "pilot") t.pilot = c;
    else t.navigators.push(c);
    by.set(me.teamId, t);
  }
  return [...by.values()];
}

/** Il pilota va verso `target` con la croce del telefono, evitando le mine e aspettando le porte chiuse. */
async function walkTo(admin: Client, t: Table, target: number, avoid: number[] = []) {
  let last = "";
  const trace: string[] = [];
  for (let guard = 0; guard < 250; guard++) {
    const lane = laneOf(admin, t.teamId);
    last = `squadra ${t.teamId}: posizione ${lane.pos}, obiettivo ${target}, fermo fino a ${lane.frozenUntil - Date.now()} ms, fase ${hostInfo(admin).phase}, arrivata ${lane.finishedAt}`;
    if (lane.pos === target || lane.finishedAt !== null) return;
    const wait = lane.frozenUntil - Date.now();
    if (wait > 0) {
      await sleep(wait + 60);
      continue;
    }
    const p = path(lane.cells, lane.w, lane.pos, target, avoid)!;
    const next = p[1]!;
    const door = secretsOf(admin, t.teamId).doors.find((d: any) => d.cell === next);
    last += `, prossima ${next}${door ? ` (porta, aperta ora: ${doorOpen(door, Date.now() - hostInfo(admin).levelStartedAt)})` : ""}, percorso ${p.join(">")}`;
    if (door && !openFor(door, hostInfo(admin).levelStartedAt, 500)) {
      await sleep(80);
      continue;
    }
    const before = lane.pos;
    trace.push(`${before}→${next}${door ? "D" : ""} strikes ${lane.strikes} frz ${Math.round(lane.frozenUntil - Date.now())}`);
    if (trace.length > 14) trace.shift();
    await t.pilot.page.getByTestId(`pc-move-${dirBetween(lane.cells, lane.w, lane.pos, next)}`).click();
    await expect.poll(() => laneOf(admin, t.teamId).pos !== before || laneOf(admin, t.teamId).frozenUntil > Date.now(), { timeout: 5_000 }).toBe(true);
    await sleep(170);
  }
  throw new Error(`il pilota non arriva (${last}) ultimi passi: ${trace.join(" | ")}`);
}

/** Raccoglie la chiave e arriva all'uscita, senza pestare mine. */
async function finish(admin: Client, t: Table) {
  const sec = secretsOf(admin, t.teamId);
  for (const key of sec.keys) await walkTo(admin, t, key, sec.mines);
  await walkTo(admin, t, laneOf(admin, t.teamId).exit, sec.mines);
}

async function startRound(g: Game) {
  await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(g.admin.page.getByTestId("pc-host")).toBeVisible();
  await expect(g.screen.page.getByTestId("pc-lane")).toHaveCount(2);
}

test("pilota alla cieca: una mina, una porta chiusa, l'arrivo e i punti, con gli strati solo ai navigatori giusti", async ({ newGame }) => {
  test.slow();
  const g = await newGame(config(), { playersPerTeam: 3 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await startRound(g);
  const host = admin.page.getByTestId("pc-host");

  // ---- Presentazione: i navigatori hanno il loro strato, il pilota la croce, la TV nessun pericolo ----
  const [a, b] = await tables(clients);
  expect(a!.navigators).toHaveLength(2);
  const active = ["mines", "doors", "keys"]; // livello 1: niente pattuglie
  for (const t of [a!, b!]) {
    const layers = t.navigators.map((n) => view(n).me.layers as string[]);
    expect(layers.flat().sort(), "ogni strato a un navigatore, nessuno doppio").toEqual([...active].sort());
    for (const n of t.navigators) {
      const me = view(n).me;
      expect(Object.keys(me.layerData).sort()).toEqual([...me.layers].sort());
      await expect(n.page.getByTestId("pc-legend")).toContainText(me.layers.length > 0 ? "Tu vedi" : "Nessuno strato");
    }
    await expect(t.pilot.page.getByTestId("pc-dpad")).toBeVisible();
    await expect(t.pilot.page.getByTestId("pc-map")).toHaveCount(0);
  }
  await expect(screen.page.getByTestId("pc-ready")).toBeVisible();
  await expect(screen.page.locator(".pc-patrol")).toHaveCount(0);
  // la regia vede tutti gli strati e chi li ha
  await expect(host.getByTestId("pc-host-lane")).toHaveCount(2);
  await expect(host.getByTestId("pc-host-lane").first()).toContainText("mine");

  // ---- Via ----
  await host.getByTestId("pc-host-go").click();
  await expect(screen.page.getByTestId("pc-timer")).toContainText(":");
  await expect.poll(() => hostInfo(admin).phase).toBe("run");

  // La squadra A calpesta una mina: torna al punto di controllo, resta ferma e la mina diventa nota a tutti.
  const secA = secretsOf(admin, a!.teamId);
  const laneA = laneOf(admin, a!.teamId);
  // la casella da cui si pesta la mina non deve essere una mina a sua volta
  const approach = (cells: number[], w: number, from: number, mineCell: number, mines: number[]) => neighbours(cells, w, mineCell).find((n) => !mines.includes(n.to) && path(cells, w, from, n.to, mines))?.to;
  const mine = secA.mines.find((m: number) => approach(laneA.cells, laneA.w, laneA.start, m, secA.mines) !== undefined);
  expect(mine, "una mina raggiungibile").toBeDefined();
  const side = approach(laneA.cells, laneA.w, laneA.start, mine, secA.mines)!;
  await walkTo(admin, a!, side, secA.mines);
  await a!.pilot.page.getByTestId(`pc-move-${dirBetween(laneA.cells, laneA.w, side, mine)}`).click();
  await expect.poll(() => laneOf(admin, a!.teamId).strikes).toBe(1);
  // si torna all'ultimo punto di controllo raggiunto (l'ingresso o uno dei due lungo la strada)
  expect(laneA.checkpoints).toContain(laneOf(admin, a!.teamId).pos);
  await expect(a!.pilot.page.getByTestId("pc-status")).toContainText("Fermo");
  const tvA = screen.page.locator(`[data-testid=pc-lane][data-team="${a!.teamId}"]`);
  await expect(tvA.locator(".pc-mine[data-known]")).toHaveCount(1);
  await expect(tvA.getByTestId("pc-strikes")).toContainText("1");
  // l'altra squadra non ha alcuna mina scoperta, e le mine non scoperte non sono sulla TV
  await expect(screen.page.locator(`[data-testid=pc-lane][data-team="${b!.teamId}"] .pc-mine`)).toHaveCount(0);
  await expect(screen.page.locator(".pc-mine:not([data-known])")).toHaveCount(0);
  // il navigatore con lo strato «mine» le vede tutte, gli altri no
  for (const n of a!.navigators) {
    const layers = view(n).me.layers as string[];
    await expect(n.page.getByTestId("pc-mine")).toHaveCount(layers.includes("mines") ? secA.mines.length : 0);
    // le chiavi già raccolte (magari per strada) non sono più sulla mappa
    const untaken = laneOf(admin, a!.teamId).keys.total - laneOf(admin, a!.teamId).keys.taken;
    await expect(n.page.getByTestId("pc-key")).toHaveCount(layers.includes("keys") ? untaken : 0);
  }

  // La squadra B urta una porta chiusa: resta ferma un secondo, senza errori.
  const secB = secretsOf(admin, b!.teamId);
  const laneB = laneOf(admin, b!.teamId);
  const door = secB.doors.find((d: any) => approach(laneB.cells, laneB.w, laneB.start, d.cell, secB.mines) !== undefined);
  expect(door, "una porta raggiungibile").toBeDefined();
  const before = approach(laneB.cells, laneB.w, laneB.start, door.cell, secB.mines)!;
  await walkTo(admin, b!, before, secB.mines);
  for (let i = 0; i < 400 && !closedFor(door, hostInfo(admin).levelStartedAt, 900); i++) await sleep(50);
  expect(closedFor(door, hostInfo(admin).levelStartedAt, 900), "porta chiusa").toBe(true);
  await b!.pilot.page.getByTestId(`pc-move-${dirBetween(laneB.cells, laneB.w, before, door.cell)}`).click();
  await expect.poll(() => laneOf(admin, b!.teamId).frozenUntil > Date.now()).toBe(true);
  expect(laneOf(admin, b!.teamId).pos, "la porta chiusa non si attraversa").toBe(before);
  expect(laneOf(admin, b!.teamId).strikes).toBe(0);
  await expect(screen.page.locator(`[data-testid=pc-lane][data-team="${b!.teamId}"]`).getByTestId("pc-frozen")).toBeVisible();

  // ---- Arrivo: entrambe le squadre arrivano; la gara finisce quando arrivano tutti ----
  await Promise.all([finish(admin, a!), finish(admin, b!)]);
  await expect(screen.page.getByTestId("pc-results")).toBeVisible();
  await expect.poll(() => hostInfo(admin).phase).toBe("level-end");
  const results = hostInfo(admin).results as { teamId: string; finished: boolean; elapsedMs: number; strikes: number; points: number }[];
  expect(results.every((r) => r.finished)).toBe(true);
  const first = [...results].sort((x, y) => x.elapsedMs - y.elapsedMs)[0]!;
  const second = results.find((r) => r !== first)!;
  expect(first.points).toBe(Math.max(0, 150 - 10 * first.strikes));
  expect(second.points).toBe(Math.max(0, 100 - 10 * second.strikes));
  expect(results.find((r) => r.teamId === a!.teamId)!.strikes).toBe(1);
  // a fine gara si scoprono gli strati: mine, chiavi e orari delle porte compaiono sulla TV
  expect(await screen.page.locator(".pc-mine").count()).toBeGreaterThanOrEqual(secA.mines.length);
  expect(await screen.page.getByTestId("pc-key").count()).toBeGreaterThan(0);
  for (const d of await screen.page.getByTestId("pc-door").all()) expect(["true", "false"]).toContain(await d.getAttribute("data-open"));
  await expect(screen.page.getByTestId("pc-rank").first()).toBeVisible();

  // ---- Privacy: ciò che è arrivato a ciascuno, fino alla fine della gara ----
  const tvViews = viewsIn(screen, "game:screen");
  for (const v of tvViews.filter((x) => x.phase === "ready" || x.phase === "run")) {
    const keys = keysOf([v]);
    for (const secret of ["reveal", "layerData", "secrets", "mines", "patrols"]) expect(keys.has(secret), `TV in ${v.phase}: chiave «${secret}»`).toBe(false);
  }
  const mineTexts = [secA.mines, secB.mines].filter((m: number[]) => m.length >= 2).map((m: number[]) => JSON.stringify(m));
  const doorTexts = [...secA.doors, ...secB.doors].map((d: unknown) => JSON.stringify(d));
  for (const c of clients) {
    const isNavigator = [a!, b!].some((t) => t.navigators.includes(c));
    const mine = [a!, b!].find((t) => t.pilot === c || t.navigators.includes(c))!;
    const mineSecrets = mine.teamId === a!.teamId ? secA : secB;
    const otherSecrets = mine.teamId === a!.teamId ? secB : secA;
    // fino a fine gara (`level-end` scopre tutto) si guardano le sole viste di presentazione e gara
    const early = viewsIn(c, "game:player").filter((v) => v.phase === "ready" || v.phase === "run");
    expect(early.length).toBeGreaterThan(0);
    const text = JSON.stringify(early);
    if (!isNavigator) {
      for (const secret of ["layerData", "reveal", "secrets"]) expect(keysOf(early).has(secret), `pilota: chiave «${secret}»`).toBe(false);
      for (const t of mineTexts) expect(text.includes(t), "pilota con le mine").toBe(false);
      for (const t of doorTexts) expect(text.includes(t), "pilota con l'orario delle porte").toBe(false);
    } else {
      const layers = view(c).me.layers as string[];
      // nemmeno una vista di gara ha dati di strati che non ha, né di un'altra squadra
      for (const v of early) {
        if (!v.me?.layerData) continue;
        expect(Object.keys(v.me.layerData).sort()).toEqual([...layers].sort());
      }
      for (const d of otherSecrets.doors) expect(text.includes(JSON.stringify(d)), "navigatore con le porte di un'altra squadra").toBe(false);
      if (!layers.includes("doors")) for (const d of mineSecrets.doors) expect(text.includes(JSON.stringify(d)), "navigatore con le porte che non ha").toBe(false);
      if (!layers.includes("mines") && mineSecrets.mines.length >= 2) expect(text.includes(JSON.stringify(mineSecrets.mines)), "navigatore con le mine che non ha").toBe(false);
    }
  }

  // ---- Fine: la classifica e i punti a ogni membro ----
  await host.getByTestId("pc-host-next").click();
  await expect(screen.page.getByTestId("pc-final")).toBeVisible();
  await host.getByTestId("pc-host-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  const rows = screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li");
  const nameOf = (c: Client) => {
    const v = view(c);
    return v.teams.flatMap((t: any) => t.members).find((p: any) => p.id === v.me?.id)?.nickname as string | undefined;
  };
  void nameOf;
  const expectedPoints = Object.fromEntries(results.map((r) => [r.teamId, r.points]));
  const total = results.reduce((n, r) => n + r.points, 0);
  // ogni giocatore prende i punti della sua squadra: 3 giocatori per squadra
  // (i punti si contano con un'animazione: si aspetta il valore finale)
  await expect
    .poll(async () => (await rows.locator(".pts").allTextContents()).map(Number).filter((n) => n > 0).reduce((n, x) => n + x, 0))
    .toBe(total * 3);
  expect(Object.values(expectedPoints).every((p) => p > 0)).toBe(true);
});

test("pilota alla cieca: la regia cambia pilota, mette in pausa, chiude la gara; a turno i punti arrivano a fine livello", async ({ newGame }) => {
  const g = await newGame(config({ mode: "a-turno", levels: 1 }), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  const host = admin.page.getByTestId("pc-host");
  await expect(host).toBeVisible();
  // a turno: una sola corsia alla volta, e la TV dice a che punto si è
  await expect(screen.page.getByTestId("pc-lane")).toHaveCount(1);
  await expect(screen.page.getByTestId("pc-level")).toContainText("gara 1/2");
  const first = await tables(clients);
  const playing = first.find((t) => t.teamId === hostInfo(admin).lanes[0].teamId)!;
  const waiting = first.find((t) => t !== playing)!;
  // chi aspetta non ha né croce né mappa (nessuno dei due è pilota: tocca all'altra squadra)
  for (const c of waiting.navigators) {
    await expect(c.page.getByTestId("pc-dpad")).toHaveCount(0);
    await expect(c.page.getByTestId("pc-map")).toHaveCount(0);
    await expect(c.page.getByTestId("pc-status")).toContainText("Non corre la tua squadra");
  }

  // «Cambia pilota» prima del via: i ruoli si scambiano tra i due compagni
  await host.getByTestId("pc-host-skip-pilot").click();
  await expect.poll(() => view(playing.pilot).me.role).toBe("navigator");
  await expect.poll(() => view(playing.navigators[0]!).me.role).toBe("pilot");
  const pilot = playing.navigators[0]!;
  await host.getByTestId("pc-host-go").click();
  await expect.poll(() => hostInfo(admin).phase).toBe("run");
  await expect(pilot.page.getByTestId("pc-dpad").locator("button").first()).toBeEnabled();

  // pausa: il timer si ferma, la croce non fa nulla
  await host.getByTestId("pc-host-pause").click();
  await expect(screen.page.locator(".pc-timer[data-paused]")).toBeVisible();
  const posBefore = laneOf(admin, playing.teamId).pos;
  const lane = laneOf(admin, playing.teamId);
  const dir = neighbours(lane.cells, lane.w, lane.pos)[0]!.dir;
  await pilot.page.getByTestId(`pc-move-${dir}`).click();
  await screen.page.waitForTimeout(600);
  expect(laneOf(admin, playing.teamId).pos).toBe(posBefore);
  await host.getByTestId("pc-host-resume").click();
  await expect(screen.page.locator(".pc-timer[data-paused]")).toHaveCount(0);

  // «Chiudi la gara»: si passa alla fine della gara; i punti si assegnano solo a livello completo
  await host.getByTestId("pc-host-finish").click();
  await expect(screen.page.getByTestId("pc-results")).toBeVisible();
  await expect.poll(() => hostInfo(admin).results.length).toBe(1);
  expect(hostInfo(admin).results[0].points).toBeNull();
  await host.getByTestId("pc-host-next").click();
  await expect(screen.page.getByTestId("pc-level")).toContainText("gara 2/2");
  await host.getByTestId("pc-host-go").click();
  await host.getByTestId("pc-host-finish").click();
  await expect.poll(() => hostInfo(admin).results.length).toBe(2);
  expect(hostInfo(admin).results.every((r: any) => r.points !== null)).toBe(true);
  await host.getByTestId("pc-host-next").click();
  await expect(screen.page.getByTestId("pc-final")).toBeVisible();
  await host.getByTestId("pc-host-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});
