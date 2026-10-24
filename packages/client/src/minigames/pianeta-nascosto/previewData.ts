/**
 * Viste d'esempio del Pianeta Nascosto per l'anteprima dei temi (`/preview`): nessuna partita da giocare.
 * I casi peggiori per la leggibilità: il foglio a 18 settori e i nomi lunghi delle squadre.
 */
import { generateSystem } from "@gioco/minigames/src/pianeta-nascosto/system";
import type { Kind, Mark, Obs, PhoneView, PublicView, ScreenView, Settings, TeamView } from "./types";

export type PianetaSceneId = "px-board" | "px-expert" | "px-action" | "px-theory" | "px-review" | "px-final";

export const PIANETA_SCENES: { id: PianetaSceneId; label: string }[] = [
  { id: "px-board", label: "Pianeta: tabellone e foglio a 12 settori" },
  { id: "px-expert", label: "Pianeta: tabellone e foglio a 18 settori" },
  { id: "px-action", label: "Pianeta: la squadra sceglie l'azione" },
  { id: "px-theory", label: "Pianeta: invio delle teorie" },
  { id: "px-review", label: "Pianeta: revisione delle teorie" },
  { id: "px-final", label: "Pianeta: punteggio finale" },
];

const BASE: Settings = { mode: "standard", sectors: 12, turnMode: "sequential", decision: "vote", maxDays: 0, turnSeconds: 90, theorySeconds: 60, assist: false, tokens: { asteroid: 4, comet: 2, gas: 2, dwarf: 1 }, theoriesPerPhase: 1, targets: 2, pointScale: 10 };
const EXPERT: Settings = { ...BASE, mode: "expert", sectors: 18, tokens: { asteroid: 4, comet: 2, gas: 2, dwarf: 4 }, theoriesPerPhase: 2 };
const COLORS = ["#e5484d", "#3e63dd", "#30a46c", "#f5a524"];
const NAMES = ["Rossi", "Squadra con un nome molto lungo", "Verdi", "Robot 1"];

function observatories(s: Settings): Obs[] {
  const times = [7, 9, 9, 12];
  return NAMES.map((name, i) => ({ id: `o${i}`, name, color: COLORS[i]!, bot: i === 3, time: times[i]!, stack: i + 1, members: i === 3 ? 0 : 5 - i, sector: (times[i]! % s.sectors) + 1 }));
}

function pub(phase: PublicView["phase"], now: number, s: Settings, over: Partial<PublicView> = {}): PublicView {
  const obs = observatories(s);
  const earth = Math.min(...obs.map((o) => o.time));
  return {
    phase,
    phaseStartedAt: now - 20_000,
    phaseEndsAt: phase === "turn" || phase === "theory" || phase === "lastCall" ? now + 55_000 : null,
    pausedRemainingMs: null,
    settings: s,
    earth,
    earthSector: (earth % s.sectors) + 1,
    observatories: obs,
    actingIds: phase === "turn" ? ["o0"] : phase === "theory" ? obs.map((o) => o.id) : [],
    topics: ["A", "B", "C", "D", "E", "F"].map((id, i) => ({ id, label: [["comet", "gas"], ["asteroid"], ["dwarf", "empty"], ["gas"], ["asteroid", "comet"], ["dwarf"]][i] as Kind[], readBy: i < 2 ? ["o0"] : i === 2 ? ["o1", "o2"] : [] })),
    conferences: s.mode === "expert" ? [{ id: "X1", label: ["planetX", "comet"], held: true, text: "Il Pianeta X non è direttamente opposto a una cometa" }, { id: "X2", label: ["planetX", "gas"], held: false, text: null }] : [{ id: "X1", label: ["planetX", "comet"], held: false, text: null }],
    conferenceNow: null,
    confirmed: { 2: "asteroid", 5: "gas" },
    refuted: [{ sector: 8, object: "dwarf" }],
    theories: [
      { id: 1, ownerId: "o1", sector: 3, space: 1, faceUp: false, object: null },
      { id: 2, ownerId: "o2", sector: 3, space: 0, faceUp: false, object: null },
      { id: 3, ownerId: "o0", sector: 2, space: 3, faceUp: true, object: "asteroid" },
      { id: 4, ownerId: "o1", sector: 5, space: 3, faceUp: true, object: "gas" },
    ],
    review: null,
    publicLog: [
      { id: 1, time: 0, obsId: "o1", text: "rileva asteroidi nei settori 1–3" },
      { id: 2, time: 4, obsId: "o2", text: "punta il settore 4" },
      { id: 3, time: 4, obsId: "o0", text: "legge la ricerca A" },
      { id: 4, time: 7, obsId: "o3", text: "localizza il Pianeta X: FALLITO", ok: false },
    ],
    lastCall: null,
    fromMaxDays: false,
    ...over,
  };
}

function team(s: Settings, over: Partial<TeamView> = {}): TeamView {
  const n = s.sectors;
  const vis = Array.from({ length: n / 2 }, (_, i) => ((7 + i) % n) + 1);
  const notes: Record<string, Mark> = { "3:asteroid": "excluded", "3:gas": "supposed", "4:comet": "excluded", "6:asteroid": "supposed", "6:dwarf": "excluded" };
  return {
    id: "o0",
    playerId: "p1",
    name: NAMES[0]!,
    color: COLORS[0]!,
    captainId: "p1",
    isCaptain: true,
    difficulty: "beginner",
    facts: [{ sector: 7, absent: "asteroid" }, { sector: 9, absent: "gas" }, { sector: 1, absent: "dwarf" }],
    tokens: s.tokens,
    targetsLeft: 1,
    lastWasResearch: false,
    log: [
      { time: 0, cost: 4, text: "Rilevamento di asteroidi nei settori 1–3: 2", action: { type: "pass" } },
      { time: 4, cost: 1, text: "Ricerca A: Almeno una cometa è adiacente a una nube di gas", action: { type: "pass" } },
    ],
    research: [{ topic: "A", text: "Almeno una cometa è adiacente a una nube di gas" }],
    notes,
    fixed: { "7:asteroid": "excluded", "9:gas": "excluded", "1:dwarf": "excluded", "2:asteroid": "confirmed", "2:gas": "excluded", "2:dwarf": "excluded", "2:empty": "excluded", "2:planetX": "excluded", "2:comet": "excluded" },
    acting: false,
    visible: vis,
    turn: null,
    collect: null,
    myTheories: [],
    ...over,
  };
}

const phone = (v: PublicView, t: TeamView): PhoneView => ({ ...v, mine: t });

export function pianetaScene(scene: PianetaSceneId, now: number): { typeId: string; screen: unknown; phone: unknown } {
  const typeId = "pianeta-nascosto";
  switch (scene) {
    case "px-board": {
      const v = pub("turn", now, BASE);
      return { typeId, screen: v as ScreenView, phone: phone(v, team(BASE)) };
    }
    case "px-expert": {
      const v = pub("turn", now, EXPERT);
      return { typeId, screen: v as ScreenView, phone: phone(v, team(EXPERT)) };
    }
    case "px-action": {
      const v = pub("turn", now, BASE);
      const t = team(BASE, {
        acting: true,
        turn: {
          proposals: [
            { id: "p1", by: "p1", action: { type: "survey", object: "asteroid", from: 8, to: 10 }, text: "Rileva asteroid 8–10", cost: 4, error: null },
            { id: "p2", by: "p2", action: { type: "target", sector: 11 }, text: "Punta 11", cost: 4, error: null },
          ],
          vote: { options: ["p1", "p2"], mine: ["p1"], confirmed: false, mates: [{ playerId: "p2", picks: ["p2"], confirmed: false }] },
          chosen: null,
        },
      });
      return { typeId, screen: v as ScreenView, phone: phone(v, t) };
    }
    case "px-theory": {
      const v = pub("theory", now, BASE);
      const t = team(BASE, {
        acting: true,
        collect: { draft: [{ sector: 6, object: "asteroid" }], guess: null, ready: false, readyBy: 1, limit: 1, lag: 0, canGuess: false },
        myTheories: [{ id: 9, sector: 4, object: "gas", space: 1, faceUp: false }],
        tokens: { ...BASE.tokens, gas: 1 },
      });
      return { typeId, screen: v as ScreenView, phone: phone(v, t) };
    }
    case "px-review": {
      const v = pub("review", now, BASE, {
        review: {
          events: [
            { sector: 3, theoryId: 1, ownerId: "o1", object: "asteroid", correct: false },
            { sector: 5, theoryId: 4, ownerId: "o2", object: "gas", correct: true },
          ],
          penalties: [{ ownerId: "o1", sector: 3 }],
        },
      });
      return { typeId, screen: v as ScreenView, phone: phone(v, team(BASE)) };
    }
    case "px-final": {
      const sky = generateSystem("standard", 11).sky as Kind[];
      const v = pub("final", now, BASE, {
        sky,
        scores: [
          { id: "o0", rank: 1, breakdown: { priority: 2, asteroid: 4, comet: 3, gas: 4, dwarf: 0, planetX: 10, total: 23 } },
          { id: "o1", rank: 2, breakdown: { priority: 1, asteroid: 4, comet: 0, gas: 0, dwarf: 0, planetX: 4, total: 9 } },
          { id: "o2", rank: 3, breakdown: { priority: 0, asteroid: 2, comet: 0, gas: 0, dwarf: 0, planetX: 0, total: 2 } },
          { id: "o3", rank: 4, breakdown: { priority: 0, asteroid: 0, comet: 0, gas: 0, dwarf: 0, planetX: 0, total: 0 } },
        ],
      });
      return { typeId, screen: v as ScreenView, phone: phone(v, team(BASE)) };
    }
  }
}
