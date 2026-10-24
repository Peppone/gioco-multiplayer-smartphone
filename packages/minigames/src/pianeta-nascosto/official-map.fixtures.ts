import { type Clue, clueLabel } from "./clues.js";
import type { ObjectKind } from "./sky.js";
import type { Fact, System } from "./system.js";

/**
 * Solo per i test: scrive un sistema generato nel formato degli schemi dell'app ufficiale (l'inverso di `parseOfficialMap`),
 * così i test non hanno bisogno di nessun file dell'app. I codici oggetto sono quelli dell'app.
 */
const CODE: Record<ObjectKind, number> = { empty: 0, asteroid: 1, dwarf: 2, comet: 3, gas: 4, planetX: 9 };

const TYPE: Record<Clue["kind"], string> = {
  someAdjacent: "confClue1PlusXAdjacentY",
  noneAdjacent: "confClueNoXWithin1Y",
  allAdjacent: "confClueAllXWithin1Y",
  allWithin: "confClueAllXWithinNY",
  noneWithin: "confClueNoXWithinNY",
  someOpposite: "confClue1PlusXOppositeY",
  noneOpposite: "confClueNoXOppositeY",
  allOpposite: "confClueAllXOppositeY",
  band: "confClueAllXWithinN",
  allConsecutive: "confClueAllXConsecutive",
  someConsecutive: "confClueNXConsecutive",
  xWithin: "confClue9WithinNY",
  xNotWithin: "confClue9NotWithinNY",
  xNotAdjacent: "confClue9NotWithin1Y",
  xNotOpposite: "confClue9NotOppositeY",
};

function entry(clue: Clue) {
  const X = "a" in clue ? CODE[clue.a] : CODE.planetX;
  const Y = "b" in clue ? CODE[clue.b] : null;
  const N = "n" in clue ? clue.n : "kind" in clue && clue.kind === "xNotAdjacent" ? 1 : null;
  return { title: clueLabel(clue).map((k) => CODE[k]), body: { type: TYPE[clue.kind], X, Y, ...(N !== null && { N }) } };
}

export function fakeOfficialMap(system: System, facts: Fact[][][]): Record<string, unknown> {
  const obj = Object.fromEntries(system.sky.map((k, i) => [String(i + 1), CODE[k]]));
  const conf = Object.fromEntries([...system.topics.map((t) => [t.id, entry(t.clue)] as const), ...system.conferences.map((c) => [c.id, entry(c.clue)] as const)]);
  const info = Object.fromEntries(
    facts.slice(0, 5).map((series, i) => [
      "ABCDE"[i]!,
      Object.fromEntries(series.map((block, b) => [String(b + 1), block.map((f) => ({ [String(f.sector)]: CODE[f.absent] }))])),
    ]),
  );
  return { obj, conf, info };
}
