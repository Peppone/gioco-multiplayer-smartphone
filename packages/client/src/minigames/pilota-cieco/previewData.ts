/**
 * Viste d'esempio di Pilota alla cieca per l'anteprima dei temi (`/preview`): nessuna partita da giocare.
 * I labirinti sono generati dal vero generatore (stesso seme, stesso livello), nel caso peggiore per la leggibilità:
 * livello 3, con mine, porte, chiavi e pattuglie.
 */
import { type Course, generateCourses, levelSpec } from "@gioco/minigames/src/pilota-cieco/generate";
import type { Layer, LayerData, Me, PhoneView, PublicLane, PublicView, Result, Settings } from "./types";

export type PilotaSceneId = "pc-ready" | "pc-run" | "pc-nav" | "pc-nav-doors" | "pc-frozen" | "pc-level-end" | "pc-turn" | "pc-watch" | "pc-final";

export const PILOTA_SCENES: { id: PilotaSceneId; label: string }[] = [
  { id: "pc-ready", label: "Pilota: pronti (navigatore)" },
  { id: "pc-run", label: "Pilota: 4 corsie in gara (pilota)" },
  { id: "pc-nav", label: "Pilota: mappa del navigatore (4 strati)" },
  { id: "pc-nav-doors", label: "Pilota: porte e pattuglie nel tempo" },
  { id: "pc-frozen", label: "Pilota: fermo dopo una mina" },
  { id: "pc-level-end", label: "Pilota: fine gara, strati scoperti" },
  { id: "pc-turn", label: "Pilota: a turno, una corsia a tutto schermo" },
  { id: "pc-watch", label: "Pilota: a turno, guarda un'altra squadra" },
  { id: "pc-final", label: "Pilota: classifica" },
];

const SETTINGS: Settings = { mode: "insieme", levels: 3, stepMs: 350, penaltyMs: 3000, levelSeconds: 150, keys: 1, finishPoints: [150, 100, 75, 50], distancePoints: 50, strikePenalty: 10 };
const NAMES = [
  ["Marco", "Sofia", "Giulia", "Luca"],
  ["Anna", "Paolo", "Elena", "Dario"],
  ["Irene", "Fabio", "Carla", "Oscar"],
  ["Rita", "Sergio", "Marta", "Ugo"],
];
const COLORS = ["#e5484d", "#3e63dd", "#30a46c", "#f5a524"];
const TEAM_NAMES = ["Rossi", "Blu", "Verdi", "Gialli"];

const TEAMS = TEAM_NAMES.map((name, i) => ({ id: `t${i}`, name, color: COLORS[i]!, members: NAMES[i]!.map((nickname, k) => ({ id: `t${i}p${k}`, nickname })) }));

function courses(teams: number, mode: "insieme" | "a-turno", level = 3): Course[] {
  const spec = levelSpec({ mode, size: "medio", mineDensity: 8, doors: 3, keys: 1, patrols: true }, level);
  return generateCourses(2024, level, spec, teams);
}

function lane(c: Course, i: number, over: Partial<PublicLane> = {}): PublicLane {
  return {
    teamId: `t${i}`,
    teamName: TEAM_NAMES[i]!,
    teamColor: COLORS[i]!,
    pilot: TEAMS[i]!.members[0]!,
    w: c.w,
    h: c.h,
    cells: c.cells,
    start: c.start,
    exit: c.exit,
    checkpoints: c.checkpoints,
    doorCells: c.doors.map((d) => d.cell),
    pos: c.route[Math.floor(c.route.length * (0.25 + 0.15 * i))]!,
    frozenUntil: 0,
    strikes: i % 3,
    keys: { total: c.keys.length, taken: i % 2 },
    keysTaken: i % 2 === 1 ? c.keys : [],
    hitMines: i % 3 === 0 ? [] : c.mines.slice(0, 1),
    finishedAt: null,
    rank: null,
    ...over,
  };
}

function base(phase: PublicView["phase"], now: number, lanes: PublicLane[], over: Partial<PublicView> = {}): PublicView {
  return {
    phase,
    phaseStartedAt: now,
    phaseEndsAt: phase === "ready" ? now + 10_000 : phase === "run" ? now + 107_000 : null,
    pausedRemainingMs: null,
    levelStartedAt: phase === "run" || phase === "level-end" ? now - 43_000 : null,
    settings: SETTINGS,
    level: 3,
    unit: 0,
    units: 1,
    teams: TEAMS,
    lanes,
    results: [],
    history: [],
    board: Object.fromEntries(TEAMS.map((t, i) => [t.id, [570, 410, 280, 120][i]!])),
    ...over,
  };
}

const RESULTS: Result[] = [
  { teamId: "t0", finished: true, elapsedMs: 68_000, progress: 1, strikes: 1, points: 140 },
  { teamId: "t1", finished: true, elapsedMs: 95_000, progress: 1, strikes: 0, points: 100 },
  { teamId: "t2", finished: false, elapsedMs: null, progress: 0.62, strikes: 2, points: 11 },
  { teamId: "t3", finished: false, elapsedMs: null, progress: 0.2, strikes: 0, points: 10 },
];

const phoneOf = (v: PublicView, me: Me): PhoneView => ({ ...v, me });

export function pilotaScene(scene: PilotaSceneId, now: number): { typeId: string; screen: unknown; phone: unknown } {
  const typeId = "pilota-cieco";
  const four = courses(4, "insieme");
  const lanes4 = four.map((c, i) => lane(c, i));
  const allLayers = (c: Course): { layers: Layer[]; data: LayerData } => ({ layers: ["mines", "doors", "keys", "patrols"], data: { mines: c.mines, doors: c.doors, keys: c.keys, patrols: c.patrols } });

  switch (scene) {
    case "pc-ready": {
      const c = four[0]!;
      const v = base("ready", now, lanes4.slice(0, 2).map((l, i) => ({ ...l, pos: four[i]!.start, strikes: 0, keys: { total: four[i]!.keys.length, taken: 0 }, keysTaken: [], hitMines: [] })), { levelStartedAt: null });
      return { typeId, screen: v, phone: phoneOf(v, { id: "t0p1", role: "navigator", teamId: "t0", layers: ["mines"], layerData: { mines: c.mines } }) };
    }
    case "pc-run": {
      const v = base("run", now, lanes4);
      return { typeId, screen: v, phone: phoneOf(v, { id: "t0p0", role: "pilot", teamId: "t0" }) };
    }
    case "pc-nav": {
      const v = base("run", now, lanes4);
      const { layers, data } = allLayers(four[0]!);
      return { typeId, screen: v, phone: phoneOf(v, { id: "t0p1", role: "navigator", teamId: "t0", layers, layerData: data }) };
    }
    case "pc-nav-doors": {
      const v = base("run", now, lanes4);
      const c = four[0]!;
      return { typeId, screen: v, phone: phoneOf(v, { id: "t0p2", role: "navigator", teamId: "t0", layers: ["doors", "patrols"], layerData: { doors: c.doors, patrols: c.patrols } }) };
    }
    case "pc-frozen": {
      const lanes = lanes4.map((l, i) => (i === 0 ? { ...l, strikes: 2, frozenUntil: now + 2_400, hitMines: four[0]!.mines.slice(0, 2) } : l));
      const v = base("run", now, lanes);
      return { typeId, screen: v, phone: phoneOf(v, { id: "t0p0", role: "pilot", teamId: "t0" }) };
    }
    case "pc-level-end": {
      const lanes = four.slice(0, 2).map((c, i) =>
        lane(c, i, { pos: c.exit, finishedAt: now - 20_000 + i * 27_000, rank: i + 1, keys: { total: c.keys.length, taken: c.keys.length }, keysTaken: c.keys, reveal: { mines: c.mines, doors: c.doors, keys: c.keys, patrols: c.patrols } }),
      );
      const v = base("level-end", now, lanes, { results: RESULTS.slice(0, 2) });
      return { typeId, screen: v, phone: phoneOf(v, { id: "t0p1", role: "navigator", teamId: "t0", layers: [], layerData: {} }) };
    }
    case "pc-turn": {
      const [c] = courses(1, "a-turno", 3);
      const v = base("run", now, [lane(c!, 1, { pos: c!.route[Math.floor(c!.route.length / 3)]! })], { units: 4, unit: 1, settings: { ...SETTINGS, mode: "a-turno" } });
      const { layers, data } = allLayers(c!);
      return { typeId, screen: v, phone: phoneOf(v, { id: "t1p1", role: "navigator", teamId: "t1", layers, layerData: data }) };
    }
    case "pc-watch": {
      const [c] = courses(1, "a-turno", 3);
      const v = base("run", now, [lane(c!, 1, { pos: c!.route[Math.floor(c!.route.length / 3)]! })], { units: 4, unit: 1, settings: { ...SETTINGS, mode: "a-turno" } });
      return { typeId, screen: v, phone: phoneOf(v, { id: "t0p1", role: "spectator", teamId: "t0" }) };
    }
    case "pc-final": {
      const v = base("final", now, []);
      return { typeId, screen: v, phone: { ...v, me: { id: "t0p0", role: "spectator", teamId: "t0" } } };
    }
  }
}
