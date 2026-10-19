import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { adminToken, openAdmin, unique } from "./support";

const LIST_TYPE = "+ Lista di parole (Reazione a catena, Agenti Segreti)";

test.describe("liste di parole nella libreria (nel database)", () => {
  test("la lista di Agenti Segreti è nel database dal primo avvio e si apre come testo, una parola per riga", async ({ browser, request }) => {
    const { page } = await openAdmin(browser, await adminToken(request));
    await page.getByRole("button", { name: "Libreria" }).click();
    const row = page.locator(".library ul.list li", { hasText: "Parole di Agenti Segreti" });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "Modifica" }).click();
    const words = page.getByRole("textbox", { name: "Parole" });
    await expect(page.getByTestId("lines-count")).toHaveText("(300)");
    expect((await words.inputValue()).split("\n").slice(0, 3)).toEqual(["Albero", "Ancora", "Angelo"]);
    // Nella lista d'esempio non ci sono doppioni né parole troppo lunghe.
    await expect(page.locator(".field.lines [role=alert]")).toHaveCount(0);
    await page.getByRole("button", { name: "Annulla" }).click();
  });

  test("aggiungere, correggere, salvare ed esportare le parole (JSON e testo)", async ({ browser, request }) => {
    const { page } = await openAdmin(browser, await adminToken(request));
    const title = unique("Frutta");
    await page.getByRole("button", { name: "Libreria" }).click();
    await page.getByRole("button", { name: LIST_TYPE }).click();
    await page.getByPlaceholder("Titolo (es. Quiz anni 80)").fill(title);

    // Si scrive (o si incolla) un elenco: righe vuote e spazi non contano, i doppioni si segnalano.
    const words = page.getByRole("textbox", { name: "Parole" });
    await words.fill("Mela\nPera\n\n  Uva  \nmela");
    await expect(page.getByTestId("lines-count")).toHaveText("(4)");
    await expect(page.locator(".field.lines [role=alert]")).toContainText("Doppioni (contano una volta): mela");
    // si corregge sul posto: l'ultima riga diventa un'altra parola
    await words.fill("Mela\nPera\nUva\nKiwi");
    await expect(page.locator(".field.lines [role=alert]")).toHaveCount(0);
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Salvato.")).toBeVisible();

    // Riaperta, la lista è quella salvata nel database; se ne aggiunge una e si salva di nuovo.
    const row = page.locator(".library ul.list li", { hasText: title });
    await row.getByRole("button", { name: "Modifica" }).click();
    await expect(words).toHaveValue("Mela\nPera\nUva\nKiwi");
    await words.press("Control+End");
    await words.pressSequentially("\nFico");
    await expect(page.getByTestId("lines-count")).toHaveText("(5)");

    // Scarica come testo: una parola per riga
    const [txt] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Scarica come testo (.txt)" }).click()]);
    expect(await readFile((await txt.path())!, "utf8")).toBe("Mela\nPera\nUva\nKiwi\nFico\n");
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText("Salvato.")).toBeVisible();

    // Esporta in JSON (lo stesso formato si reimporta dalla libreria)
    const [json] = await Promise.all([page.waitForEvent("download"), row.getByRole("button", { name: "Esporta" }).click()]);
    const exported = JSON.parse(await readFile((await json.path())!, "utf8"));
    expect(exported).toMatchObject({ kind: "gioco-ros/instance", typeId: "word-list", title, config: { words: ["Mela", "Pera", "Uva", "Kiwi", "Fico"] } });

    // Un'istanza di Agenti Segreti la sceglie dal menu delle liste.
    await page.getByRole("button", { name: "+ Agenti Segreti" }).click();
    await expect(page.getByLabel("Lista di parole (facoltativo)").locator("option", { hasText: title })).toHaveCount(1);
    await expect(page.getByLabel("Lista di parole (facoltativo)").locator("option", { hasText: "Parole di Agenti Segreti" })).toHaveCount(1);
    await page.getByRole("button", { name: "Annulla" }).click();
  });
});
