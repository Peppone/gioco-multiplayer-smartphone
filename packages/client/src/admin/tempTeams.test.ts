import { describe, expect, it } from "vitest";
import { type DraftTeam, MAX_TEMP_TEAMS, addTeam, fromTemp, moveMember, problem, removeTeam, splitRandom, toInput, toggleCaptain } from "./tempTeams";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
/** Generatore ripetibile per i test. */
const seeded = (seed: number) => () => ((seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296);

describe("squadre temporanee: sorteggio", () => {
  it("divide tutti i giocatori, una volta sola, in squadre che differiscono al massimo di uno", () => {
    for (const [players, count] of [[10, 3], [7, 2], [30, 6], [5, 5], [4, 8]] as const) {
      const teams = splitRandom(ids(players), count, seeded(players * count));
      expect(teams).toHaveLength(Math.min(count, MAX_TEMP_TEAMS));
      const all = teams.flatMap((t) => t.members);
      expect([...all].sort()).toEqual(ids(players).sort());
      const sizes = teams.map((t) => t.members.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it("dà nomi e colori diversi alle squadre", () => {
    const teams = splitRandom(ids(8), 4, seeded(1));
    expect(new Set(teams.map((t) => t.name)).size).toBe(4);
    expect(new Set(teams.map((t) => t.color)).size).toBe(4);
    expect(teams.every((t) => /^#[0-9a-f]{6}$/i.test(t.color))).toBe(true);
  });

  it("non tocca l'elenco originale e con semi diversi dà squadre diverse", () => {
    const original = ids(12);
    const a = splitRandom(original, 3, seeded(1));
    const b = splitRandom(original, 3, seeded(2));
    expect(original).toEqual(ids(12));
    expect(a.map((t) => t.members)).not.toEqual(b.map((t) => t.members));
  });

  it("il numero di squadre sta tra 1 e il massimo", () => {
    expect(splitRandom(ids(6), 0)).toHaveLength(1);
    expect(splitRandom(ids(30), 99)).toHaveLength(MAX_TEMP_TEAMS);
  });
});

describe("squadre temporanee: modifica a mano", () => {
  const base = (): DraftTeam[] => [
    { name: "Verdi", color: "#00aa00", members: ["a", "b"], captain: "a" },
    { name: "Gialli", color: "#ddcc00", members: ["c"] },
  ];

  it("spostare un giocatore lo toglie dalla squadra di prima e perde il ruolo di capitano", () => {
    const moved = moveMember(base(), "a", 1);
    expect(moved[0]).toMatchObject({ members: ["b"], captain: undefined });
    expect(moved[1]!.members).toEqual(["c", "a"]);
  });

  it("si può lasciare un giocatore senza squadra", () => {
    const moved = moveMember(base(), "b", null);
    expect(moved.flatMap((t) => t.members)).toEqual(["a", "c"]);
  });

  it("rimettere un giocatore nella sua squadra non cambia il capitano", () => {
    expect(moveMember(base(), "a", 0)[0]!.captain).toBe("a");
  });

  it("il capitano si imposta e si toglie con lo stesso comando", () => {
    const on = toggleCaptain(base(), 1, "c");
    expect(on[1]!.captain).toBe("c");
    expect(toggleCaptain(on, 1, "c")[1]!.captain).toBeUndefined();
    expect(toggleCaptain(base(), 0, "b")[0]!.captain).toBe("b"); // sostituisce il vecchio
  });

  it("aggiungere e togliere squadre rispetta i limiti", () => {
    let d = base();
    while (d.length < MAX_TEMP_TEAMS) d = addTeam(d);
    expect(addTeam(d)).toBe(d);
    expect(removeTeam(base(), 0).map((t) => t.name)).toEqual(["Gialli"]);
  });
});

describe("squadre temporanee: invio", () => {
  it("scarta le squadre vuote, ripulisce i nomi e tiene il capitano solo se è un membro", () => {
    const input = toInput([
      { name: " Verdi ", color: "#00aa00", members: ["a", "b"], captain: "a" },
      { name: "Vuota", color: "#111111", members: [] },
      { name: "Gialli", color: "#ddcc00", members: ["c"], captain: "zzz" },
    ]);
    expect(input).toEqual([
      { name: "Verdi", color: "#00aa00", members: ["a", "b"], captain: "a" },
      { name: "Gialli", color: "#ddcc00", members: ["c"] },
    ]);
  });

  it("spiega perché non si può applicare", () => {
    const ok = [{ name: "A", color: "#000000", members: ["a"] }];
    expect(problem(ok)).toBeNull();
    expect(problem([])).toMatch(/almeno un giocatore/);
    expect(problem([{ ...ok[0]!, members: [] }])).toMatch(/almeno un giocatore/);
    expect(problem([{ ...ok[0]!, name: "  " }])).toMatch(/nome/);
    expect(problem([{ ...ok[0]!, name: "x".repeat(25) }])).toMatch(/troppo lungo/);
    expect(problem([ok[0]!, { ...ok[0]!, name: "a", members: ["b"] }])).toMatch(/Due squadre si chiamano/);
    // una squadra vuota con lo stesso nome non dà fastidio: si scarta
    expect(problem([ok[0]!, { ...ok[0]!, members: [] }])).toBeNull();
  });

  it("riprende le squadre già attive per modificarle", () => {
    const draft = fromTemp([{ id: "temp-1", name: "Verdi", color: "#00aa00", members: ["a"], captain: "a" }]);
    expect(draft).toEqual([{ name: "Verdi", color: "#00aa00", members: ["a"], captain: "a" }]);
  });
});
