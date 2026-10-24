import { describe, expect, it } from "vitest";
import { makeRng } from "../knight-duel/rng.js";
import { emptyKnowledge, solve } from "./solver.js";
import { type Seen, generateSky, neighbors, placementErrors } from "./sky.js";

describe("pianeta-nascosto: risolutore", () => {
  it("misura i sistemi validi in Base senza conoscenze", () => {
    const t = Date.now();
    const r = solve(emptyKnowledge("standard"), { maxNodes: 50_000_000 });
    console.log("Base: sistemi", r.skies.length, "nodi", r.nodes, "ms", Date.now() - t, r.complete);
    expect(r.complete).toBe(true);
    expect(r.skies.every((s) => placementErrors(s).length === 0)).toBe(true);
  });
  it("Esperto: nodi e tempo con limite", () => {
    const t = Date.now();
    const r = solve(emptyKnowledge("expert"), { maxNodes: 2_000_000 });
    console.log("Esperto: sistemi", r.skies.length, "nodi", r.nodes, "ms", Date.now() - t, r.complete);
  });
  it("una localizzazione fallita elimina quella combinazione dalle possibilità", () => {
    const all = solve(emptyKnowledge("standard"), { maxNodes: 50_000_000 });
    const sky = all.skies[0]!;
    const x = sky.indexOf("planetX") + 1;
    const [l, r] = neighbors(x, 12);
    const k = { ...emptyKnowledge("standard"), failedLocations: [{ sector: x, left: sky[l - 1] as Seen, right: sky[r - 1] as Seen }] };
    const after = solve(k, { maxNodes: 50_000_000 });
    expect(after.skies.length).toBeLessThan(all.skies.length);
    expect(after.skies.some((s) => s.join() === sky.join())).toBe(false);
    for (const s of after.skies) expect(s.indexOf("planetX") + 1 === x && s[l - 1] === sky[l - 1] && s[r - 1] === sky[r - 1]).toBe(false);
  });

  it("il generatore produce sistemi validi", () => {
    for (let seed = 1; seed <= 200; seed++) for (const mode of ["standard", "expert"] as const) expect(placementErrors(generateSky(mode, makeRng(seed)))).toEqual([]);
  });
});
