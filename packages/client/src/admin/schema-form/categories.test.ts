import { describe, expect, it } from "vitest";
import { addCategory, categoryList, categoryProblem, removeCategory, renameCategory, syncCatalog, toggleSongCategory, uncategorizedCount } from "./categories";

const root = () => ({
  categories: ["Rock", "Pop"],
  songs: [
    { answer: "1", categories: ["Rock"] },
    { answer: "2", categories: ["Rock", "Anni 80"] },
    { answer: "3", categories: [] },
    { answer: "4" },
  ],
  rounds: [
    { selection: "fixed", category: "Rock", songs: 2 },
    { selection: "teams", songs: 1 },
  ],
});

describe("gestore delle categorie", () => {
  it("elenca prima il catalogo, poi le categorie usate dai brani, con il numero di brani", () => {
    expect(categoryList(root())).toEqual([
      { name: "Rock", songs: 2 },
      { name: "Pop", songs: 0 },
      { name: "Anni 80", songs: 1 },
    ]);
    expect(uncategorizedCount(root())).toBe(2);
  });

  it("le maiuscole non creano categorie diverse", () => {
    const r = { categories: ["rock"], songs: [{ categories: ["ROCK", " Rock "] }] };
    expect(categoryList(r)).toEqual([{ name: "rock", songs: 1 }]);
  });

  it("aggiunge una categoria al catalogo e rifiuta vuoti, doppioni e «Altri brani»", () => {
    expect(addCategory(root(), "  Jazz ")?.categories).toEqual(["Rock", "Pop", "Jazz"]);
    expect(addCategory(root(), "")).toBeNull();
    expect(addCategory(root(), "rock")).toBeNull();
    expect(addCategory(root(), "Anni 80")).toBeNull(); // c'è già nei brani
    expect(addCategory(root(), "altri brani")).toBeNull();
    expect(addCategory(root(), "x".repeat(31))).toBeNull();
    expect(categoryProblem(root(), "rock")).toMatch(/esiste già/);
  });

  it("rinominare cambia il nome nel catalogo, nei brani e nei round che la fissano", () => {
    const next = renameCategory(root(), "Rock", "Rock'n'roll")!;
    expect(next.categories).toEqual(["Rock'n'roll", "Pop", "Anni 80"]);
    expect((next.songs as any[]).map((s) => s.categories)).toEqual([["Rock'n'roll"], ["Rock'n'roll", "Anni 80"], [], undefined]);
    expect((next.rounds as any[])[0].category).toBe("Rock'n'roll");
    expect((next.rounds as any[])[1]).not.toHaveProperty("category");
  });

  it("si può cambiare solo la maiuscola, ma non prendere il nome di un'altra categoria", () => {
    expect(renameCategory(root(), "Rock", "ROCK")?.categories).toEqual(["ROCK", "Pop", "Anni 80"]);
    expect(renameCategory(root(), "Rock", "pop")).toBeNull();
    expect(renameCategory(root(), "Rock", "  ")).toBeNull();
  });

  it("eliminare toglie la categoria dai brani (che restano) e svuota i round che la fissavano", () => {
    const next = removeCategory(root(), "rock");
    expect(next.categories).toEqual(["Pop"]);
    expect((next.songs as any[]).map((s) => s.categories)).toEqual([[], ["Anni 80"], [], undefined]);
    expect((next.songs as any[]).map((s) => s.answer)).toEqual(["1", "2", "3", "4"]);
    expect((next.rounds as any[])[0]).toEqual({ selection: "fixed", songs: 2 });
  });

  it("completa il catalogo con le categorie dei brani salvati prima, e non fa nulla se è già completo", () => {
    const old = { songs: [{ categories: ["Rock"] }, { categories: ["Pop", "rock"] }] };
    expect(syncCatalog(old).categories).toEqual(["Rock", "Pop"]);
    const full = { categories: ["Rock", "Pop"], songs: old.songs };
    expect(syncCatalog(full)).toBe(full);
    const noSongs = { categories: [] };
    expect(syncCatalog(noSongs)).toBe(noSongs);
  });

  it("attiva e toglie una categoria a un brano, senza doppioni e al massimo cinque", () => {
    const song = { answer: "x", categories: ["Rock"] };
    expect(toggleSongCategory(song, "Pop", true).categories).toEqual(["Rock", "Pop"]);
    expect(toggleSongCategory(toggleSongCategory(song, "Pop", true), "pop", true).categories).toEqual(["Rock", "Pop"]);
    expect(toggleSongCategory(song, "rock", false).categories).toEqual([]);
    const full = { categories: ["a", "b", "c", "d", "e"] };
    expect(toggleSongCategory(full, "f", true).categories).toHaveLength(5);
  });
});
