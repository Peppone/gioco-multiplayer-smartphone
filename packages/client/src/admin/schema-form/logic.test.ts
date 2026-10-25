import { describe, expect, it } from "vitest";
import { type JsonSchema, defaultValue, isShown, moveItem, parseImport, serializeInstance, setKey } from "./logic";

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
  it("costruisce un oggetto con i campi obbligatori, quelli con default e i minimi richiesti", () => {
    expect(defaultValue(quizSchema)).toEqual({
      questions: [{ text: "", options: ["", ""], correctIndex: 0 }],
      defaultTimeSec: 20, // ha un valore predefinito: si include; i facoltativi (timeSec) no
    });
  });

  it("usa il default dello schema e ne fa una copia indipendente", () => {
    const schema: JsonSchema = { type: "array", default: [1, 2] };
    const a = defaultValue(schema) as number[];
    a.push(3);
    expect(defaultValue(schema)).toEqual([1, 2]);
  });

  it("include anche i campi con valore predefinito (un nuovo elemento nasce valido)", () => {
    const schema: JsonSchema = {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        kind: { type: "string", enum: ["options", "players"], default: "options" },
        options: { type: "array", default: ["Sì", "No"], items: { type: "string" } },
        note: { type: "string" },
      },
    };
    expect(defaultValue(schema)).toEqual({ text: "", kind: "options", options: ["Sì", "No"] });
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

describe("isShown (campi che dipendono da un altro)", () => {
  const parent: JsonSchema = {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["inherit", "loops", "speed"], default: "inherit" },
      pause: { type: "number", showWhen: { field: "mode", in: ["loops"] } },
      rate: { type: "number", showWhen: { field: "mode", in: ["speed", "loops"] } },
      title: { type: "string" },
    },
  };
  const shown = (key: string, siblings: Record<string, unknown>) => isShown(parent.properties![key]!, siblings, parent);

  it("senza condizione il campo si vede sempre", () => {
    expect(shown("title", {})).toBe(true);
    expect(shown("title", { mode: "loops" })).toBe(true);
  });

  it("compare solo con i valori indicati", () => {
    expect(shown("pause", { mode: "loops" })).toBe(true);
    expect(shown("pause", { mode: "speed" })).toBe(false);
    expect(shown("rate", { mode: "speed" })).toBe(true);
    expect(shown("rate", { mode: "loops" })).toBe(true);
  });

  it("se il campo da cui dipende manca, vale il suo predefinito", () => {
    expect(shown("pause", {})).toBe(false);
    expect(shown("rate", {})).toBe(false);
    const withDefault: JsonSchema = { ...parent, properties: { ...parent.properties!, mode: { type: "string", default: "loops" } } };
    expect(isShown(withDefault.properties!.pause!, {}, withDefault)).toBe(true);
  });
});
