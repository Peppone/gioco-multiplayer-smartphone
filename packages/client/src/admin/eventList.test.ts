import { describe, expect, it } from "vitest";
import type { EventListItem } from "@gioco/shared";
import { activityOf, countByActivity, groupEvents, matchesQuery } from "./eventList";

const event = (name: string, status: EventListItem["status"], createdAt: number, matches: [string, "pending" | "running" | "done"][] = []): EventListItem => ({
  id: name,
  name,
  status,
  createdAt,
  playerCount: 0,
  matches: matches.map(([matchName, matchStatus], i) => ({ id: `${name}-${i}`, order: i + 1, name: matchName, status: matchStatus, roundCount: 1 })),
});

const ALL = [
  event("Cena di Natale", "closed", 1, [["Finale", "done"]]),
  event("Compleanno di Anna", "draft", 5, [["Quiz", "pending"]]),
  event("Torneo del venerdì", "live", 4, [["Girone", "done"], ["Semifinale", "pending"]]),
  event("Serata giochi", "live", 6, [["Prima partita", "running"]]),
  event("Altra bozza", "draft", 7),
];

describe("tipo di serata", () => {
  it("una partita avviata rende la serata «in corso», sopra lo stato scelto dalla regia", () => {
    expect(activityOf(ALL[3]!)).toBe("running");
    expect(activityOf(ALL[2]!)).toBe("live");
    expect(activityOf(ALL[1]!)).toBe("draft");
    expect(activityOf(ALL[0]!)).toBe("closed");
  });
});

describe("ricerca", () => {
  it("trova per nome della serata o della partita, senza badare a maiuscole e accenti", () => {
    expect(matchesQuery(ALL[2]!, "VENERDI")).toBe(true);
    expect(matchesQuery(ALL[2]!, "semifinale")).toBe(true);
    expect(matchesQuery(ALL[2]!, "natale")).toBe(false);
    expect(matchesQuery(ALL[0]!, "NATÀLE")).toBe(true);
  });

  it("ogni parola cercata deve comparire, in qualunque ordine, anche fra serata e partita", () => {
    expect(matchesQuery(ALL[2]!, "torneo semifinale")).toBe(true);
    expect(matchesQuery(ALL[2]!, "semifinale torneo")).toBe(true);
    expect(matchesQuery(ALL[2]!, "torneo finale")).toBe(true); // «Semifinale» contiene «finale»
    expect(matchesQuery(ALL[2]!, "torneo quiz")).toBe(false);
  });

  it("una ricerca vuota o di soli spazi le trova tutte", () => {
    expect(matchesQuery(ALL[0]!, "")).toBe(true);
    expect(matchesQuery(ALL[0]!, "   ")).toBe(true);
  });
});

describe("gruppi", () => {
  it("in corso, attive, bozze, chiuse, ognuna dalla più recente", () => {
    const groups = groupEvents(ALL, "");
    expect(groups.map((g) => g.activity)).toEqual(["running", "live", "draft", "closed"]);
    expect(groups.map((g) => g.events.map((e) => e.name))).toEqual([
      ["Serata giochi"],
      ["Torneo del venerdì"],
      ["Altra bozza", "Compleanno di Anna"],
      ["Cena di Natale"],
    ]);
  });

  it("i gruppi vuoti non compaiono e il filtro tiene un gruppo solo", () => {
    expect(groupEvents(ALL, "natale").map((g) => g.activity)).toEqual(["closed"]);
    expect(groupEvents(ALL, "", "draft").map((g) => g.activity)).toEqual(["draft"]);
    expect(groupEvents(ALL, "natale", "draft")).toEqual([]);
    expect(groupEvents([], "")).toEqual([]);
  });

  it("non modifica l'elenco ricevuto", () => {
    const copy = [...ALL];
    groupEvents(ALL, "");
    expect(ALL).toEqual(copy);
  });

  it("i conteggi seguono la ricerca", () => {
    expect(countByActivity(ALL, "")).toEqual({ running: 1, live: 1, draft: 2, closed: 1 });
    expect(countByActivity(ALL, "serata")).toEqual({ running: 1, live: 0, draft: 0, closed: 0 });
  });
});
