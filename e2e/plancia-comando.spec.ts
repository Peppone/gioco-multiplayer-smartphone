import { expect } from "@playwright/test";
import { type Client, lastPlayerView, test } from "./support";

const config = (extra: Record<string, unknown> = {}) => [
  {
    typeId: "plancia-comando",
    title: "Plancia e2e",
    theme: "retro80",
    config: { mode: "squadre", sectors: 2, sectorSeconds: 60, controlsPerPanel: 4, orderSeconds: 6, minOrderSeconds: 5, ownShare: 20, damagePerMiss: 10, events: false, ...extra },
  },
];

const view = (c: Client) => lastPlayerView(c.traffic)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tutte le viste di una pagina con un certo evento che hanno `phase` e `settings` (le viste della regia/schermo di questo gioco). */
function viewsIn(c: Client, event: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, any>;
    if (typeof o.phase === "string" && o.settings && typeof o.settings === "object" && "crews" in o) out.push(o);
    for (const v of Object.values(o)) walk(v);
  };
  for (const line of c.traffic.text().split("\n")) if (line.startsWith(`42["${event}"`)) walk(JSON.parse(line.slice(2))[1]);
  return out;
}

const hostInfo = (admin: Client): Record<string, any> => viewsIn(admin, "game:admin").at(-1)!;
const screenInfo = (screen: Client): Record<string, any> => viewsIn(screen, "game:screen").at(-1)!;

function keysOf(values: unknown[], acc = new Set<string>()): Set<string> {
  for (const v of values) {
    if (Array.isArray(v)) keysOf(v, acc);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (acc.add(k), keysOf([x], acc));
  }
  return acc;
}

interface Control {
  id: string;
  name: string;
  kind: "button" | "toggle" | "slider" | "selector";
  options: string[];
  value: number;
}

/**
 * Esegue l'ordine di `holder` come farebbe l'equipaggio: chi ha il comando nominato (di solito un compagno) lo porta al valore giusto
 * dal proprio telefono. Ritorna il comando usato, o null se non c'è un ordine o il comando non si trova.
 */
async function execute(holder: Client, crew: Client[]): Promise<Control | null> {
  const order = view(holder).me?.order as { text: string } | null | undefined;
  if (!order) return null;
  for (const c of crew) {
    const control = (view(c).me?.controls as Control[]).find((k) => order.text.includes(k.name));
    if (!control) continue;
    const phone = c.page;
    const box = phone.getByTestId("pdc-control").filter({ hasText: control.name });
    if (control.kind === "button") await box.click();
    else if (control.kind === "toggle") await phone.getByRole("switch", { name: control.name }).click();
    else if (control.kind === "slider") {
      const target = Number(/ a (\d)!/.exec(order.text)![1]);
      const slider = phone.getByRole("slider", { name: control.name });
      await slider.focus();
      await slider.press("Home");
      for (let i = 0; i < target; i++) await slider.press("ArrowRight");
    } else {
      const option = control.options.find((o) => order.text.includes(` su ${o}!`))!;
      await phone.getByRole("radiogroup", { name: control.name }).getByRole("radio", { name: option, exact: true }).click();
    }
    return control;
  }
  return null;
}

const crewOf = (clients: Client[], id: string) => clients.filter((c) => view(c).crew?.id === id);

test("plancia di comando: ordini eseguiti dai compagni, ordine scaduto, salto di settore, regia, senza far trapelare i pannelli", async ({ newGame }) => {
  test.slow();
  const g = await newGame(config(), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];

  await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  const host = admin.page.getByTestId("pdc-host");
  await expect(host).toBeVisible();

  // ---- Pronti al decollo: niente pannelli prima del via ----
  await expect.poll(() => clients.every((c) => view(c)?.phase === "ready" && view(c).me)).toBe(true);
  await expect(screen.page.getByTestId("pdc-sector")).toContainText("Pronti");
  for (const c of clients) await expect(c.page.getByTestId("pdc-status")).toContainText("Pronti al decollo");
  await expect(host.getByTestId("pdc-host-crew")).toHaveCount(2);
  await expect(host.getByTestId("pdc-host-launch")).toBeEnabled();
  await host.getByTestId("pdc-host-launch").click();

  // ---- Settore 1: 4 comandi a testa, un ordine a testa, e solo i propri ----
  await expect.poll(() => clients.every((c) => view(c)?.phase === "sector" && view(c).me.controls.length === 4)).toBe(true);
  for (const c of clients) await expect(c.page.getByTestId("pdc-control")).toHaveCount(4);
  await expect(screen.page.getByTestId("pdc-lane")).toHaveCount(2);
  await expect(screen.page.getByTestId("pdc-sector")).toContainText("Settore 1/2");
  const crewIds = [...new Set(clients.map((c) => view(c).crew.id as string))];
  expect(crewIds).toHaveLength(2);
  const [crewA, crewB] = crewIds.map((id) => crewOf(clients, id)) as [Client[], Client[]];
  expect(crewA).toHaveLength(2);
  expect(crewB).toHaveLength(2);

  // i nomi dei comandi di un equipaggio non compaiono mai sui telefoni dell'altro
  const names = (cs: Client[]) => cs.flatMap((c) => (view(c).me.controls as Control[]).map((k) => k.name));
  const namesA = names(crewA);
  const namesB = names(crewB);
  expect(new Set(namesA).size, "nomi tutti diversi nell'equipaggio").toBe(namesA.length);
  expect(namesA.filter((n) => namesB.includes(n)), "stessi nomi in equipaggi diversi").toEqual([]);

  // ---- L'equipaggio A esegue alcuni ordini dai telefoni; il B non fa nulla e li lascia scadere ----
  const doneBefore = screenInfo(screen).crews.find((c: any) => c.id === crewIds[0]).done;
  let executed = 0;
  const kinds = new Set<string>();
  for (let round = 0; round < 12 && executed < 5; round++) {
    for (const holder of crewA) {
      const used = await execute(holder, crewA);
      if (used) {
        executed++;
        kinds.add(used.kind);
      }
    }
    await sleep(250);
  }
  expect(executed, "ordini eseguiti dall'equipaggio A").toBeGreaterThanOrEqual(5);
  await expect.poll(() => screenInfo(screen).crews.find((c: any) => c.id === crewIds[0]).done, { timeout: 15_000 }).toBeGreaterThanOrEqual(doneBefore + 5);
  await expect(screen.page.getByTestId("pdc-done").first()).toContainText("✔");
  // l'ultimo ordine eseguito compare sulla TV con un po' di ritardo
  const laneA = screen.page.getByTestId("pdc-lane").and(screen.page.locator(`[data-team="${crewIds[0]}"]`));
  await expect(laneA.getByTestId("pdc-last")).not.toHaveText("…", { timeout: 10_000 });

  // B: gli ordini scadono (6 s), lo scafo cala del 10% a ordine e lo vedono i suoi telefoni
  await expect.poll(() => screenInfo(screen).crews.find((c: any) => c.id === crewIds[1]).missed, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  const hull = screenInfo(screen).crews.find((c: any) => c.id === crewIds[1]).hull as number;
  expect(hull).toBeLessThan(100);
  await expect(crewB[0]!.page.getByTestId("pdc-my-hull")).toContainText(/🛡 \d+%/);
  await expect.poll(() => view(crewB[0]!).crew.hull).toBeLessThan(100);

  // ---- Regia: vede l'ordine di ogni membro, segna un telefono fuori uso e i comandi passano al compagno ----
  const memberB = hostInfo(admin).crews.find((c: any) => c.id === crewIds[1]).memberList[0];
  const mateB = crewB.find((c) => view(c).me.id !== memberB.id)!;
  const mateIdsBefore = (view(mateB).me.controls as Control[]).map((k) => k.id).join(",");
  await host.getByTestId("pdc-host-crew").nth(hostInfo(admin).crews.findIndex((c: any) => c.id === crewIds[1])).getByTestId("pdc-host-inactive").first().click();
  const outPhone = crewB.find((c) => view(c).me.id === memberB.id)!;
  await expect.poll(() => view(outPhone).me.inactive).toBe(true);
  await expect(outPhone.page.getByTestId("pdc-status")).toContainText("fuori uso");
  await expect(outPhone.page.getByTestId("pdc-control")).toHaveCount(0);
  // i pannelli dei compagni si rifanno: nessun ordine nomina più i comandi del telefono fuori uso
  await expect.poll(() => (view(mateB).me.controls as Control[]).map((k) => k.id).join(",")).not.toBe(mateIdsBefore);
  expect(view(mateB).me.controls as Control[]).toHaveLength(4);
  // lo rimette in gioco
  await host.getByTestId("pdc-host-crew").nth(hostInfo(admin).crews.findIndex((c: any) => c.id === crewIds[1])).getByTestId("pdc-host-inactive").first().click();
  await expect.poll(() => view(outPhone).me.inactive).toBe(false);

  // ---- Salto: tutti i pannelli si rifanno ----
  const idsBefore = (view(crewA[0]!).me.controls as Control[]).map((k) => k.id).join(",");
  await host.getByTestId("pdc-host-skip").click();
  await expect(screen.page.getByTestId("pdc-jump")).toBeVisible();
  await expect.poll(() => clients.every((c) => view(c).phase === "jump")).toBe(true);
  for (const c of clients) await expect(c.page.getByTestId("pdc-status")).toContainText("pannelli nuovi");
  await expect.poll(() => clients.every((c) => view(c).phase === "sector" && view(c).sector === 2), { timeout: 15_000 }).toBe(true);
  expect((view(crewA[0]!).me.controls as Control[]).map((k) => k.id).join(","), "pannelli rifatti").not.toBe(idsBefore);
  await expect(screen.page.getByTestId("pdc-sector")).toContainText("Settore 2/2");

  // ---- Pausa: i comandi si bloccano ----
  await host.getByTestId("pdc-host-pause").click();
  await expect(screen.page.locator(".pdc-timer[data-paused]")).toBeVisible();
  await expect(crewA[0]!.page.getByTestId("pdc-control").first()).toBeDisabled();
  await host.getByTestId("pdc-host-resume").click();
  await expect(screen.page.locator(".pdc-timer[data-paused]")).toHaveCount(0);

  // ---- I telefoni non hanno mai ricevuto lo stato grezzo né le viste degli altri ----
  const SECRET = ["crews", "memberList", "target", "solution", "sectorEvent", "seed", "orders", "owner"];
  for (const c of clients) {
    const frames = c.traffic
      .text()
      .split("\n")
      .filter((l) => l.startsWith('42["game:player"'))
      .map((l) => JSON.parse(l.slice(2))[1]);
    const keys = keysOf(frames);
    for (const k of SECRET) expect(keys.has(k), `il telefono ha ricevuto la chiave «${k}»`).toBe(false);
  }
  const mine = new Set(names(crewA));
  const otherPhoneText = crewB[0]!.traffic.text();
  for (const n of mine) expect(otherPhoneText.includes(n), `il comando «${n}» dell'altro equipaggio è arrivato al telefono avversario`).toBe(false);

  // ---- Fine: «Termina il round» → classifica dell'equipaggio più lontano ----
  await host.getByTestId("pdc-host-end").click();
  await expect(screen.page.getByTestId("pdc-final")).toBeVisible();
  const rows = screen.page.getByTestId("pdc-final").locator("li");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("1°");
  await expect(crewA[0]!.page.getByTestId("pdc-result")).toContainText("° posto");
  await host.getByTestId("pdc-host-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});

test("plancia di comando: l'allarme generale chiede a tutti di premere il pulsante rosso", async ({ newGame }) => {
  test.slow();
  // un solo settore lungo e un evento per forza: l'allarme o il blackout scattano tra il 35% e il 65% del tempo
  const g = await newGame(config({ sectors: 1, sectorSeconds: 30, events: true, orderSeconds: 30, minOrderSeconds: 15 }), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  const host = admin.page.getByTestId("pdc-host");
  await host.getByTestId("pdc-host-launch").click();
  await expect.poll(() => hostInfo(admin).sectorEvent !== null, { timeout: 10_000 }).toBe(true);
  const kind = hostInfo(admin).sectorEvent.kind as "alarm" | "blackout";
  test.info().annotations.push({ type: "evento", description: kind });

  await expect(screen.page.getByTestId("pdc-event").first()).toBeVisible({ timeout: 25_000 });
  if (kind === "alarm") {
    await expect(screen.page.getByTestId("pdc-event").first()).toContainText("ALLARME");
    const one = g.reds[0]!;
    await expect(one.page.getByTestId("pdc-alarm")).toBeVisible();
    // un equipaggio preme con tutti i telefoni, l'altro con uno solo: il primo non ha danni, il secondo perde scafo
    const crew = crewOf(clients, view(one).crew.id);
    const otherCrew = clients.filter((c) => !crew.includes(c));
    const hullBefore = view(one).crew.hull as number;
    const otherBefore = view(otherCrew[0]!).crew.hull as number;
    await expect(otherCrew[0]!.page.getByTestId("pdc-alarm")).toBeVisible();
    // l'allarme dura 5 s: i telefoni premono insieme e senza attendere la «stabilità» del pulsante lampeggiante (con sei browser in parallelo ogni clic può costare secondi)
    await Promise.all([...crew, otherCrew[0]!].map((c) => c.page.getByTestId("pdc-alarm").click({ force: true })));
    await expect(otherCrew[0]!.page.getByTestId("pdc-alarm")).toBeDisabled();
    // chi ha premuto lo vede, a allarme risolto il pulsante sparisce
    await expect(one.page.getByTestId("pdc-alarm")).toHaveCount(0);
    await expect.poll(() => view(otherCrew[0]!).crew.hull, { timeout: 12_000 }).toBeLessThan(otherBefore);
    expect(view(one).crew.hull, "allarme risolto: nessun danno").toBe(hullBefore);
  } else {
    await expect(screen.page.getByTestId("pdc-event").first()).toContainText("BLACKOUT");
    await expect.poll(() => clients.some((c) => (view(c).me.controls as Control[]).some((k) => /^[A-Z]\.?([A-Z]\.?)*$/.test(k.name) || k.name.length <= 4))).toBe(true);
  }
  await host.getByTestId("pdc-host-end").click();
  await expect(screen.page.getByTestId("pdc-final")).toBeVisible();
  await host.getByTestId("pdc-host-next").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});
