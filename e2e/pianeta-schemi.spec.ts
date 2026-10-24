import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test as plain } from "@playwright/test";
import { fakeOfficialMap } from "../packages/minigames/src/pianeta-nascosto/official-map.fixtures";
import { generateFacts, generateSystem } from "../packages/minigames/src/pianeta-nascosto/system";
import { adminApi, adminToken, openAdmin, test } from "./support";

/** Una cartella con schemi inventati nel formato dell'app (nessun file dell'app nel progetto): due validi e uno rifiutato. */
function makeFolder() {
  const dir = mkdtempSync(join(tmpdir(), "px-schemi-"));
  const folder = join(dir, "maps");
  mkdirSync(folder);
  const systems = {
    E2E1: generateSystem("standard", 31),
    E2E2: generateSystem("expert", 32),
  };
  for (const [code, system] of Object.entries(systems)) {
    const mode = system.sky.length === 12 ? "standard" : "expert";
    writeFileSync(join(folder, `${code}.json`), JSON.stringify(fakeOfficialMap(system, generateFacts(system.sky, mode, 7, 5))));
  }
  const broken = fakeOfficialMap(systems.E2E1, generateFacts(systems.E2E1.sky, "standard", 7, 5)) as { obj: Record<string, number> };
  broken.obj["1"] = 9; // due Pianeti X
  writeFileSync(join(folder, "BAD3.json"), JSON.stringify(broken));
  writeFileSync(join(folder, "manifest.json"), "{}");
  return { dir, folder, systems };
}

plain("schemi dell'app ufficiale: la regia indica la cartella, i validi si importano e si cancellano", async ({ browser, request }) => {
  const { dir, folder } = makeFolder();
  const token = await adminToken(request);
  const admin = await openAdmin(browser, token);
  const { page } = admin;
  try {
    await page.getByRole("button", { name: "Libreria", exact: true }).click();
    await page.getByRole("button", { name: "+ Il Pianeta Nascosto" }).click();
    const panel = page.getByTestId("px-schemi");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("px-schemi-status")).toContainText("Nessuno schema importato");
    await expect(panel.getByTestId("px-schemi-import")).toBeDisabled();

    // cartella inesistente: errore chiaro
    await panel.getByTestId("px-schemi-folder").fill(join(dir, "non-c-e"));
    await panel.getByTestId("px-schemi-import").click();
    await expect(panel.getByTestId("px-schemi-error")).toContainText("Cartella non trovata");

    await panel.getByTestId("px-schemi-folder").fill(folder);
    await panel.getByTestId("px-schemi-import").click();
    await expect(panel.getByTestId("px-schemi-summary")).toContainText("Importati 2, rifiutati 1, ignorati 1");
    await expect(panel.getByTestId("px-schemi-summary")).toContainText("BAD3");
    await expect(panel.getByTestId("px-schemi-status")).toContainText("Importati: 1 Base e 1 Esperto");

    // l'istanza offre l'origine «Schema dell'app ufficiale» e il codice
    await expect(page.getByText("Origine del sistema", { exact: true })).toBeVisible();
    await expect(page.getByText("Codice dello schema", { exact: true })).toBeVisible();

    await panel.getByTestId("px-schemi-clear").click(); // la conferma si accetta da sola
    await expect(panel.getByTestId("px-schemi-status")).toContainText("Nessuno schema importato");
  } finally {
    await adminApi(request, token).call("delete", "/pianeta-schemi").catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("schemi dell'app ufficiale: una partita con uno schema importato usa il suo sistema; il codice è solo della regia", async ({ newGame, request }) => {
  test.slow();
  const { dir, folder, systems } = makeFolder();
  const api = adminApi(request, await adminToken(request));
  try {
    await api.call("post", "/pianeta-schemi/import", { folder });
    const g = await newGame(
      [{ typeId: "pianeta-nascosto", title: "Pianeta schema e2e", theme: "retro80", config: { source: "official", code: "e2e1", bots: 1, difficulty: "beginner", turnSeconds: 0, theorySeconds: 0 } }],
      { playersPerTeam: 1 },
    );
    await g.admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
    const host = g.admin.page.getByTestId("px-host");
    await expect(host).toBeVisible();

    // regia cieca: il codice e il sistema compaiono solo dopo lo sblocco; telefoni e schermo non li ricevono mai
    await expect(host.getByTestId("px-host-solution")).toHaveCount(0);
    await host.getByTestId("px-host-unlock").click();
    const solution = host.getByTestId("px-host-solution");
    await expect(solution).toBeVisible();
    const kinds = await solution.locator("ol li").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
    expect(kinds).toEqual(systems.E2E1.sky);
    for (const c of [g.a, g.b, g.screen]) expect(c.traffic.text()).not.toContain("E2E1");
    expect(g.admin.traffic.text()).toContain("E2E1");
    // le ricerche dello schema sono quelle della partita
    await expect(solution).toContainText(systems.E2E1.topics[0]!.id);

    await host.getByTestId("px-host-end").click();
    await expect(g.screen.page.getByTestId("px-banner")).toContainText("Il Pianeta X era nel settore");
    await expect(g.screen.page.getByTestId("px-banner")).toContainText(String(systems.E2E1.sky.indexOf("planetX") + 1));
  } finally {
    await api.call("delete", "/pianeta-schemi").catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }
});
