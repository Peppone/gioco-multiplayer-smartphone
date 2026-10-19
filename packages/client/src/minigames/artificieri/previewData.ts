/**
 * Viste d'esempio di Artificieri per l'anteprima dei temi (`/preview`): nessuna partita da giocare.
 * La bomba e il manuale sono generati dal vero generatore (stesso seme, stessa bomba), così l'anteprima mostra
 * il testo e i disegni veri e il caso peggiore (difficile, 6 moduli, 6 fili).
 */
import { buildManual, generateBomb } from "@gioco/minigames/src/artificieri/bomb";
import type { Control, HistoryEntry, Me, PhoneView, Phase, ScreenView, Settings, Status, TvModule } from "./types";

export type ArtificieriSceneId = "art-bet" | "art-briefing" | "art-wires" | "art-button" | "art-symbols" | "art-colors" | "art-maze" | "art-word" | "art-manual" | "art-watch" | "art-exploded" | "art-defused" | "art-final";

export const ARTIFICIERI_SCENES: { id: ArtificieriSceneId; label: string }[] = [
  { id: "art-bet", label: "Artificieri: scommesse" },
  { id: "art-briefing", label: "Artificieri: esperti di spalle" },
  { id: "art-wires", label: "Artificieri: fili" },
  { id: "art-button", label: "Artificieri: pulsante tenuto" },
  { id: "art-symbols", label: "Artificieri: simboli" },
  { id: "art-colors", label: "Artificieri: colori" },
  { id: "art-maze", label: "Artificieri: labirinto" },
  { id: "art-word", label: "Artificieri: parola" },
  { id: "art-manual", label: "Artificieri: manuale dell'esperto" },
  { id: "art-watch", label: "Artificieri: le altre squadre guardano" },
  { id: "art-exploded", label: "Artificieri: esplosione" },
  { id: "art-defused", label: "Artificieri: disinnescata" },
  { id: "art-final", label: "Artificieri: fine del round" },
];

const SETTINGS: Settings = { difficulty: "difficile", modules: 6, seconds: 300, maxStrikes: 3, speedUpOnStrike: true, bombsPerTeam: 1, betSeconds: 15, modulePoints: 50, defusePoints: 200, timeBonus: 1, betPoints: 50 };

const person = (id: string, nickname: string) => ({ id, nickname });
const RED = [person("r1", "Marco"), person("r2", "Sofia"), person("r3", "Giulia"), person("me", "Tu")];
const BLUE = [person("b1", "Luca"), person("b2", "Anna"), person("b3", "Paolo")];
const TEAMS = [
  { id: "ta", name: "Rossi", color: "#e5484d", members: RED },
  { id: "tb", name: "Blu", color: "#3e63dd", members: BLUE },
];

/** Parole d'esempio per il modulo «Parola» (in partita vengono da una lista della libreria). */
const WORDS = ["PIZZA", "LIBRO", "PORTA", "SEDIA", "NOTTE", "FIORE", "PIANO", "TRENO", "MONDO", "CIELO", "FUOCO", "LATTE", "VENTO", "ACQUA", "ISOLA", "RADIO", "BARCA", "CARTA", "FORNO", "PRATO", "TORRE", "LUNGO", "MANGO", "PESCE", "POLLO", "BIRRA", "DENTE", "GAMBA", "PUNTO", "ROSSO"];

/** La bomba d'esempio: 6 moduli, uno per tipo, con le regole del caso più difficile. */
const SETUP = generateBomb(2024, { difficulty: "difficile", modules: 6, enabled: ["wires", "button", "symbols", "colors", "maze", "word"], content: { words: WORDS } });
const PAGES = buildManual(SETUP.rules);

function status(over: Partial<Status> = {}, now: number): Status {
  return { strikes: 1, maxStrikes: 3, moduleCount: 6, solved: 2, speed: 1.25, clock: { at: now, remainingMs: 187_000 }, pausedRemainingMs: null, outcome: null, ...over };
}

function history(): HistoryEntry[] {
  return [
    { turn: 0, teamId: "ta", outcome: "defused", reason: "all-solved", solved: 6, moduleCount: 6, strikes: 1, secondsLeft: 64, points: 564, betWinners: [BLUE[0]!, BLUE[1]!], betsDefused: 2, betsExploded: 1 },
    { turn: 1, teamId: "tb", outcome: "exploded", reason: "strikes", solved: 3, moduleCount: 6, strikes: 3, secondsLeft: 0, points: 150, betWinners: [], betsDefused: 3, betsExploded: 0 },
  ];
}

function tv(holdingId: number | null, solvedIds: number[]): TvModule[] {
  return SETUP.modules.map((m) => {
    const solved = solvedIds.includes(m.id);
    if (m.kind === "wires") return { id: m.id, kind: "wires", solved, data: m.data as never, progress: { cut: solved ? [0] : [] } };
    if (m.kind === "button") {
      const d = m.data as { color: never; label: string; strip: never };
      const holding = m.id === holdingId;
      return { id: m.id, kind: "button", solved, data: holding ? d : { color: d.color, label: d.label }, progress: { holding } };
    }
    if (m.kind === "colors") return { id: m.id, kind: "colors", solved, data: m.data as never, progress: solved ? { stage: 3, entered: 0 } : { stage: 1, entered: 1 } };
    if (m.kind === "maze") return { id: m.id, kind: "maze", solved, data: m.data as never, progress: { pos: solved ? (m.data as { goal: number }).goal : (m.data as { start: number }).start } };
    if (m.kind === "word") return { id: m.id, kind: "word", solved, data: m.data as never, progress: m.progress as never };
    return { id: m.id, kind: "symbols", solved, data: m.data as never, progress: { pressed: solved ? (m.data as { symbols: unknown[] }).symbols.map((_, i) => i) : [0] } };
  }) as TvModule[];
}

function controls(solvedIds: number[], holdingId: number | null): Control[] {
  return SETUP.modules.map((m) => {
    const solved = solvedIds.includes(m.id);
    if (m.kind === "wires") return { id: m.id, kind: "wires", solved, wires: (m.data as { wires: unknown[] }).wires.length, cut: solved ? [0] : [] };
    if (m.kind === "button") return { id: m.id, kind: "button", solved, holding: m.id === holdingId };
    if (m.kind === "colors" || m.kind === "maze" || m.kind === "word") return { id: m.id, kind: m.kind, solved };
    return { id: m.id, kind: "symbols", solved, symbols: (m.data as { symbols: string[] }).symbols, pressed: solved ? (m.data as { symbols: unknown[] }).symbols.map((_, i) => i) : [0] };
  }) as Control[];
}

const firstOf = (kind: string) => SETUP.modules.find((m) => m.kind === kind)!.id;

function base(phase: Phase, now: number, over: Partial<ScreenView> = {}): ScreenView {
  const inGame = phase !== "final";
  return {
    phase,
    phaseStartedAt: now,
    phaseEndsAt: phase === "bet" ? now + 15_000 : null,
    pausedRemainingMs: null,
    settings: SETTINGS,
    teams: TEAMS,
    turn: inGame
      ? { position: 0, total: 2, teamId: "ta", teamName: "Rossi", teamColor: "#e5484d", defuser: RED[0]!, experts: RED.slice(1), bettors: 3, betsPlaced: 2 }
      : null,
    status: null,
    history: phase === "outcome" || phase === "final" ? history() : [],
    bomb: null,
    ...over,
  };
}

const bombView = (selected: number | null, holdingId: number | null, solvedIds: number[]) => ({ edgework: SETUP.edgework, modules: tv(holdingId, solvedIds), selected });

export function artificieriScene(scene: ArtificieriSceneId, now: number): { typeId: string; screen: unknown; phone: unknown } {
  const typeId = "artificieri";
  const phone = (v: ScreenView, me: Me): PhoneView => {
    const { bomb: _bomb, ...rest } = v;
    return { ...rest, me };
  };
  const defuser = (extra: Partial<Extract<Me, { role: "defuser" }>> = {}): Me => ({ id: "r1", role: "defuser", canStart: false, ...extra });
  // già disinnescati: due moduli che la scena non usa (il modulo scelto resta attivo)
  const solvedExcept = (kind: string) => SETUP.modules.filter((m) => m.kind !== kind).slice(0, 2).map((m) => m.id);
  const index = PAGES.map((p, i) => ({ id: p.id, title: p.title, owners: [i % 2 === 0 ? "Sofia" : "Giulia"], mine: true }));

  switch (scene) {
    case "art-bet": {
      const v = base("bet", now);
      return { typeId, screen: v, phone: phone(v, { id: "b1", role: "bettor", canBet: true, myBet: "defused" }) };
    }
    case "art-briefing": {
      const v = base("briefing", now);
      return { typeId, screen: v, phone: phone(v, defuser({ canStart: true })) };
    }
    case "art-wires": {
      const w = firstOf("wires");
      const solved = solvedExcept("wires");
      const v = base("defuse", now, { status: status({}, now), bomb: bombView(w, null, solved) });
      return { typeId, screen: v, phone: phone(v, defuser({ controls: controls(solved, null), selected: w })) };
    }
    case "art-button": {
      const b = firstOf("button");
      const solved = solvedExcept("button");
      const v = base("defuse", now, { status: status({ strikes: 2, speed: 1.5 }, now), bomb: bombView(b, b, solved) });
      return { typeId, screen: v, phone: phone(v, defuser({ controls: controls(solved, b), selected: b })) };
    }
    case "art-symbols": {
      const s = firstOf("symbols");
      const v = base("defuse", now, { status: status({ strikes: 0, speed: 1 }, now), bomb: bombView(s, null, []) });
      return { typeId, screen: v, phone: phone(v, defuser({ controls: controls([], null), selected: s })) };
    }
    case "art-colors":
    case "art-maze":
    case "art-word": {
      const kind = scene === "art-colors" ? "colors" : scene === "art-maze" ? "maze" : "word";
      const id = firstOf(kind);
      const solved = solvedExcept(kind);
      const v = base("defuse", now, { status: status({ strikes: 0, speed: 1 }, now), bomb: bombView(id, null, solved) });
      return { typeId, screen: v, phone: phone(v, defuser({ controls: controls(solved, null), selected: id })) };
    }
    case "art-manual": {
      const solved = solvedExcept("none");
      const v = base("defuse", now, { status: status({}, now), bomb: bombView(null, null, solved) });
      return { typeId, screen: v, phone: phone(v, { id: "r2", role: "expert", index, manual: PAGES }) };
    }
    case "art-watch": {
      const solved = solvedExcept("none");
      const v = base("defuse", now, { status: status({}, now), bomb: bombView(null, null, solved) });
      return { typeId, screen: v, phone: phone(v, { id: "b1", role: "bettor", canBet: false, myBet: "exploded" }) };
    }
    case "art-exploded": {
      const solved = solvedExcept("none");
      const v = base("outcome", now, {
        history: history().slice(1),
        status: status({ strikes: 3, solved: 3, outcome: { result: "exploded", reason: "strikes", remainingMs: 120_000, secondsLeft: 0 } }, now),
        bomb: bombView(null, null, solved),
      });
      return { typeId, screen: v, phone: phone(v, { id: "b1", role: "bettor", canBet: false, myBet: "defused" }) };
    }
    case "art-defused": {
      const v = base("outcome", now, {
        history: history().slice(0, 1),
        status: status({ strikes: 1, solved: 6, outcome: { result: "defused", reason: "all-solved", remainingMs: 64_000, secondsLeft: 64 } }, now),
        bomb: bombView(null, null, [0, 1, 2, 3, 4, 5]),
      });
      return { typeId, screen: v, phone: phone(v, { id: "b1", role: "bettor", canBet: false, myBet: "defused" }) };
    }
    case "art-final": {
      const v = base("final", now);
      return { typeId, screen: v, phone: { ...v, me: null } };
    }
  }
}
