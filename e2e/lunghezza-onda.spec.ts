import { type Locator, type Page, expect } from "@playwright/test";
import { type Client, lastPlayerView, test } from "./support";

const config = (extra: Record<string, unknown>) => [
  {
    typeId: "lunghezza-onda",
    title: "Onda e2e",
    theme: "gameshow",
    config: { pickSeconds: 60, clueSeconds: 120, guessSeconds: 120, counterSeconds: 60, zoneWidth: 5, edgeMargin: 10, unitPoints: 25, counterPoints: 1, ...extra },
  },
];

const view = (c: Client) => lastPlayerView(c.traffic)!;

/** Tutte le viste del round (oggetti con `phase` e `turn`) arrivate a una pagina con un certo evento. */
function viewsIn(c: Client, event: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, any>;
    if (typeof o.phase === "string" && o.turn && typeof o.turn === "object" && "psychic" in o.turn) out.push(o);
    for (const v of Object.values(o)) walk(v);
  };
  for (const line of c.traffic.text().split("\n")) if (line.startsWith(`42["${event}"`)) walk(JSON.parse(line.slice(2))[1]);
  return out;
}

/** Gli input `dial` inviati da una pagina, con l'istante di invio. */
const dialsSent = (c: Client) => c.traffic.sent().filter((f) => f.payload.startsWith('42["game:input"') && f.payload.includes('"type":"dial"'));

/** Coordinate sullo schermo della posizione `pos` (0–100) del quadrante, a metà raggio (come in onda-preview.spec.ts). */
async function dialPoint(svg: Locator, pos: number) {
  const box = (await svg.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + (box.height * 100) / 110;
  const r = ((box.width * 92) / 200) * 0.6;
  const a = Math.PI * (1 - pos / 100);
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

/** Trascina il quadrante del telefono da dove si trova a `to` (20 passi); restituisce quanto è durato il trascinamento. */
async function dragTo(page: Page, to: number): Promise<number> {
  const svg = page.getByTestId("lo-dial");
  await svg.scrollIntoViewIfNeeded();
  const from = await dialPoint(svg, Number(await page.getByTestId("lo-pos").innerText()));
  const end = await dialPoint(svg, to);
  await page.mouse.move(from.x, from.y);
  const t0 = Date.now();
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 20 });
  await page.mouse.up();
  const ms = Date.now() - t0;
  await expect.poll(async () => Math.abs(Number(await page.getByTestId("lo-pos").innerText()) - to)).toBeLessThanOrEqual(1.5);
  return ms;
}

/**
 * Chi è il Sensitivo del turno appena iniziato, letto dalle viste ricevute dai telefoni. Si aspetta che tutti siano
 * nella scelta dello spettro dello stesso turno: subito dopo «Avanti» qualche telefono ha ancora la vista della
 * rivelazione, dove il Sensitivo è quello del turno prima.
 */
async function psychicOf(clients: Client[]): Promise<{ psychic: Client; others: Client[] }> {
  await expect
    .poll(() => {
      const vs = clients.map((c) => view(c));
      return vs.every((v) => v?.phase === "pick" && v.turn.number === vs[0]!.turn.number) ? vs.filter((v) => v.me.role === "psychic").length : -1;
    })
    .toBe(1);
  const psychic = clients.find((c) => view(c).me.role === "psychic")!;
  return { psychic, others: clients.filter((c) => c !== psychic) };
}

async function pickAndClue(psychic: Client, clue: string) {
  await psychic.page.getByTestId("lo-options").locator(".lo-option").first().click();
  await psychic.page.getByTestId("lo-clue-input").fill(clue);
  await psychic.page.getByRole("button", { name: "Invia" }).click();
}

const hostButton = (admin: Client, name: string) => admin.page.getByRole("button", { name, exact: true });

test("lunghezza d'onda, tutti contro tutti: spettro, indizio rifiutato dalla regia, quadranti, rivelazione e turno saltato", async ({ newGame }) => {
  test.slow();
  const g = await newGame(config({ mode: "tutti", turns: 2 }), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();

  const { psychic, others } = await psychicOf(clients);
  await expect(screen.page.getByText("Il Sensitivo sceglie lo spettro…")).toBeVisible();
  await expect(psychic.page.getByTestId("lo-options").locator(".lo-option")).toHaveCount(2);
  await pickAndClue(psychic, "Prima prova");
  await expect(screen.page.getByTestId("lo-clue")).toContainText("Prima prova");

  // La regia rifiuta l'indizio: il Sensitivo ne scrive un altro.
  await hostButton(admin, "Indizio non valido").click();
  await expect(psychic.page.getByTestId("lo-clue-input")).toBeVisible();
  await expect(screen.page.getByTestId("lo-clue")).toHaveCount(0);
  await psychic.page.getByTestId("lo-clue-input").fill("Il caffè del bar");
  await psychic.page.getByRole("button", { name: "Invia" }).click();
  await expect(screen.page.getByTestId("lo-clue")).toContainText("Il caffè del bar");

  // Il bersaglio lo conosce il Sensitivo: dal suo telefono.
  await expect.poll(() => view(psychic).me.target).toBeDefined();
  const target = view(psychic).me.target as number;
  await expect(psychic.page.getByTestId("lo-bands")).toHaveAttribute("data-target", String(target));

  // Gli altri trascinano il quadrante e confermano: il primo vicino al bersaglio, gli altri lontano.
  const spots = [target, target > 50 ? 15 : 85, 50];
  for (const [i, c] of others.entries()) {
    const before = dialsSent(c).length;
    await dragTo(c.page, spots[i]!);
    // tutti contro tutti la posizione parte una volta sola, al rilascio del dito (gli altri non la vedono)
    await expect.poll(() => dialsSent(c).length - before).toBe(1);
    await c.page.getByTestId("lo-confirm").click();
  }
  await expect(screen.page.getByTestId("lo-results")).toBeVisible();
  await expect(screen.page.getByTestId("lo-bands")).toHaveAttribute("data-target", String(target));
  await expect(screen.page.locator(".lo-best li").first()).toContainText("+100");
  await expect(others[0]!.page.getByTestId("lo-my-result")).toContainText("+100");

  // Privacy: prima della rivelazione il bersaglio non arriva a schermo e giocatori, né le posizioni altrui.
  const early = (v: Record<string, any>) => ["pick", "clue", "guess"].includes(v.phase);
  for (const [who, c, event] of [["schermo", screen, "game:screen"], ...others.map((o, i) => [`giocatore ${i + 1}`, o, "game:player"])] as [string, Client, string][]) {
    const views = viewsIn(c, event).filter(early);
    expect(views.length, who).toBeGreaterThan(0);
    for (const v of views) {
      expect(JSON.stringify(v), `${who}: bersaglio in ${v.phase}`).not.toContain('"target"');
      expect(v.teamDials, `${who}: posizioni altrui in ${v.phase}`).toBeNull();
    }
  }
  const psychicViews = viewsIn(psychic, "game:player").filter((v) => v.phase === "pick");
  expect(psychicViews.every((v) => !("target" in v.me)), "il bersaglio arriva solo dopo la scelta dello spettro").toBe(true);

  // Secondo turno: la regia lo salta; finiti i turni c'è la classifica.
  await hostButton(admin, "Avanti").click();
  await expect(screen.page.getByText("Il Sensitivo sceglie lo spettro…")).toBeVisible();
  await hostButton(admin, "Salta il turno").click();
  await expect(screen.page.getByTestId("lo-final")).toBeVisible();
  await hostButton(admin, "Concludi").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
});

test("lunghezza d'onda a squadre: mediana dal vivo, scommessa, recupero e fine al punteggio", async ({ newGame }) => {
  test.slow();
  const g = await newGame(config({ mode: "squadre", targetScore: 6, catchUp: true, turns: 0 }), { playersPerTeam: 2 });
  const { screen, admin } = g;
  const clients = [...g.reds, ...g.blues];
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();

  /** Un turno: il Sensitivo sceglie e scrive; il compagno va a `aim(target)`; gli avversari scommettono (se c'è la scommessa). */
  async function turn(aim: (target: number) => number, bet: "right" | "wrong") {
    const { psychic } = await psychicOf(clients);
    const teamId = view(psychic).me.teamId as string;
    const mate = clients.find((c) => c !== psychic && view(c).me.teamId === teamId)!;
    const rivals = clients.filter((c) => view(c).me.teamId !== teamId);
    await pickAndClue(psychic, "Indizio di squadra");
    await expect.poll(() => view(psychic).me.target).toBeDefined();
    const target = view(psychic).me.target as number;
    const pos = aim(target);
    const before = dialsSent(mate).length;
    const ms = await dragTo(mate.page, pos);
    // A squadre la posizione parte anche durante il trascinamento, ma al massimo ogni 250 ms, più l'invio al rilascio.
    // Si contano gli invii rispetto alla durata del gesto (gli istanti dei frame visti dal test arrivano in ritardo
    // variabile sotto carico, quindi non si misurano gli intervalli).
    await expect.poll(() => dialsSent(mate).length - before).toBeGreaterThanOrEqual(2);
    const sent = dialsSent(mate).length - before;
    expect(sent, `${sent} invii in ${ms} ms di trascinamento`).toBeLessThanOrEqual(Math.floor(ms / 250) + 2);
    // la mediana della squadra (un solo compagno: la sua posizione) si vede dal vivo sulla TV
    const shown = Number(await mate.page.getByTestId("lo-pos").innerText());
    await expect(screen.page.getByTestId("lo-needle")).toHaveAttribute("data-pos", String(shown));
    await mate.page.getByTestId("lo-confirm").click();
    {
      // la scommessa c'è sempre (gli avversari votano); vale solo se la squadra di turno non ha fatto 4
      await expect(screen.page.getByTestId("lo-counter-info")).toBeVisible();
      const correct = target < shown ? "left" : "right";
      const dir = bet === "right" ? correct : correct === "left" ? "right" : "left";
      for (const r of rivals) await r.page.locator(`[data-dir="${dir}"]`).click();
    }
    await expect(screen.page.getByTestId("lo-results")).toBeVisible();
    return { teamId, target };
  }

  const scores = () => screen.page.getByTestId("lo-scores");
  const scoreOf = async (teamId: string) => Number(await scores().locator(`[data-team="${teamId}"] b`).innerText());

  // Turno 1: la squadra di turno sbaglia di molto (0), gli avversari scommettono giusto (+1).
  const t1 = await turn((t) => (t > 50 ? 5 : 95), "right");
  expect(await scoreOf(t1.teamId)).toBe(0);
  const other = clients.map((c) => view(c).me.teamId as string).find((id) => id !== t1.teamId)!;
  expect(await scoreOf(other)).toBe(1);
  await hostButton(admin, "Avanti").click();

  // Turno 2: l'altra squadra fa centro (+4) e va a 5; la scommessa non vale.
  const t2 = await turn((t) => t, "right");
  expect(t2.teamId).toBe(other);
  expect(await scoreOf(other)).toBe(5);
  await hostButton(admin, "Avanti").click();

  // Turno 3: la prima squadra fa centro (4) ma è ancora dietro (4 contro 5): turno di recupero subito dopo.
  const t3 = await turn((t) => t, "wrong");
  expect(t3.teamId).toBe(t1.teamId);
  expect(await scoreOf(t1.teamId)).toBe(4);
  await hostButton(admin, "Avanti").click();
  await expect(screen.page.locator(".lo-turn")).toContainText("recupero");

  // Turno 4 (recupero): un altro centro, 8 ≥ 6: vince la prima squadra.
  const t4 = await turn((t) => t, "wrong");
  expect(t4.teamId).toBe(t1.teamId);
  await hostButton(admin, "Avanti").click();
  await expect(screen.page.getByTestId("lo-final")).toContainText("Vince la squadra");
  await expect(screen.page.getByTestId("lo-final").locator("li").first()).toContainText("8");
  await hostButton(admin, "Concludi").click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  // in classifica ogni punto del quadrante vale 25 per ogni membro: 8 × 25 = 200
  const rows = screen.page.locator(".lb-table", { hasText: "Giocatori" }).locator("li");
  await expect(rows.first().locator(".pts")).toHaveText("200");
});
