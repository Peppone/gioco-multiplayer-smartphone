import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { adminApi, adminToken, openAdmin, test } from "./support";

/**
 * Prova facoltativa con gli schemi VERI dell'app ufficiale, dal browser: si attiva solo con `PIANETA_SCHEMI_APP` (la cartella
 * `assets/www/assets/maps` di una copia dell'app, fuori dal progetto). Senza, viene saltata.
 */
const folder = process.env.PIANETA_SCHEMI_APP;
test.skip(!folder, "indicare la cartella degli schemi in PIANETA_SCHEMI_APP");

const CODES: Record<number, string> = { 0: "empty", 1: "asteroid", 2: "dwarf", 3: "comet", 4: "gas", 9: "planetX" };

test("schemi veri: import dalla regia di tutta la cartella e una partita con uno schema vero", async ({ newGame, request, browser }) => {
  test.slow();
  const token = await adminToken(request);
  const api = adminApi(request, token);
  try {
    // ---- Import dall'interfaccia ----
    const admin = await openAdmin(browser, token);
    await admin.page.getByRole("button", { name: "Libreria", exact: true }).click();
    await admin.page.getByRole("button", { name: "+ Il Pianeta Nascosto" }).click();
    const panel = admin.page.getByTestId("px-schemi");
    await panel.getByTestId("px-schemi-folder").fill(folder!);
    await panel.getByTestId("px-schemi-import").click();
    await expect(panel.getByTestId("px-schemi-summary")).toContainText("Importati 7739, rifiutati 0", { timeout: 60_000 });
    await expect(panel.getByTestId("px-schemi-status")).toContainText("Importati: 3199 Base e 4540 Esperto");
    await admin.context.close();

    // ---- Una partita con uno schema Esperto vero: la regia vede esattamente il suo sistema ----
    const code = "A2A2";
    const real = JSON.parse(readFileSync(join(folder!, `${code}.json`), "utf8")) as { obj: Record<string, number> };
    const expected = Object.keys(real.obj).map(Number).sort((a, b) => a - b).map((k) => CODES[real.obj[String(k)]!]);
    const g = await newGame(
      [{ typeId: "pianeta-nascosto", title: "Pianeta schema vero", theme: "retro80", config: { source: "official", code: code.toLowerCase(), bots: 1, turnSeconds: 0, theorySeconds: 0 } }],
      { playersPerTeam: 1 },
    );
    await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
    const host = g.admin.page.getByTestId("px-host");
    await host.getByTestId("px-host-unlock").click();
    await expect(host.getByTestId("px-host-solution").locator("ol li")).toHaveCount(expected.length);
    const kinds = await host.getByTestId("px-host-solution").locator("ol li").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
    expect(kinds).toEqual(expected);
    await expect(g.screen.page.getByTestId("px-wedge")).toHaveCount(expected.length);
    for (const c of [g.a, g.b, g.screen]) expect(c.traffic.text()).not.toContain(code);
    await host.getByTestId("px-host-end").click();
    await expect(g.screen.page.getByTestId("px-banner")).toContainText(`settore ${expected.indexOf("planetX") + 1}`);
  } finally {
    await api.call("delete", "/pianeta-schemi").catch(() => undefined);
  }
});
