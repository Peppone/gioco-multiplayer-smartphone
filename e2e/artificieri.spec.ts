import { type APIRequestContext, expect } from "@playwright/test";
import { type Client, adminApi, adminToken, lastPlayerView, test } from "./support";

type Game = Awaited<ReturnType<Parameters<Parameters<typeof test>[2]>[0]["newGame"]>>;

/** I tre tipi di modulo della prima versione: gli altri hanno un loro scenario. */
const BASE = { wires: true, button: true, symbols: true, colors: false, maze: false, word: false };

const config = (extra: Record<string, unknown> = {}) => [
  {
    typeId: "artificieri",
    title: "Artificieri e2e",
    theme: "boom",
    config: { difficulty: "facile", modules: 3, seconds: 300, maxStrikes: 3, betSeconds: 15, bombsPerTeam: 1, enabledModules: BASE, ...extra },
  },
];

const view = (c: Client) => lastPlayerView(c.traffic)!;

/** Tutte le viste del gioco (oggetti con `phase` e `settings`) arrivate a una pagina con un certo evento, in ordine. */
function viewsIn(c: Client, event: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, any>;
    if (typeof o.phase === "string" && o.settings && typeof o.settings === "object" && "history" in o) out.push(o);
    for (const v of Object.values(o)) walk(v);
  };
  for (const line of c.traffic.text().split("\n")) if (line.startsWith(`42["${event}"`)) walk(JSON.parse(line.slice(2))[1]);
  return out;
}

/** Tutte le chiavi, a qualunque profondità, di un insieme di oggetti. */
function keysOf(values: unknown[], acc = new Set<string>()): Set<string> {
  for (const v of values) {
    if (Array.isArray(v)) keysOf(v, acc);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (acc.add(k), keysOf([x], acc));
  }
  return acc;
}

const hostInfo = (admin: Client): Record<string, any> => viewsIn(admin, "game:admin").at(-1)!;

interface Table {
  defuser: Client;
  experts: Client[];
  bettors: Client[];
}

/** Chi è chi nel turno in corso, letto dalle viste che i telefoni hanno davvero ricevuto. */
async function tableOf(clients: Client[], phase: string): Promise<Table> {
  await expect.poll(() => clients.every((c) => view(c)?.phase === phase && view(c).me), { message: `fase ${phase} su tutti i telefoni` }).toBe(true);
  const by = (role: string) => clients.filter((c) => view(c).me.role === role);
  expect(by("defuser"), "un solo artificiere").toHaveLength(1);
  return { defuser: by("defuser")[0]!, experts: by("expert"), bettors: by("bettor") };
}

const nickOf = (c: Client): string => {
  const v = view(c);
  return v.teams.flatMap((t: any) => t.members).find((p: any) => p.id === v.me.id).nickname;
};

/** Soluzione di un modulo letta dalla vista della regia: azioni da fare sul telefono dell'artificiere. */
type Plan =
  | { kind: "wires"; wire: number }
  | { kind: "symbols"; keys: number[] }
  | { kind: "button"; mode: "tap" }
  | { kind: "button"; mode: "hold"; digit: number }
  | { kind: "colors"; keys: number[] }
  | { kind: "maze"; moves: string[] }
  | { kind: "word"; spins: { wheel: number; delta: 1 | -1 }[] };

const LAMPS = ["rosso", "blu", "verde", "giallo"];
const MOVE: Record<string, string> = { su: "up", giù: "down", destra: "right", sinistra: "left" };

function planOf(m: any): Plan {
  const text: string = m.solution;
  if (m.kind === "wires") return { kind: "wires", wire: Number(/filo (\d+)/.exec(text)![1]) - 1 };
  if (m.kind === "symbols") {
    const order = text.split(": ")[1]!.split(", ");
    return { kind: "symbols", keys: order.map((id) => (m.data.symbols as string[]).indexOf(id)) };
  }
  if (m.kind === "colors") {
    // «… va premuta così: rosso, blu, … (ora tocca a X)»: a ogni passo si ripetono i primi lampi
    const order = /così: ([^(]+) \(/.exec(text)![1]!.split(", ").map((n) => LAMPS.indexOf(n.trim()));
    return { kind: "colors", keys: order.flatMap((_, stage) => order.slice(0, stage + 1)) };
  }
  if (m.kind === "maze") return { kind: "maze", moves: /: (.+)$/.exec(text)![1]!.split(", ").map((d) => MOVE[d]!) };
  if (m.kind === "word") {
    const target = /Componi ([A-Z]{5})/.exec(text)![1]!;
    const spins: { wheel: number; delta: 1 | -1 }[] = [];
    [...target].forEach((ch, wheel) => {
      const forward = (m.data.wheels[wheel].indexOf(ch) - m.progress.pos[wheel] + 6) % 6;
      for (let k = 0; k < (forward <= 3 ? forward : 6 - forward); k++) spins.push({ wheel, delta: forward <= 3 ? 1 : -1 });
    });
    return { kind: "word", spins };
  }
  if (/subito/.test(text)) return { kind: "button", mode: "tap" };
  return { kind: "button", mode: "hold", digit: Number(/cifra (\d)/.exec(text)![1]) };
}

async function pickModule(d: Client, id: number) {
  await d.page.getByTestId("art-module-tab").nth(id).click();
  await expect(d.page.getByTestId("art-module-tab").nth(id)).toHaveAttribute("aria-selected", "true");
}

/** Gioca la soluzione di un modulo dal telefono dell'artificiere, come farebbe una persona. */
async function solve(d: Client, screen: Client, m: any) {
  const plan = planOf(m);
  await pickModule(d, m.id);
  if (plan.kind === "wires") await d.page.getByTestId("art-cut").nth(plan.wire).click();
  else if (plan.kind === "symbols") for (const k of plan.keys) await d.page.getByTestId("art-key").nth(k).click();
  else if (plan.kind === "colors") for (const k of plan.keys) await d.page.getByTestId("art-lamp-key").nth(k).click();
  else if (plan.kind === "maze") for (const dir of plan.moves) await d.page.getByTestId(`art-move-${dir}`).click();
  else if (plan.kind === "word") {
    for (const s of plan.spins) await d.page.getByTestId(s.delta === 1 ? "art-spin-next" : "art-spin-back").nth(s.wheel).click();
    // la TV mostra la parola composta (una lettera per rotella) prima di «Invia»
    await d.page.getByTestId("art-submit").click();
  }
  else if (plan.mode === "tap") await d.page.getByTestId("art-tap").click();
  else {
    const hold = d.page.getByTestId("art-hold");
    await hold.hover();
    await d.page.mouse.down();
    // la striscia compare sulla TV solo ora, mentre il pulsante è tenuto
    await expect(screen.page.locator("[data-testid=art-strip][data-on]")).toHaveCount(1);
    // il telefono mostra l'ultima cifra dei secondi del timer: si rilascia quando è quella del manuale
    await d.page.waitForFunction(
      (digit) => {
        const m = /(\d+):(\d\d)/.exec(document.querySelector('[data-testid="art-timer"]')?.textContent ?? "");
        return m !== null && Number(m[2]) % 10 === digit;
      },
      plan.digit,
      { polling: 20 },
    );
    await d.page.mouse.up();
    // la striscia sparisce, a meno che questo fosse l'ultimo modulo: a bomba disinnescata la TV mostra tutto
    await expect
      .poll(async () => (await screen.page.getByTestId("art-outcome").count()) > 0 || (await screen.page.locator("[data-testid=art-strip][data-on]").count()) === 0)
      .toBe(true);
  }
  await expect(screen.page.getByTestId("art-module").nth(m.id)).toHaveAttribute("data-solved", "true");
}

/** Un errore qualsiasi (non fatale per il modulo): tasto sbagliato dei simboli, pulsante nel modo sbagliato o filo sbagliato. */
async function strike(d: Client, host: Client) {
  const mods = hostInfo(host).bomb.modules.filter((m: any) => !m.solved);
  const sym = mods.find((m: any) => m.kind === "symbols");
  if (sym) {
    const plan = planOf(sym) as Extract<Plan, { kind: "symbols" }>;
    const pressed: number[] = sym.progress.pressed;
    const wrong = [...sym.data.symbols.keys()].find((k: number) => k !== plan.keys[pressed.length] && !pressed.includes(k))!;
    await pickModule(d, sym.id);
    await d.page.getByTestId("art-key").nth(wrong).click();
    return;
  }
  const btn = mods.find((m: any) => m.kind === "button");
  if (btn) {
    const plan = planOf(btn);
    await pickModule(d, btn.id);
    // il modo sbagliato: tenere premuto se va premuto, premere se va tenuto
    await d.page.getByTestId(plan.kind === "button" && plan.mode === "tap" ? "art-hold" : "art-tap").click();
    return;
  }
  const w = mods.find((m: any) => m.kind === "wires")!;
  const right = (planOf(w) as Extract<Plan, { kind: "wires" }>).wire;
  const cut: number[] = w.progress.cut;
  const wrong = [...Array(w.data.wires.length).keys()].find((i) => i !== right && !cut.includes(i))!;
  await pickModule(d, w.id);
  await d.page.getByTestId("art-cut").nth(wrong).click();
}

async function startRound(g: Game) {
  await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(g.admin.page.getByTestId("art-host")).toBeVisible();
  await expect(g.screen.page.getByTestId("art-intro")).toBeVisible();
}

test("artificieri: scommesse, briefing, errore, disinnesco di ogni modulo, esplosione e punti, senza far trapelare bordo e manuale", async ({ newGame }) => {
  test.slow();
  const g = await newGame(config(), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await startRound(g);
  const host = admin.page.getByTestId("art-host");

  // ---- Primo turno: scommesse ----
  const t1 = await tableOf(clients, "bet");
  // i nickname si leggono ora: a fine round le viste dei telefoni non hanno più `me`
  const nicks = new Map(clients.map((c) => [c, nickOf(c)]));
  const nick = (c: Client) => nicks.get(c)!;
  expect(t1.experts).toHaveLength(1);
  expect(t1.bettors).toHaveLength(2);
  const teamName1 = view(t1.defuser).turn.teamName as string;
  await expect(screen.page.getByTestId("art-intro")).toContainText(teamName1);
  await expect(screen.page.getByTestId("art-defuser")).toHaveText(nick(t1.defuser));
  await expect(screen.page.getByTestId("art-bomb")).toHaveCount(0);
  // l'esperto non ha ancora il manuale; i comandi dell'artificiere nemmeno
  await expect(t1.experts[0]!.page.getByTestId("art-manual")).toHaveCount(0);
  await t1.bettors[0]!.page.getByTestId("art-bet-defused").click();
  await expect(screen.page.getByTestId("art-bet-wait")).toContainText("(1 / 2)");
  await t1.bettors[1]!.page.getByTestId("art-bet-exploded").click();

  // ---- Briefing: con tutte le scommesse si passa subito; gli esperti ricevono il manuale, la TV non mostra la bomba ----
  await expect(screen.page.getByTestId("art-turn-back")).toContainText("di spalle");
  await expect(screen.page.getByTestId("art-bomb")).toHaveCount(0);
  const expert = t1.experts[0]!;
  await expect(expert.page.getByTestId("art-manual")).toBeVisible();
  const pages = await expert.page.getByTestId("art-tab").count();
  expect(pages, "con un solo esperto ha tutte le pagine").toBeGreaterThanOrEqual(3);
  await expect(t1.defuser.page.getByTestId("art-start")).toBeEnabled();
  await t1.defuser.page.getByTestId("art-start").click();

  // ---- Disinnesco ----
  await expect(screen.page.getByTestId("art-bomb")).toBeVisible();
  await expect(screen.page.getByTestId("art-module")).toHaveCount(3);
  const serial = (await screen.page.getByTestId("art-serial").textContent())!.replace("SERIALE", "").trim();
  expect(serial).toMatch(/^[A-Z2-9]{6}$/);
  expect(hostInfo(admin).bomb.edgework.serial).toBe(serial);
  // le soluzioni (testi) si salvano ora: a modulo risolto la regia non le mostra più
  const solutions: string[] = hostInfo(admin).bomb.modules.map((m: any) => m.solution);
  expect(solutions.every((s) => typeof s === "string" && s.length > 0)).toBe(true);
  await expect(t1.defuser.page.getByTestId("art-controls")).toBeVisible();
  await expect(t1.defuser.page.getByTestId("art-edge")).toHaveCount(0);

  // un errore: il timer accelera
  await strike(t1.defuser, admin);
  await expect(screen.page.getByTestId("art-strikes")).toHaveAttribute("aria-label", "Errori: 1 su 3");
  await expect(screen.page.getByTestId("art-timer")).toContainText("×1.25");
  await expect(expert.page.getByTestId("art-strikes")).toHaveAttribute("aria-label", "Errori: 1 su 3");

  // tutti i moduli, con le soluzioni lette dalla regia
  for (const m of hostInfo(admin).bomb.modules) await solve(t1.defuser, screen, m);
  const outcome = screen.page.getByTestId("art-outcome");
  await expect(outcome).toHaveAttribute("data-result", "defused");
  await expect(outcome).toContainText("Moduli disinnescati: 3 / 3");
  await expect(outcome).toContainText("errori 1");
  const teamPoints = Number(/\+(\d+) punti/.exec((await outcome.textContent())!)![1]);
  expect(teamPoints).toBeGreaterThanOrEqual(3 * 50 + 200);
  await expect(screen.page.getByTestId("art-bet-result")).toContainText("hanno indovinato");
  await expect(t1.bettors[0]!.page.getByTestId("art-my-bet")).toContainText("indovinato");
  await expect(t1.bettors[1]!.page.getByTestId("art-my-bet")).toContainText("peccato");

  // ---- Secondo turno: l'altra squadra sbaglia tre volte ----
  await host.getByTestId("art-host-next").click();
  const t2 = await tableOf(clients, "bet");
  expect(t2.defuser).not.toBe(t1.defuser);
  expect(t2.bettors.map(nick).sort()).toEqual([nick(t1.defuser), nick(expert)].sort());
  // le scommettitrici del turno 1 sono ora in gioco: chi scommette ora è la squadra che ha appena giocato
  for (const b of t2.bettors) await b.page.getByTestId("art-bet-exploded").click();
  await expect(t2.defuser.page.getByTestId("art-start")).toBeEnabled();
  await t2.defuser.page.getByTestId("art-start").click();
  await expect(screen.page.getByTestId("art-bomb")).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await strike(t2.defuser, admin);
    await expect(screen.page.getByTestId("art-strikes")).toHaveAttribute("aria-label", `Errori: ${i} su 3`);
  }
  await expect(outcome).toHaveAttribute("data-result", "exploded");
  await expect(outcome).toContainText("troppi errori");
  await expect(screen.page.getByTestId("art-bet-result")).toContainText("hanno indovinato");
  const lastHost = hostInfo(admin);

  // ---- Privacy: ciò che è arrivato a ciascuno, dall'inizio ----
  const allPhones = clients;
  for (const c of allPhones) {
    const views = viewsIn(c, "game:player");
    expect(views.length, "viste ricevute").toBeGreaterThan(0);
    const keys = keysOf(views);
    for (const secret of ["edgework", "rules", "solution", "pages", "lastStrike", "bomb", "bets"]) expect(keys.has(secret), `${nick(c)}: chiave «${secret}» sul telefono`).toBe(false);
    for (const v of views) {
      if (v.me?.role !== "expert") expect(v.me && "manual" in v.me, `${nick(c)}: manuale a chi non è esperto (${v.me?.role})`).toBeFalsy();
      if (v.me?.role === "expert" && v.phase !== "briefing" && v.phase !== "defuse") expect(v.me.manual, `manuale in ${v.phase}`).toEqual([]);
      if (v.me?.role !== "defuser") expect(v.me && "controls" in v.me, `comandi a ${v.me?.role}`).toBeFalsy();
    }
    // né il numero di serie né le soluzioni (testi) sono mai passati dai telefoni
    const text = c.traffic.text();
    expect(text.includes(serial), `${nick(c)}: numero di serie`).toBe(false);
    for (const s of solutions) expect(text.includes(s), `${nick(c)}: soluzione «${s}»`).toBe(false);
  }
  // l'esperto del primo turno ha ricevuto solo le sue pagine (tutte: era l'unico), e non quelle del secondo
  const expertPages = new Set(viewsIn(expert, "game:player").flatMap((v) => (v.me?.manual ?? []).map((p: any) => p.title)));
  expect(expertPages.size).toBeGreaterThanOrEqual(3);
  const secondExpert = t2.experts[0]!;
  const secondPages = viewsIn(secondExpert, "game:player").flatMap((v) => (v.me?.manual ?? []).map((p: any) => p.id));
  expect(secondPages.length).toBeGreaterThan(0);
  // la TV: la bomba solo in disinnesco ed esito, mai regole, soluzioni, pagine o manuale
  const tv = viewsIn(screen, "game:screen");
  const tvKeys = keysOf(tv);
  for (const secret of ["rules", "solution", "pages", "manual", "lastStrike", "bets", "me"]) expect(tvKeys.has(secret), `TV: chiave «${secret}»`).toBe(false);
  for (const v of tv) if (v.phase === "bet" || v.phase === "briefing" || v.phase === "final" || v.phase === "done") expect(v.bomb, `bomba sulla TV in ${v.phase}`).toBeNull();
  expect(tv.some((v) => v.bomb?.edgework?.serial === serial), "la TV ha il bordo in disinnesco").toBe(true);
  // la striscia del pulsante compare sulla TV solo mentre è tenuto premuto (o a fine turno)
  for (const v of tv) for (const m of v.bomb?.modules ?? []) if (m.kind === "button" && "strip" in m.data) expect(m.progress.holding || v.phase === "outcome", "striscia sulla TV").toBe(true);
  // la regia vede tutto: soluzione e pagine di ogni esperto
  expect(lastHost.bomb.pages.length).toBeGreaterThan(0);

  // ---- Fine: classifica e punti ----
  await host.getByTestId("art-host-next").click();
  await expect(screen.page.getByTestId("art-final")).toBeVisible();
  await expect(screen.page.getByTestId("art-final").locator("li")).toHaveCount(2);
  await host.getByTestId("art-host-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  const rows = screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li");
  // squadra del primo turno: punti della bomba, più 50 a testa per la scommessa giusta nel secondo (hanno scommesso «esplode»)
  for (const c of [t1.defuser, expert]) await expect(rows.filter({ hasText: nick(c) }).locator(".pts")).toHaveText(String(teamPoints + 50));
  // scommettitori del primo turno: 50 a chi ha detto «disinnescata», 0 a chi ha detto «esplode»
  await expect(rows.filter({ hasText: nick(t1.bettors[0]!) }).locator(".pts")).toHaveText("50");
});

test("artificieri: la regia cambia l'artificiere, mette in pausa, annulla un errore, salta una squadra e chiude il round", async ({ newGame }) => {
  const g = await newGame(config({ betSeconds: 0 }), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await startRound(g);
  const host = admin.page.getByTestId("art-host");

  // senza scommesse si parte dal briefing; cambio di artificiere: i ruoli si scambiano tra i due compagni
  const t = await tableOf(clients, "briefing");
  await expect(host.getByTestId("art-host-phase")).toContainText("Briefing");
  await host.getByTestId("art-host-swap").click();
  await expect.poll(() => view(t.defuser).me.role).toBe("expert");
  await expect.poll(() => view(t.experts[0]!).me.role).toBe("defuser");
  const d = t.experts[0]!;
  await expect(screen.page.getByTestId("art-defuser")).toHaveText(nickOf(d));
  // la regia fa partire il timer al posto dell'artificiere
  await host.getByTestId("art-host-start").click();
  await expect(screen.page.getByTestId("art-bomb")).toBeVisible();
  await expect(d.page.getByTestId("art-controls")).toBeVisible();
  // le soluzioni sono nella regia, una per modulo
  await expect(host.getByTestId("art-host-solution")).toHaveCount(3);
  await expect(host.getByTestId("art-host-pages")).toContainText(nickOf(t.defuser));

  // errore, poi «Annulla l'ultimo errore»
  await strike(d, admin);
  await expect(screen.page.getByTestId("art-strikes")).toHaveAttribute("aria-label", "Errori: 1 su 3");
  await expect(host.getByTestId("art-host-undo")).toBeEnabled();
  await host.getByTestId("art-host-undo").click();
  await expect(screen.page.getByTestId("art-strikes")).toHaveAttribute("aria-label", "Errori: 0 su 3");
  await expect(screen.page.getByTestId("art-timer")).not.toContainText("×");

  // pausa: il timer si ferma sulla TV e sul telefono, e in pausa le azioni non contano
  await host.getByTestId("art-host-pause").click();
  await expect(screen.page.getByTestId("art-timer")).toHaveAttribute("data-paused", "true");
  await expect(d.page.getByTestId("art-timer")).toHaveAttribute("data-paused", "true");
  const frozen = await screen.page.getByTestId("art-timer").textContent();
  await strike(d, admin);
  await screen.page.waitForTimeout(1500);
  await expect(screen.page.getByTestId("art-strikes")).toHaveAttribute("aria-label", "Errori: 0 su 3");
  expect(await screen.page.getByTestId("art-timer").textContent()).toBe(frozen);
  await host.getByTestId("art-host-resume").click();
  await expect(screen.page.getByTestId("art-timer")).not.toHaveAttribute("data-paused", "true");

  // «Salta la squadra»: passa all'altra, senza punti; poi «Termina il round» porta alla classifica
  await host.getByTestId("art-host-skip").click();
  await expect(screen.page.getByTestId("art-turn-back")).toBeVisible();
  await expect(host.getByTestId("art-host-phase")).toContainText("Briefing");
  await expect.poll(() => hostInfo(admin).history.at(-1)?.outcome).toBe("skipped");
  await host.getByTestId("art-host-end").click();
  await expect(screen.page.getByTestId("art-final")).toBeVisible();
  await host.getByTestId("art-host-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});

test("artificieri: moduli Colori, Labirinto e Parola, con la lista di parole della libreria e senza far trapelare la parola giusta né i muri", async ({ newGame, request }) => {
  test.slow();
  const lists = await adminApi(request, await adminToken(request)).call<{ id: string; typeId: string; title: string }[]>("get", "/instances");
  const wordList = lists.find((i) => i.typeId === "word-list" && i.title === "Parole di Agenti Segreti")?.id;
  expect(wordList, "lista di parole creata dal server al primo avvio").toBeDefined();
  const g = await newGame(config({ betSeconds: 0, enabledModules: { wires: false, button: false, symbols: false, colors: true, maze: true, word: true }, wordList }), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await startRound(g);

  const t1 = await tableOf(clients, "briefing");
  const expert = t1.experts[0]!;
  // il manuale ha le pagine dei tre moduli: colori, labirinti (3 pagine) e parole
  await expect(expert.page.getByTestId("art-manual")).toBeVisible();
  const titles = await expert.page.getByTestId("art-tab").allTextContents();
  expect(titles).toEqual(expect.arrayContaining(["Colori", "Parole", "Labirinti 1–3", "Labirinti 4–6", "Labirinti 7–9"]));
  await t1.defuser.page.getByTestId("art-start").click();
  await expect(screen.page.getByTestId("art-bomb")).toBeVisible();
  await expect(screen.page.getByTestId("art-colors")).toBeVisible();
  await expect(screen.page.getByTestId("art-maze")).toBeVisible();
  await expect(screen.page.getByTestId("art-wheels").getByTestId("art-wheel-letter")).toHaveCount(5);
  const solutions: string[] = hostInfo(admin).bomb.modules.map((m: any) => m.solution);
  const target = /Componi ([A-Z]{5})/.exec(solutions.find((s) => s.startsWith("Componi"))!)![1]!;

  for (const m of hostInfo(admin).bomb.modules) await solve(t1.defuser, screen, m);
  await expect(screen.page.getByTestId("art-outcome")).toHaveAttribute("data-result", "defused");
  await expect(screen.page.getByTestId("art-outcome")).toContainText("Moduli disinnescati: 3 / 3");

  // Privacy: la parola giusta, le sequenze e i muri non sono mai arrivati a TV e artificiere; la lista di parole solo agli esperti
  const defuserText = t1.defuser.traffic.text();
  expect(defuserText.includes(`"${target}"`), "parola giusta all'artificiere").toBe(false);
  expect(screen.traffic.text().includes(`"${target}"`), "parola giusta alla TV").toBe(false);
  for (const [who, c] of [["TV", screen], ["artificiere", t1.defuser]] as const) {
    const keys = keysOf(viewsIn(c, who === "TV" ? "game:screen" : "game:player"));
    for (const secret of ["cells", "words", "map", "rules", "solution"]) expect(keys.has(secret), `${who}: chiave «${secret}»`).toBe(false);
  }
  const wordsSeenByExpert = viewsIn(expert, "game:player").flatMap((v) => (v.me?.manual ?? []).flatMap((p: any) => p.blocks.filter((b: any) => b.type === "words").flatMap((b: any) => b.words)));
  expect(wordsSeenByExpert, "l'esperto ha l'elenco di parole").toContain(target);
  expect(new Set(wordsSeenByExpert).size, "elenco di 12 parole (facile)").toBe(12);
  // a fine turno si chiude la partita pulita
  await admin.page.getByTestId("art-host").getByTestId("art-host-end").click();
  await expect(screen.page.getByTestId("art-final")).toBeVisible();
  await admin.page.getByTestId("art-host").getByTestId("art-host-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});
