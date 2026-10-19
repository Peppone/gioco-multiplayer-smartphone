/**
 * Viste d'esempio di Plancia di Comando per l'anteprima dei temi (`/preview`): nessuna partita da giocare.
 * Il caso peggiore per la leggibilità del telefono è il pannello da 6 comandi coi nomi più lunghi.
 */
import type { PhoneControl, PhoneView, PublicView, ScreenCrew, ScreenView, Settings } from "./types";

export type PlanciaSceneId = "pdc-ready" | "pdc-play" | "pdc-six" | "pdc-blackout" | "pdc-alarm" | "pdc-stopped" | "pdc-jump" | "pdc-final";

export const PLANCIA_SCENES: { id: PlanciaSceneId; label: string }[] = [
  { id: "pdc-ready", label: "Plancia: pronti al decollo" },
  { id: "pdc-play", label: "Plancia: 4 comandi e un ordine" },
  { id: "pdc-six", label: "Plancia: 6 comandi coi nomi più lunghi" },
  { id: "pdc-blackout", label: "Plancia: blackout" },
  { id: "pdc-alarm", label: "Plancia: allarme generale" },
  { id: "pdc-stopped", label: "Plancia: astronave ferma" },
  { id: "pdc-jump", label: "Plancia: salto di settore" },
  { id: "pdc-final", label: "Plancia: classifica" },
];

const SETTINGS: Settings = { mode: "squadre", sectors: 5, sectorSeconds: 60, orderSeconds: 12, minOrderSeconds: 6, damagePerMiss: 5, events: true, stepPoints: 10, hullBonus: 100, podiumPoints: [150, 100, 50] };
const COLORS = ["#e5484d", "#3e63dd", "#30a46c", "#f5a524"];
const NAMES = ["Rossi", "Blu", "Verdi", "Gialli"];

function crews(now: number, over: (c: ScreenCrew, i: number) => Partial<ScreenCrew> = () => ({})): ScreenCrew[] {
  return NAMES.map((name, i) => {
    const c: ScreenCrew = {
      id: `c${i}`,
      name,
      color: COLORS[i]!,
      members: 8 - i,
      progress: 0.5 - i * 0.08,
      distance: [19, 16, 14, 9][i]!,
      hull: [100, 75, 40, 15][i]!,
      done: [38, 31, 27, 18][i]!,
      missed: [0, 5, 12, 17][i]!,
      stopped: false,
      lastDone: { text: ["Attiva il Flusso Ionico", "Metti il Deflettore su Rosso", "Premi il Siringatore", "Spegni la Pompa Gamma"][i]!, at: now - 5_000 },
      event: null,
      activeOrders: 8 - i,
      ...over({} as ScreenCrew, i),
    };
    return c;
  });
}

function pub(phase: PublicView["phase"], now: number, over: Partial<PublicView> = {}): PublicView {
  return {
    phase,
    phaseStartedAt: now - 20_000,
    phaseEndsAt: phase === "sector" ? now + 40_000 : phase === "jump" ? now + 5_000 : null,
    pausedRemainingMs: null,
    settings: SETTINGS,
    sector: phase === "ready" ? 0 : 3,
    ...over,
  };
}

const CONTROLS: PhoneControl[] = [
  { id: "k1", name: "Flusso Ionico", kind: "button", options: [], value: 0 },
  { id: "k2", name: "Pompa Gamma", kind: "toggle", options: [], value: 1 },
  { id: "k3", name: "Reattore Beta", kind: "slider", options: [], value: 3 },
  { id: "k4", name: "Deflettore", kind: "selector", options: ["Rosso", "Verde", "Blu"], value: 1 },
];

const LONG: PhoneControl[] = [
  { id: "l1", name: "Compensatore Quantico Rotante", kind: "button", options: [], value: 0 },
  { id: "l2", name: "Condensatore Flussometrico", kind: "toggle", options: [], value: 0 },
  { id: "l3", name: "Stabilizzatore Magnetico Dorsale", kind: "slider", options: [], value: 2 },
  { id: "l4", name: "Convertitore Subspaziale", kind: "selector", options: ["Indaco", "Magenta", "Turchese", "Ambra"], value: 2 },
  { id: "l5", name: "Distributore Plasmatico", kind: "button", options: [], value: 0 },
  { id: "l6", name: "Moderatore Antimateria", kind: "toggle", options: [], value: 1 },
];

function phone(v: PublicView, controls: PhoneControl[], over: Partial<NonNullable<PhoneView["me"]>> = {}, crew: Partial<NonNullable<PhoneView["crew"]>> = {}, now = 0): PhoneView {
  return {
    ...v,
    crew: { id: "c0", name: "Rossi", color: COLORS[0]!, hull: 85, stopped: false, event: null, ...crew },
    me: { id: "p1", inactive: false, controls, order: { text: "Imposta il Reattore Beta su 4", issuedAt: now - 4_000, deadline: now + 8_000 }, alarmPressed: false, ...over },
  };
}

export function planciaScene(scene: PlanciaSceneId, now: number): { typeId: string; screen: unknown; phone: unknown } {
  const typeId = "plancia-comando";
  const screenOf = (v: PublicView, over?: Parameters<typeof crews>[1]): ScreenView => ({ ...v, crews: crews(now, over) });
  switch (scene) {
    case "pdc-ready": {
      const v = pub("ready", now);
      return { typeId, screen: screenOf(v, () => ({ distance: 0, done: 0, missed: 0, hull: 100, lastDone: null, activeOrders: 0 })), phone: phone(v, CONTROLS, { order: null }, { hull: 100 }, now) };
    }
    case "pdc-play": {
      const v = pub("sector", now);
      return { typeId, screen: screenOf(v), phone: phone(v, CONTROLS, {}, {}, now) };
    }
    case "pdc-six": {
      const v = pub("sector", now);
      return { typeId, screen: screenOf(v), phone: phone(v, LONG, { order: { text: "Imposta lo Stabilizzatore Magnetico Dorsale su 5", issuedAt: now - 2_000, deadline: now + 7_000 } }, {}, now) };
    }
    case "pdc-blackout": {
      const v = pub("sector", now);
      const event = { kind: "blackout" as const, until: now + 6_000 };
      const dark = LONG.map((c) => ({ ...c, name: c.name.split(" ").map((w) => w[0]).join(".") + ".", options: c.options.map((o) => o[0]!) }));
      return { typeId, screen: screenOf(v, (_, i) => (i === 0 ? { event } : {})), phone: phone(v, dark, {}, { event }, now) };
    }
    case "pdc-alarm": {
      const v = pub("sector", now);
      const event = { kind: "alarm" as const, until: now + 4_000 };
      return { typeId, screen: screenOf(v, () => ({ event })), phone: phone(v, CONTROLS, {}, { event }, now) };
    }
    case "pdc-stopped": {
      const v = pub("sector", now);
      return { typeId, screen: screenOf(v, (_, i) => (i === 0 ? { stopped: true, hull: 0 } : {})), phone: phone(v, CONTROLS, { order: null }, { stopped: true, hull: 0 }, now) };
    }
    case "pdc-jump": {
      const v = pub("jump", now, { sector: 2 });
      return { typeId, screen: screenOf(v), phone: phone(v, CONTROLS, { order: null }, {}, now) };
    }
    case "pdc-final": {
      const v = pub("final", now, { sector: 5 });
      return { typeId, screen: screenOf(v, (_, i) => ({ rank: i + 1, points: [150, 100, 50, 0][i]! + 100 - i * 20 })), phone: phone(v, CONTROLS, { order: null, rank: 1, points: 350 }, {}, now) };
    }
  }
}
