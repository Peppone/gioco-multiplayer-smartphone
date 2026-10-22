import { expect } from "@playwright/test";
import { silentWav, uploadTone } from "./audio-support";
import { type Client, test } from "./support";

const nickOf = (c: Client) => c.page.getByRole("heading", { level: 1 }).innerText();

/** Un brano per categoria: basta a far scegliere la categoria ai capisquadra. */
async function songRound(request: Parameters<typeof uploadTone>[0]) {
  const files = [await uploadTone(request, "t1.wav", silentWav()), await uploadTone(request, "t2.wav", silentWav()), await uploadTone(request, "t3.wav", silentWav())];
  return {
    typeId: "indovina-canzone",
    title: "Squadre temporanee e2e",
    config: { songs: files.map((audio, i) => ({ audio, answer: `T${i}`, categories: [`Cat ${i}`] })), pickCategory: true, pickSeconds: 60 },
  };
}

test("squadre temporanee: la regia le prepara a mano e sostituiscono quelle della serata nel round a squadre", async ({ newGame, request }) => {
  const g = await newGame([await songRound(request)], { playersPerTeam: 2 });
  const { admin, screen, reds, blues, teams } = g;
  const [ada, rosa] = [await nickOf(reds[0]!), await nickOf(reds[1]!)];
  const [bob, bea] = [await nickOf(blues[0]!), await nickOf(blues[1]!)];
  const panel = admin.page.locator("section.temp-teams");

  await expect(panel.getByText(/Per i round a squadre puoi sostituire/)).toBeVisible();
  await panel.getByRole("button", { name: "Prepara a mano" }).click();
  await panel.getByLabel("Nome della squadra 1").fill("Verdi");
  await panel.getByLabel("Nome della squadra 2").fill("Gialli");
  // Le squadre temporanee incrociano quelle della serata: Ada e Bob con i Verdi, Rosa e Bea con i Gialli.
  await panel.getByLabel(`Squadra temporanea di ${ada}`).selectOption("0");
  await panel.getByLabel(`Squadra temporanea di ${bob}`).selectOption("0");
  await panel.getByLabel(`Squadra temporanea di ${rosa}`).selectOption("1");
  await panel.getByLabel(`Squadra temporanea di ${bea}`).selectOption("1");
  await panel.getByRole("button", { name: `Capitano della squadra 1: ${bob}` }).click();
  await panel.getByRole("button", { name: `Capitano della squadra 2: ${bea}` }).click();
  await panel.getByRole("button", { name: "Applica" }).click();
  await expect(panel.getByText("Verdi", { exact: false }).first()).toBeVisible();
  await expect(panel.getByText(`👑 ${bob}`)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Torna alle squadre della serata" })).toBeVisible();

  // Nel round le squadre sono quelle temporanee: tra i Gialli (prima per nome) sceglie Bea.
  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText(`Tocca a Gialli: ${bea} sceglie la categoria!`)).toBeVisible();
  await expect(blues[1]!.page.getByRole("heading", { name: "Scegli la categoria!" })).toBeVisible();
  // Bob è capitano dei Verdi, ma ora tocca ai Gialli; e nella squadra della serata (Blu) non sceglie nessuno dei due per ruolo.
  await expect(blues[0]!.page.getByText("Sceglie la squadra Gialli…")).toBeVisible();
  // Ogni telefono riceve la squadra temporanea come sua squadra (durante il round il telefono mostra solo i comandi).
  await expect.poll(() => reds[0]!.traffic.text()).toContain('"teamName":"Verdi"');
  await expect.poll(() => reds[1]!.traffic.text()).toContain('"teamName":"Gialli"');

  // Finito il round, giocatori e punti tornano alle squadre della serata.
  await admin.page.getByRole("button", { name: "Termina il round ora" }).click();
  await expect(screen.page.getByText("Classifica dopo il round 1")).toBeVisible();
  await expect(reds[0]!.page.getByText(new RegExp(`· ${teams.red.name}`))).toBeVisible();
  await expect(screen.page.getByText(teams.red.name).first()).toBeVisible();
  await expect(screen.page.getByText("Verdi")).toHaveCount(0);

  // Si tolgono con un solo comando.
  await panel.getByRole("button", { name: "Torna alle squadre della serata" }).click();
  await expect(panel.getByRole("button", { name: "Sorteggia" })).toBeVisible();
});

test("squadre temporanee: il sorteggio divide tutti i giocatori in squadre e si può rifare prima di applicare", async ({ newGame, request }) => {
  const g = await newGame([await songRound(request)], { playersPerTeam: 2 });
  const { admin, screen } = g;
  const panel = admin.page.locator("section.temp-teams");

  await panel.getByLabel("Numero di squadre").fill("2");
  await panel.getByRole("button", { name: "Sorteggia" }).click();
  await expect(panel.getByLabel("Nome della squadra 1")).toHaveValue("Squadra 1");
  await expect(panel.getByLabel("Nome della squadra 2")).toHaveValue("Squadra 2");
  // Quattro giocatori, due per squadra, nessuno rimasto fuori.
  await expect(panel.getByLabel(/^Squadra temporanea di /)).toHaveCount(4);
  await expect(panel.getByText(/Senza squadra \(/)).toHaveCount(0);
  await panel.getByRole("button", { name: "Sorteggia di nuovo" }).click();
  await expect(panel.getByLabel(/^Squadra temporanea di /)).toHaveCount(4);

  // Due squadre con lo stesso nome non si applicano, e il motivo si legge.
  await panel.getByLabel("Nome della squadra 2").fill("squadra 1");
  await expect(panel.getByText(/Due squadre si chiamano/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Applica" })).toBeDisabled();
  await panel.getByLabel("Nome della squadra 2").fill("Squadra 2");
  await panel.getByRole("button", { name: "Applica" }).click();

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  await expect(screen.page.getByText(/Tocca a Squadra [12]:/)).toBeVisible();
});

test("squadre temporanee: un minigioco che non usa le squadre non le vede", async ({ newGame }) => {
  const g = await newGame([{ typeId: "vero-falso", title: "Raffica e2e", config: { statements: [{ text: "Il mare è salato.", answer: true }], timeSec: 20, revealSec: 2 } }], { playersPerTeam: 2 });
  const { admin, reds, teams } = g;
  const panel = admin.page.locator("section.temp-teams");
  await panel.getByRole("button", { name: "Sorteggia" }).click();
  await panel.getByRole("button", { name: "Applica" }).click();
  await expect(panel.getByRole("button", { name: "Torna alle squadre della serata" })).toBeVisible();

  await admin.page.getByRole("button", { name: /Avvia round 1/ }).click();
  // Il round è cominciato (il telefono mostra i comandi) e il giocatore è ancora nella sua squadra della serata.
  await expect(reds[0]!.page.locator("main.controller:not(.waiting)")).toBeVisible();
  const traffic = reds[0]!.traffic.text();
  expect(traffic).toContain(`"teamName":"${teams.red.name}"`);
  expect(traffic).not.toContain('"teamName":"Squadra');
});
