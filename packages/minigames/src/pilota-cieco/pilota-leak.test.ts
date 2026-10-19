import { describe, expect, it } from "vitest";
import { LAYERS, type Layer, pilotaCieco as plugin } from "./index.js";
import { PLAIN, type S, T0, autopilot, ctxFor, host, start, toRun } from "./test-helpers.js";

/**
 * Anti-leak di Pilota alla cieca: nella gara la TV, il pilota e chi guarda non devono avere mine, orari delle porte, chiavi
 * non raccolte o pattuglie; ogni navigatore solo gli strati che ha, e solo della propria corsia. A fine gara (`level-end`)
 * si scopre tutto, di proposito. La regia vede tutto.
 */

const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const LANE_PUBLIC = ["teamId", "teamName", "teamColor", "pilot", "w", "h", "cells", "start", "exit", "checkpoints", "doorCells", "pos", "frozenUntil", "strikes", "keys", "keysTaken", "hitMines", "finishedAt", "rank", "reveal"];
const PLAIN_ME = ["id", "role", "teamId"];
const NAV_ME = [...PLAIN_ME, "layers", "layerData"];
/** Il nome in `layerData` di ogni strato. */
const LAYER_KEY: Record<Layer, string> = { mines: "mines", doors: "doors", keys: "keys", patrols: "patrols" };

const dataOf = (s: S, teamId: string, layer: Layer): unknown => {
  const lane = s.lanes.find((l) => l.teamId === teamId)!;
  if (layer === "mines") return lane.course.mines;
  if (layer === "doors") return lane.course.doors;
  if (layer === "keys") return lane.course.keys.filter((k) => !lane.run.keysTaken.includes(k));
  return lane.course.patrols;
};

/** Frammenti di testo che identificano i segreti di uno strato di una corsia (vuoto se lo strato non ha un frammento affidabile). */
function fingerprints(s: S, teamId: string, layer: Layer): string[] {
  const lane = s.lanes.find((l) => l.teamId === teamId)!;
  if (layer === "mines") return lane.course.mines.length >= 2 ? [JSON.stringify(lane.course.mines)] : [];
  if (layer === "doors") return lane.course.doors.map((d) => JSON.stringify(d));
  if (layer === "patrols") return lane.course.patrols.map((p) => JSON.stringify(p));
  return [];
}

function checkPublicLanes(s: S, view: unknown, who: string): string[] {
  const v = json(view) as { lanes: Record<string, unknown>[]; secrets?: unknown; layerData?: unknown };
  const out: string[] = [];
  for (const l of v.lanes) {
    for (const k of Object.keys(l)) if (!LANE_PUBLIC.includes(k)) out.push(`${who}: chiave «${k}» in una corsia`);
    if ("reveal" in l && s.phase !== "level-end") out.push(`${who}: strati scoperti in ${s.phase}`);
  }
  if ("secrets" in v || "layerData" in v) out.push(`${who}: segreti nella vista pubblica`);
  return out;
}

function leaked(view: unknown, texts: string[], who: string, what: string): string[] {
  const text = JSON.stringify(view);
  return texts.filter((t) => text.includes(t)).map((t) => `${who}: ${what} ${t.slice(0, 40)}`);
}

/** Tutte le violazioni dello stato `s` in tutte le viste. Vuoto = nessuna fuga. */
export function violations(s: S): string[] {
  const out: string[] = [];
  const open = s.phase === "ready" || s.phase === "run";
  const screen = plugin.screenView(s);
  out.push(...checkPublicLanes(s, screen, "TV"));
  const everyLane = s.lanes.map((l) => l.teamId);
  // La TV non ha segreti di nessuna corsia nella gara.
  if (open) for (const teamId of everyLane) for (const layer of LAYERS) out.push(...leaked(screen, fingerprints(s, teamId, layer), "TV", `strato ${layer} della squadra ${teamId}`));

  for (const id of [...s.players, "estraneo"]) {
    const view = plugin.viewFor(s, id, null);
    const who = `giocatore ${id}`;
    out.push(...checkPublicLanes(s, view, who));
    const me = (json(view) as { me: Record<string, unknown> | null }).me;
    if (!me) continue;
    const lane = s.lanes.find((l) => l.pilotId === id || id in l.layers);
    const playing = s.phase === "ready" || s.phase === "run" || s.phase === "level-end";
    const nav = lane && playing && lane.pilotId !== id;
    if (!nav) {
      for (const k of Object.keys(me)) if (!PLAIN_ME.includes(k)) out.push(`${who}: chiave «${k}» (${me.role})`);
      if (open) for (const teamId of everyLane) for (const layer of LAYERS) out.push(...leaked(view, fingerprints(s, teamId, layer), who, `strato ${layer} della squadra ${teamId}`));
      continue;
    }
    // Navigatore: chiavi note, strati propri con i dati giusti, nient'altro.
    for (const k of Object.keys(me)) if (!NAV_ME.includes(k)) out.push(`${who}: chiave «${k}» (navigatore)`);
    const owned = lane.layers[id] ?? [];
    expect(me.layers).toEqual(owned);
    const data = (me.layerData ?? {}) as Record<string, unknown>;
    expect(Object.keys(data).sort(), `${who}: strati nei dati`).toEqual(owned.map((l) => LAYER_KEY[l]).sort());
    for (const layer of owned) expect(data[LAYER_KEY[layer]], `${who}: dati dello strato ${layer}`).toEqual(json(dataOf(s, lane.teamId, layer)));
    if (open) {
      for (const layer of LAYERS.filter((l) => !owned.includes(l))) out.push(...leaked(view, fingerprints(s, lane.teamId, layer), who, `strato ${layer} che non ha`));
      for (const other of everyLane.filter((t) => t !== lane.teamId)) for (const layer of LAYERS) out.push(...leaked(view, fingerprints(s, other, layer), who, `strato ${layer} di un'altra squadra`));
    }
  }
  // la regia vede tutto
  const info = json(plugin.hostView(s).info) as { secrets: { teamId: string }[] };
  if (s.lanes.length > 0 && info.secrets.length !== s.lanes.length) out.push("regia: segreti mancanti");
  return out;
}

const SCENARIOS: { name: string; over: Record<string, unknown>; sizes: number[] }[] = [
  { name: "1 navigatore a squadra (tutti gli strati a uno)", over: { levels: 3 }, sizes: [2, 2] },
  { name: "2 navigatori", over: { levels: 3 }, sizes: [3, 3] },
  { name: "4 navigatori (uno per strato)", over: { levels: 3 }, sizes: [5, 5, 5] },
  { name: "6 navigatori (alcuni senza strati)", over: { levels: 3 }, sizes: [7, 7] },
  { name: "a turno", over: { levels: 2, mode: "a-turno" }, sizes: [3, 4, 3] },
  { name: "5 squadre in «insieme» (due gare)", over: { levels: 2 }, sizes: [2, 2, 2, 2, 2] },
];

describe.each(SCENARIOS)("anti-leak su una partita intera ($name)", ({ over, sizes }) => {
  it("nessuna vista rivela ciò che non deve, a nessun passo", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const found: string[] = [];
      const scan = (s: S, label: string) => violations(s).forEach((v) => found.push(`seme ${seed}, ${label}: ${v}`));
      let s = start(seed, { mineDensity: 12, doors: 3, keys: 2, patrols: true, ...over, levelSeconds: 60 }, ctxFor(seed, sizes));
      scan(s, "inizio");
      let guard = 0;
      while (s.phase !== "final" && guard++ < 60) {
        if (s.phase === "ready") {
          scan(s, "pronti");
          s = host(s, { type: "go" }, s.phaseStartedAt + 1000);
          scan(s, "via");
          const run = autopilot(s, s.phaseStartedAt + 100, 70_000, (x, at) => (at % 2000 === 0 ? scan(x, `gara +${at - s.phaseStartedAt} ms`) : undefined));
          s = run.s.phase === "run" ? host(run.s, { type: "finish-level" }, run.at) : run.s;
        }
        scan(s, "fine gara");
        s = host(s, { type: "next" }, s.phaseStartedAt + 1);
      }
      scan(s, "classifica");
      expect(found).toEqual([]);
      expect(s.phase).toBe("final");
    }
  }, 120_000);
});

describe("il controllo anti-leak funziona", () => {
  const s = toRun(start(4, { ...PLAIN, mineDensity: 12, doors: 3, keys: 1, patrols: true, levels: 3 }, ctxFor(4, [4, 4])));

  it("sullo stato giusto non segnala nulla", () => {
    expect(violations(s)).toEqual([]);
  });

  it("segnala una fuga in ogni vista", () => {
    const lane = s.lanes[0]!;
    const nav = Object.keys(lane.layers)[0]!;
    const tv = plugin.screenView(s) as { lanes: Record<string, unknown>[] };
    // la TV con le mine, o con lo strato scoperto prima del tempo
    const leakyTv = { ...tv, lanes: tv.lanes.map((l, i) => (i === 0 ? { ...l, mines: lane.course.mines } : l)) };
    expect(checkPublicLanes(s, leakyTv, "TV").length).toBeGreaterThan(0);
    const early = { ...tv, lanes: tv.lanes.map((l) => ({ ...l, reveal: { mines: [] } })) };
    expect(checkPublicLanes(s, early, "TV").length).toBeGreaterThan(0);
    expect(checkPublicLanes(s, { ...tv, secrets: [] }, "TV").length).toBeGreaterThan(0);
    // un testo che identifica gli orari delle porte in un telefono qualunque
    const pilot = plugin.viewFor(s, lane.pilotId, null);
    expect(leaked({ ...(pilot as object), x: lane.course.doors[0] }, fingerprints(s, lane.teamId, "doors"), "p", "porte").length).toBeGreaterThan(0);
    expect(leaked(pilot, fingerprints(s, lane.teamId, "doors"), "p", "porte")).toEqual([]);
    void nav;
  });

  it("i navigatori di un'altra squadra non hanno gli strati di questa", () => {
    const mine = s.lanes[0]!;
    const theirs = s.lanes[1]!;
    for (const id of Object.keys(theirs.layers)) {
      const text = JSON.stringify(plugin.viewFor(s, id, null));
      for (const layer of LAYERS) for (const f of fingerprints(s, mine.teamId, layer)) expect(text.includes(f)).toBe(false);
    }
    // e a fine gara tutto è scoperto, sulla TV e ovunque
    const ended = host(s, { type: "finish-level" }, T0 + 3000);
    expect(ended.phase).toBe("level-end");
    const tv = plugin.screenView(ended) as { lanes: { reveal?: { mines: number[]; doors: unknown[]; keys: number[]; patrols: unknown[] } }[] };
    expect(tv.lanes.every((l) => l.reveal !== undefined)).toBe(true);
    expect(tv.lanes[0]!.reveal!.mines).toEqual(s.lanes[0]!.course.mines);
    expect(violations(ended)).toEqual([]);
  });
});
