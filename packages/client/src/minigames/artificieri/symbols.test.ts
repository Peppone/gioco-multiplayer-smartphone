import { describe, expect, it } from "vitest";
import { SYMBOL_IDS } from "../../../../minigames/src/artificieri/modules/symbols";
import { SYMBOL_SHAPES } from "./symbols";

describe("simboli di Artificieri", () => {
  it("ogni simbolo del server ha il suo disegno nel client, e viceversa", () => {
    expect([...SYMBOL_SHAPES].sort()).toEqual([...SYMBOL_IDS].sort());
  });
});
