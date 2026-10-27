import { describe, expect, it } from "vitest";
import type { InstanceView, MinigameTypeView } from "@gioco/shared";
import { categoryOf, countByCategory, groupInstances, groupTypes, matchesInstance } from "./libraryList";

const type = (id: string, title: string, kind: "minigame" | "content" = "minigame"): MinigameTypeView => ({
  id,
  kind,
  title,
  defaultTheme: "gameshow",
  sampleConfig: {},
  configJsonSchema: {},
});
const inst = (id: string, typeId: string, title: string): InstanceView => ({ id, typeId, title, theme: "gameshow", config: {} });

const TYPES = [
  type("quiz-multipla", "Quiz a scelta multipla"),
  type("buzzer", "Buzzer"),
  type("artificieri", "Artificieri"),
  type("zombie-hunt", "Zombie Hunt"),
  type("deck", "Mazzo di carte (Duello)", "content"),
  type("sconosciuto", "Gioco nuovo"),
];
const typeOf = (id: string) => TYPES.find((t) => t.id === id);
const theme = () => "Game show";

const ALL = [
  inst("1", "zombie-hunt", "Notte di Halloween"),
  inst("2", "quiz-multipla", "Quiz anni 80"),
  inst("3", "deck", "Carte base"),
  inst("4", "buzzer", "Buzzer Natale"),
  inst("5", "quiz-multipla", "Cultura generale"),
  inst("6", "sconosciuto", "Prova"),
  inst("7", "artificieri", "Bomba facile"),
];

describe("famiglie", () => {
  it("assegna ogni tipo alla sua famiglia; i contenuti restano a parte e i tipi nuovi vanno in «Altri»", () => {
    expect(categoryOf(typeOf("quiz-multipla"))).toBe("quiz");
    expect(categoryOf(typeOf("artificieri"))).toBe("coop");
    expect(categoryOf(typeOf("deck"))).toBe("content");
    expect(categoryOf(typeOf("sconosciuto"))).toBe("other");
    expect(categoryOf(undefined)).toBe("other");
  });

  it("raggruppa i tipi per famiglia e li ordina per nome", () => {
    const groups = groupTypes(TYPES);
    expect(groups.map((g) => g.category)).toEqual(["quiz", "coop", "azione", "content", "other"]);
    expect(groups[0]!.types.map((t) => t.id)).toEqual(["buzzer", "quiz-multipla"]);
  });
});

describe("ricerca", () => {
  it("cerca nel titolo, nel tipo e nel tema, ignorando maiuscole e accenti", () => {
    expect(matchesInstance(ALL[3]!, typeOf("buzzer"), "Game show", "NATALE")).toBe(true);
    expect(matchesInstance(ALL[1]!, typeOf("quiz-multipla"), "Game show", "scelta multipla anni")).toBe(true);
    expect(matchesInstance(ALL[1]!, typeOf("quiz-multipla"), "Game show", "game")).toBe(true);
    expect(matchesInstance(ALL[1]!, typeOf("quiz-multipla"), "Game show", "natale")).toBe(false);
    expect(matchesInstance(ALL[1]!, typeOf("quiz-multipla"), "Game show", "  ")).toBe(true);
  });
});

describe("elenco raggruppato", () => {
  it("mette le famiglie nell'ordine fisso e dentro ognuna ordina per tipo e poi per titolo", () => {
    const groups = groupInstances(ALL, typeOf, theme, "");
    expect(groups.map((g) => g.category)).toEqual(["quiz", "coop", "azione", "content", "other"]);
    // Buzzer prima di Quiz a scelta multipla (nome del tipo), poi i quiz in ordine alfabetico di titolo.
    expect(groups[0]!.instances.map((i) => i.title)).toEqual(["Buzzer Natale", "Cultura generale", "Quiz anni 80"]);
  });

  it("filtra con la ricerca e con la famiglia, senza famiglie vuote", () => {
    expect(groupInstances(ALL, typeOf, theme, "natale").map((g) => g.category)).toEqual(["quiz"]);
    expect(groupInstances(ALL, typeOf, theme, "", "coop").flatMap((g) => g.instances.map((i) => i.id))).toEqual(["7"]);
    expect(groupInstances(ALL, typeOf, theme, "zzz")).toEqual([]);
  });

  it("conta per famiglia le istanze che passano la ricerca", () => {
    expect(countByCategory(ALL, typeOf, theme, "")).toEqual({ quiz: 3, squadre: 0, coop: 1, azione: 1, content: 1, other: 1 });
    expect(countByCategory(ALL, typeOf, theme, "quiz")).toMatchObject({ quiz: 2, coop: 0 });
  });
});
