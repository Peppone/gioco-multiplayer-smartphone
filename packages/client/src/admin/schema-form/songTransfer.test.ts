import { describe, expect, it } from "vitest";
import { buildBundle, fromConfig, mergeBundle, mergeMessage, parseBundle } from "./songTransfer";

const A = "aaaaaaaa-1111-4111-8111-111111111111.mp3";
const B = "bbbbbbbb-1111-4111-8111-111111111111.mp3";
const song = (audio: string, answer: string, extra: Record<string, unknown> = {}) => ({ audio, answer, categories: [], effects: [], ...extra });

describe("esporta e importa i brani", () => {
  it("l'esportazione porta effetti, ascolto e categorie; si può esportare solo una parte", () => {
    const root = { categories: ["Pop", "Rock"], songs: [song(A, "Uno", { categories: ["Pop"], effects: [{ type: "echo", amount: 120 }], playback: "loops" }), song(B, "Due", { categories: ["Rock"] })] };
    const all = buildBundle(root);
    expect(all.songs).toHaveLength(2);
    expect(all.songs[0]).toMatchObject({ playback: "loops", effects: [{ type: "echo", amount: 120 }] });
    const part = buildBundle(root, [1]);
    expect(part.songs.map((s) => s.answer)).toEqual(["Due"]);
    expect(part.categories).toEqual(["Rock"]);
  });

  it("legge un file di brani, un'istanza esportata dalla libreria o la sola configurazione; rifiuta il resto", () => {
    const bundle = buildBundle({ categories: [], songs: [song(A, "Uno")] });
    expect(parseBundle(JSON.stringify(bundle)).songs).toHaveLength(1);
    expect(parseBundle(JSON.stringify({ title: "x", config: { songs: [song(A, "Uno")] } })).songs).toHaveLength(1);
    expect(() => parseBundle("non json")).toThrow(/JSON/);
    expect(() => parseBundle(JSON.stringify({ foo: 1 }))).toThrow(/brani/);
    expect(fromConfig({ songs: [{ answer: "senza sorgente" }, song(A, "Uno")] }).songs).toHaveLength(1);
  });

  it("l'unione aggiunge in fondo, salta i doppioni e unisce le categorie senza maiuscole doppie", () => {
    const root = { categories: ["Pop"], songs: [song(A, "Uno", { categories: ["Pop"] })] };
    const bundle = fromConfig({ categories: ["pop", "Rock"], songs: [song(A, "uno"), song(B, "Due", { categories: ["Rock", "Anni 80"] })] });
    const r = mergeBundle(root, bundle, 1000);
    expect(r).toMatchObject({ added: 1, duplicates: 1, skipped: 0, newCategories: 2 });
    expect((r.root.songs as { answer: string }[]).map((s) => s.answer)).toEqual(["Uno", "Due"]);
    expect(r.root.categories).toEqual(["Pop", "Rock", "Anni 80"]);
    expect(mergeMessage(r)).toContain("Importati 1 brani");
  });

  it("rispetta il massimo di brani", () => {
    const r = mergeBundle({ songs: [song(A, "Uno")] }, fromConfig({ songs: [song(B, "Due"), song(B, "Tre")] }), 2);
    expect(r).toMatchObject({ added: 1, skipped: 1 });
  });

  it("l'importazione non modifica la configurazione di partenza", () => {
    const root = { songs: [song(A, "Uno")], categories: [] };
    const copy = structuredClone(root);
    mergeBundle(root, fromConfig({ songs: [song(B, "Due")] }), 1000);
    expect(root).toEqual(copy);
  });
});
