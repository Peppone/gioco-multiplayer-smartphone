import { describe, expect, it } from "vitest";
import { type JsonSchema, defaultValue, moveItem, parseImport, serializeInstance, setKey } from "./logic";

const quizSchema: JsonSchema = {
  type: "object",
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["text", "options", "correctIndex"],
        properties: {
          text: { type: "string" },
          options: { type: "array", minItems: 2, items: { type: "string" } },
          correctIndex: { type: "integer", minimum: 0 },
          timeSec: { type: "integer", minimum: 5 },
        },
      },
    },
    defaultTimeSec: { type: "integer", default: 20 },
  },
};

describe("defaultValue", () => {
  it("costruisce un oggetto con i soli campi obbligatori e i minimi richiesti", () => {
    expect(defaultValue(quizSchema)).toEqual({
      questions: [{ text: "", options: ["", ""], correctIndex: 0 }],
    });
  });

  it("usa il default dello schema e ne fa una copia indipendente", () => {
    const schema: JsonSchema = { type: "array", default: [1, 2] };
    const a = defaultValue(schema) as number[];
    a.push(3);
    expect(defaultValue(schema)).toEqual([1, 2]);
  });

  it("gestisce enum, booleani e numeri con minimo", () => {
    expect(defaultValue({ enum: ["x", "y"] })).toBe("x");
    expect(defaultValue({ type: "boolean" })).toBe(false);
    expect(defaultValue({ type: "integer", minimum: 5 })).toBe(5);
    expect(defaultValue({ type: "integer", minimum: -3 })).toBe(0);
  });
});

describe("moveItem / setKey", () => {
  it("sposta senza modificare l'originale e ignora i bordi", () => {
    const list = ["a", "b", "c"];
    expect(moveItem(list, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(list, 2, 1)).toBe(list);
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(list).toEqual(["a", "b", "c"]);
  });

  it("rimuove la chiave se il valore è undefined", () => {
    expect(setKey({ a: 1, b: 2 }, "a", undefined)).toEqual({ b: 2 });
    expect(setKey({ a: 1 }, "b", 3)).toEqual({ a: 1, b: 3 });
  });
});

describe("import / export", () => {
  const inst = { typeId: "quiz-multipla", title: "Quiz", theme: "gameshow", config: { questions: [] } };

  it("round trip di un'istanza", () => {
    const r = parseImport(serializeInstance(inst));
    expect(r).toEqual({ ok: true, instances: [inst] });
  });

  it("accetta un array (libreria intera)", () => {
    const text = JSON.stringify([JSON.parse(serializeInstance(inst)), JSON.parse(serializeInstance({ ...inst, title: "B" }))]);
    const r = parseImport(text);
    expect(r.ok && r.instances.map((i) => i.title)).toEqual(["Quiz", "B"]);
  });

  it("rifiuta JSON non valido, file estranei e dati incompleti", () => {
    expect(parseImport("{non json")).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ foo: 1 }))).toMatchObject({ ok: false });
    expect(parseImport("[]")).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ kind: "gioco-ros/instance", version: 1, typeId: "x" }))).toMatchObject({ ok: false });
  });
});
