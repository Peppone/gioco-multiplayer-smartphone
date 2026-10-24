import { describe, expect, it } from "vitest";
import { type S, autoPlay, ctxFor, plugin, start } from "./test-helpers.js";

/**
 * Anti-leak per non interferenza (piano, §5.6): ciò che appartiene a una squadra (fatti, registro, appunti, proposte, scelte,
 * gettoni) e il sistema vero non devono cambiare le viste di chi non può vederli. Si confrontano le viste di prima e dopo aver
 * alterato quei dati.
 */
type Plugin = typeof plugin;
type Views = Record<string, unknown>;

const viewsOf = (p: Plugin, s: S): Views => ({
  screen: p.screenView(s),
  phoneB: p.viewFor(s, "b1", "tb"),
  host: p.hostView(s).info,
});

const rotate = <T,>(list: T[], by: number): T[] => list.map((_, i) => list[(i + by) % list.length]!);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Alterazioni dei dati privati della squadra «a». */
const privateOf = (): ((s: S) => S)[] => {
  const mapA = (patch: (o: S["observatories"][number]) => Partial<S["observatories"][number]>) => (x: S): S => ({
    ...x,
    observatories: x.observatories.map((o) => (o.members.includes("a1") ? { ...o, ...patch(o) } : o)),
  });
  return [
    mapA(() => ({ facts: [{ sector: 1, absent: "gas" as const }] })),
    mapA((o) => ({ log: o.log.map((l) => ({ ...l, result: l.result.type === "survey" ? { type: "survey" as const, count: l.result.count + 1 } : l.result })) })),
    mapA(() => ({ notes: { "1:asteroid": "supposed" as const } })),
    mapA(() => ({ proposals: [], draft: [], guess: null })),
  ];
};

function violations(p: Plugin, s: S): string[] {
  const base = viewsOf(p, s);
  const out: string[] = [];
  // La squadra «a» ha dati privati: lo schermo e la squadra «b» non dipendono da quelli.
  privateOf().forEach((alter, i) => {
    const after = viewsOf(p, alter(s));
    for (const key of ["screen", "phoneB"]) if (!same(after[key], base[key])) out.push(`privato#${i} cambia ${key} (fase ${s.phase})`);
  });
  // Il sistema vero: prima della rivelazione non cambia nessuna vista pubblica; la regia cieca nemmeno.
  if (!["reveal", "final", "done"].includes(s.phase)) {
    const after = viewsOf(p, { ...s, sky: rotate(s.sky, 5) });
    for (const key of ["screen", "phoneB", "host"]) if (!same(after[key], base[key])) out.push(`il sistema cambia ${key} (fase ${s.phase})`);
    // Gli oggetti delle teorie coperte di «a» non si vedono né sullo schermo né dall'altra squadra.
    const flipped: S = {
      ...s,
      theories: s.theories.map((t) => (t.faceUp || !s.observatories.find((o) => o.id === t.ownerId)?.members.includes("a1") ? t : { ...t, object: t.object === "gas" ? "asteroid" : "gas" })),
    };
    const v = viewsOf(p, flipped);
    for (const key of ["screen", "phoneB"]) if (!same(v[key], base[key])) out.push(`le teorie coperte cambiano ${key}`);
  }
  return out;
}

describe("pianeta-nascosto: anti-leak", () => {
  it.each([["standard", 1], ["standard", 2], ["expert", 3]] as const)("%s (seme %i): nessuna fuga durante tutta la partita", { timeout: 120_000 }, (mode, seed) => {
    const found: string[] = [];
    const s0 = start({ mode, bots: 1, turnSeconds: 0, theorySeconds: 0, difficulty: "youth" }, seed, ctxFor(seed, [2, 2]));
    let last = "";
    const { s } = autoPlay(s0, {
      each: (state) => {
        // Si controlla a ogni cambiamento di fase o di avanzamento: abbastanza da coprire ogni passaggio.
        const key = `${state.phase}${state.observatories.reduce((a, o) => a + o.log.length + o.time + o.draft.length, 0)}${state.theories.length}`;
        if (key === last) return;
        last = key;
        found.push(...violations(plugin, state));
      },
    });
    expect(s.phase).toBe("done");
    expect(found).toEqual([]);
  });

  it("la regia cieca non vede sistema, fatti né risultati finché non è sbloccata", () => {
    let s = start({ bots: 0 });
    const blind = JSON.stringify(plugin.hostView(s).info);
    expect(blind).not.toContain('"solution"');
    expect(blind).not.toContain('"facts"');
    expect(blind).not.toContain('"log"');
    s = plugin.onHostCommand(s, plugin.commandSchema.parse({ type: "unlock-solution" }), 1);
    const open = JSON.stringify(plugin.hostView(s).info);
    expect(open).toContain('"solution"');
    expect(open).toContain('"facts"');
    expect(JSON.stringify(plugin.hostView(start({ blindHost: false })).info)).toContain('"solution"');
  });

  it("lo schermo non mostra mai il testo di una ricerca né delle conferenze non tenute", () => {
    const screen = JSON.stringify(plugin.screenView(start({}, 5)));
    expect(screen).not.toMatch(/è adiacente|è entro|è direttamente|stanno in una fascia|in settori consecutivi/);
    expect(screen).not.toContain('"sky"');
  });

  it("test sul test: il controllo segnala una fuga inventata in ogni vista", () => {
    const s = start({}, 4);
    const leak = (field: "screenView" | "viewFor"): Plugin =>
      ({ ...plugin, [field]: (st: S, ...args: unknown[]) => ({ ...(plugin[field] as (...a: unknown[]) => object)(st, ...args), oops: st.sky.indexOf("planetX") }) }) as unknown as Plugin;
    expect(violations(plugin, s)).toEqual([]);
    expect(violations(leak("screenView"), s).length).toBeGreaterThan(0);
    expect(violations(leak("viewFor"), s).length).toBeGreaterThan(0);
    const leakyHost = { ...plugin, hostView: (st: S) => ({ ...plugin.hostView(st), info: { ...(plugin.hostView(st).info as object), oops: st.sky[0] } }) } as unknown as Plugin;
    expect(violations(leakyHost, s).length).toBeGreaterThan(0);
    const leakyFacts = { ...plugin, viewFor: (st: S, id: string, t: string | null) => ({ ...(plugin.viewFor(st, id, t) as object), oops: st.observatories.find((o) => o.members.includes("a1"))!.facts }) } as unknown as Plugin;
    expect(violations(leakyFacts, s).length).toBeGreaterThan(0);
  });
});
