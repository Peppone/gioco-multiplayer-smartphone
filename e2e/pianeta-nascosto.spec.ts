import { expect } from "@playwright/test";
import { type Client, lastPlayerView, test } from "./support";

const config = (extra: Record<string, unknown> = {}) => [
  {
    typeId: "pianeta-nascosto",
    title: "Pianeta e2e",
    theme: "retro80",
    config: { mode: "standard", turnSeconds: 0, theorySeconds: 0, difficulty: "youth", bots: 1, decision: "vote", maxDays: 0, ...extra },
  },
];

const view = (c: Client) => lastPlayerView(c.traffic)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** L'ultima vista dello schermo o della regia (dai frame WebSocket). */
function lastIn(c: Client, event: string): Record<string, any> | null {
  const lines = c.traffic.text().split("\n").filter((l) => l.startsWith(`42["${event}"`));
  let found: Record<string, any> | null = null;
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, any>;
    if (typeof o.phase === "string" && o.settings && Array.isArray(o.observatories)) found = o;
    for (const v of Object.values(o)) walk(v);
  };
  for (const line of lines) walk(JSON.parse(line.slice(2))[1]);
  return found;
}

function keysOf(values: unknown[], acc = new Set<string>()): Set<string> {
  for (const v of values) {
    if (Array.isArray(v)) keysOf(v, acc);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (acc.add(k), keysOf([x], acc));
  }
  return acc;
}

test("il pianeta nascosto: foglio condiviso, azione votata, teorie, rivelazione, senza far trapelare il sistema", async ({ newGame }) => {
  test.slow();
  const g = await newGame(config(), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  const redIds = g.reds.map((c) => c);
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  const host = admin.page.getByTestId("px-host");
  await expect(host).toBeVisible();

  // ---- Briefing: ruota a 12 settori, informazioni iniziali (12 per «Ragazzi»), regia cieca ----
  await expect.poll(() => clients.every((c) => view(c)?.phase === "briefing" && view(c).mine)).toBe(true);
  for (const c of clients) {
    await expect(c.page.getByTestId("px-wslice")).toHaveCount(12);
    expect(view(c).mine.facts).toHaveLength(12);
  }
  await expect(screen.page.getByTestId("px-wedge")).toHaveCount(12);
  await expect(screen.page.getByTestId("px-banner")).toContainText("Il Pianeta Nascosto");
  await expect(host.getByTestId("px-host-team")).toHaveCount(3); // due squadre e un robot
  await expect(host.getByTestId("px-host-solution")).toHaveCount(0);
  expect(admin.traffic.text()).not.toContain('"sky":[');

  // ---- Il foglio è condiviso nella squadra e privato per le altre ----
  const [a1, a2] = g.reds as [Client, Client];
  const [b1] = g.blues as [Client];
  // (un settore dove la squadra non ha già un fatto iniziale su un asteroide)
  const free = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((s) => !view(a1).mine.fixed[`${s}:asteroid`])!;
  const key = `${free}:asteroid`;
  await a1.page.locator(`[data-testid=px-wslice][data-sector='${free}']`).click();
  await a1.page.getByTestId("px-editor").locator("[data-kind=asteroid]").click();
  await expect.poll(() => view(a2).mine.notes[key]).toBe("excluded");
  expect(view(b1).mine.notes[key]).toBeUndefined();
  // (nei segni fissi della squadra B il settore può comparire per un suo fatto iniziale: conta solo il suo foglio)
  expect(b1.traffic.text()).not.toMatch(new RegExp(`"notes":\{[^}]*"${key}":"excluded"`));

  // ---- Via: i robot giocano da soli, le squadre di turno si sbloccano con la regia ----
  await host.getByTestId("px-host-start").click();
  const humanActing = (): Client[] => clients.filter((c) => view(c)?.phase === "turn" && view(c).mine?.acting);
  const driveToHumanTurn = async () => {
    await expect
      .poll(
        async () => {
          if (humanActing().length > 0) return true;
          if (lastIn(admin, "game:admin")?.phase === "turn" && !lastIn(admin, "game:admin")!.actingIds.some((id: string) => id.startsWith("bot-"))) return humanActing().length > 0;
          return false;
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  };
  await driveToHumanTurn();

  // La squadra di turno vede la scheda Azione, propone una ricerca, i due membri la votano e confermano.
  const teamClients = (c: Client) => clients.filter((x) => view(x).mine.id === view(c).mine.id);
  const actingTeam = teamClients(humanActing()[0]!);
  const otherTeam = clients.filter((c) => !actingTeam.includes(c));
  for (const c of actingTeam) await expect(c.page.getByTestId("px-tab-action")).toHaveAttribute("aria-selected", "true");
  for (const c of otherTeam) await expect(c.page.getByTestId("px-builder")).toHaveCount(0);
  await actingTeam[0]!.page.getByTestId("px-kind-research").click();
  await actingTeam[0]!.page.getByTestId("px-topic").first().click();
  await expect(actingTeam[0]!.page.getByTestId("px-proposal")).toHaveCount(1);
  await expect(actingTeam[1]!.page.getByTestId("px-proposal")).toHaveCount(1);
  for (const c of actingTeam) {
    await c.page.getByRole("button", { name: /👍/ }).click();
    await c.page.getByTestId("px-ready").click();
  }
  await expect.poll(() => view(actingTeam[0]!).mine.log.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  const researchText = view(actingTeam[0]!).mine.research[0].text as string;
  expect(researchText.length).toBeGreaterThan(10);
  await expect(actingTeam[1]!.page.getByTestId("px-tab-log")).toBeVisible();
  await actingTeam[1]!.page.getByTestId("px-tab-log").click();
  await expect(actingTeam[1]!.page.getByTestId("px-logbook")).toContainText("Ricerca A");
  // La TV annuncia l'azione scelta ma non il testo; gli altri non lo ricevono; la regia cieca nemmeno.
  await expect(screen.page.getByTestId("px-log")).toContainText("legge la ricerca");
  for (const who of [screen, admin, ...otherTeam]) expect(who.traffic.text(), "testo della ricerca").not.toContain(researchText);

  // ---- Si gioca finché non arriva la fase teoria: le squadre umane passano, i robot fanno il loro ----
  const phaseNow = () => lastIn(admin, "game:admin")?.phase as string;
  const skipUntil = async (done: () => boolean, timeout = 180_000) => {
    const end = Date.now() + timeout;
    while (!done() && Date.now() < end) {
      if (phaseNow() === "turn" && humanActing().length > 0) await host.getByTestId("px-host-skip").click();
      else if (phaseNow() === "conference") await host.getByTestId("px-host-next").click();
      await sleep(300);
    }
    expect(done(), "traguardo raggiunto in tempo").toBe(true);
  };
  await skipUntil(() => phaseNow() === "theory");
  for (const c of clients) await expect(c.page.getByTestId("px-tab-theory")).toHaveAttribute("aria-selected", "true");
  await expect(screen.page.getByTestId("px-banner")).toContainText("Fase teoria");
  const earth = lastIn(screen, "game:screen")!.earth as number;
  expect(earth % 12, "la prima fase teoria è al confine 3–4").toBe(3);
  await expect(screen.page.getByTestId("px-earth")).toHaveAttribute("data-earth-sector", "4");

  // Ogni squadra invia una teoria (un solo asteroide in un settore) e conferma con tutti i membri.
  for (const [i, team] of [g.reds, g.blues].entries()) {
    const phone = team[0]!.page;
    await phone.getByRole("group", { name: "Settore della teoria" }).getByRole("button", { name: `Settore ${i === 0 ? 9 : 10}` }).click();
    await phone.getByTestId("px-theory-asteroid").click();
    await expect(phone.getByTestId("px-draft")).toContainText(`settore ${i === 0 ? 9 : 10}`);
    // il telefono dei compagni vede la scelta (è la squadra a inviare), l'altra squadra no
    await expect.poll(() => view(team[1]!).mine.collect.draft.length).toBe(1);
  }
  expect(b1.traffic.text()).not.toContain('"sector":9,"object":"asteroid"');
  for (const c of clients) await c.page.getByTestId("px-theory-ready").click();
  await expect.poll(() => phaseNow(), { timeout: 20_000 }).not.toBe("theory");
  // Le teorie coperte sono sulla pista: colore e settore, mai l'oggetto (né nel DOM né nei frame della TV).
  // (due delle squadre e, se è già certo di qualcosa, una del robot)
  await expect.poll(() => screen.page.locator("[data-testid=px-token][data-face=down]").count()).toBeGreaterThanOrEqual(2);
  for (const token of await screen.page.locator("[data-testid=px-token][data-face=down]").all()) expect((await token.textContent())?.trim()).toBe("");
  const tvFrames = screen.traffic.text();
  expect(tvFrames).not.toContain('"sky"');
  expect(tvFrames).not.toContain('"facts"');
  expect(tvFrames).not.toContain('"notes"');
  const topKeys = keysOf(
    screen.traffic
      .text()
      .split("\n")
      .filter((l) => l.startsWith('42["game:screen"'))
      .map((l) => JSON.parse(l.slice(2))[1]),
  );
  for (const k of ["sky", "facts", "log", "notes", "proposals", "vote", "draft", "mine"]) expect(topKeys.has(k), `la TV ha ricevuto la chiave «${k}»`).toBe(false);
  for (const c of clients) {
    const keys = keysOf(
      c.traffic
        .text()
        .split("\n")
        .filter((l) => l.startsWith('42["game:player"'))
        .map((l) => JSON.parse(l.slice(2))[1]),
    );
    expect(keys.has("sky"), "un telefono ha ricevuto il sistema").toBe(false);
    expect(keys.has("solution")).toBe(false);
  }

  // ---- Regia: sblocca la soluzione (con conferma) ----
  await host.getByTestId("px-host-unlock").click();
  await expect(host.getByTestId("px-host-solution")).toBeVisible();
  await expect(host.getByTestId("px-host-solution").locator("li").first()).toBeVisible();
  expect(admin.traffic.text()).toContain('"sky":[');

  // ---- Fine: rivelazione, punteggio, classifica ----
  await host.getByTestId("px-host-end").click();
  await expect(screen.page.getByTestId("px-banner")).toContainText("Il Pianeta X era nel settore");
  await expect(screen.page.locator("[data-testid=px-wedge] [data-testid=px-object]")).toHaveCount(12);
  expect(lastIn(screen, "game:screen")!.sky).toHaveLength(12);
  await host.getByTestId("px-host-next").click();
  await expect(screen.page.getByTestId("px-scores")).toBeVisible();
  await expect(screen.page.getByTestId("px-score-row")).toHaveCount(3);
  await expect(redIds[0]!.page.getByTestId("px-result")).toContainText("° posto");
  await host.getByTestId("px-host-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});
