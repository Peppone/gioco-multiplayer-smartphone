/** Viste d'esempio di Lunghezza d'Onda per l'anteprima dei temi (`/preview`): nessuna partita da giocare. */
import type { Me, Mode, Phase, PhoneView, PublicView, TurnResult } from "./types";

export type OndaSceneId = "lo-pick" | "lo-clue" | "lo-guess" | "lo-guess-psychic" | "lo-guess-team" | "lo-counter" | "lo-reveal" | "lo-reveal-team" | "lo-final";

export const ONDA_SCENES: { id: OndaSceneId; label: string }[] = [
  { id: "lo-pick", label: "Onda: scelta dello spettro" },
  { id: "lo-clue", label: "Onda: indizio del Sensitivo" },
  { id: "lo-guess", label: "Onda: quadrante (30 giocatori)" },
  { id: "lo-guess-psychic", label: "Onda: il Sensitivo aspetta" },
  { id: "lo-guess-team", label: "Onda: squadra con mediana" },
  { id: "lo-counter", label: "Onda: scommessa" },
  { id: "lo-reveal", label: "Onda: rivelazione (29 pallini)" },
  { id: "lo-reveal-team", label: "Onda: rivelazione a squadre" },
  { id: "lo-final", label: "Onda: classifica" },
];

const NAMES = [
  "Anna", "Bruno", "Carla", "Dario", "Elena", "Fabio", "Gianni", "Irene", "Luca", "Marta",
  "Nadia", "Oscar", "Paola", "Quirino", "Rita", "Sergio", "Teresa", "Ugo", "Valeria", "Walter",
  "Zoe", "Alberto", "Beatrice", "Cesare", "Debora", "Emanuele", "Federica", "Giacomo", "Ilaria", "Leonardo",
];
const SPECTRUM = { left: "Da evitare al primo appuntamento", right: "Perfetto al primo appuntamento" };
const RULES = { turns: 8, targetScore: 10, zoneWidth: 5, unitPoints: 25, counterPoints: 1, catchUp: true, clueSeconds: 60, guessSeconds: 60, counterSeconds: 20 };
const TEAMS = [
  { id: "t1", name: "Rossi", color: "#e5484d" },
  { id: "t2", name: "Blu", color: "#3e63dd" },
];

function base(phase: Phase, mode: Mode, n: number, now: number, ends: number | null): PublicView {
  const players = NAMES.slice(0, n).map((nickname, i) => ({ id: `p${i}`, nickname }));
  const team = mode === "squadre";
  return {
    phase,
    phaseStartedAt: now,
    phaseEndsAt: ends === null ? null : now + ends,
    pausedRemainingMs: null,
    mode,
    rules: { mode, ...RULES, turns: team ? 20 : 8 },
    played: 2,
    maxTurns: team ? 20 : 8,
    turn: {
      number: 3,
      catchUp: false,
      psychic: { id: "p2", nickname: "Carla" },
      teamId: team ? "t1" : null,
      spectrum: phase === "pick" ? null : SPECTRUM,
      clue: phase === "pick" || phase === "clue" ? null : "Parlare dell'ex",
    },
    teams: team
      ? TEAMS.map((t, ti) => ({ ...t, score: ti === 0 ? 6 : 4, members: players.filter((_, i) => i % 2 === ti) }))
      : [],
    standings: players.map((p, i) => ({ ...p, points: Math.max(0, 300 - i * 25) })),
    guessers: phase === "guess" ? (team ? Math.ceil(n / 2) - 1 : n - 1) : 0,
    confirmed: phase === "guess" ? (team ? 2 : 17) : 0,
    teamDials: null,
    teamPos: null,
    counterVoters: phase === "counter" ? Math.floor(n / 2) : 0,
    counterVoted: phase === "counter" ? 2 : 0,
    result: null,
    history: [],
  };
}

const teamDials = [
  { playerId: "p0", nickname: "Anna", pos: 18, confirmed: true },
  { playerId: "p4", nickname: "Elena", pos: 24.5, confirmed: false },
  { playerId: "p6", nickname: "Gianni", pos: 31, confirmed: true },
];

const me = (over: Partial<Me> = {}): Me => ({ id: "p0", role: "guesser", teamId: null, myDial: null, confirmed: false, myCounter: null, teamCounter: null, ...over });

export function ondaScene(scene: OndaSceneId, now: number): { typeId: string; screen: unknown; phone: unknown } {
  const typeId = "lunghezza-onda";
  const phone = (v: PublicView, m: Me): PhoneView => ({ ...v, me: m });
  switch (scene) {
    case "lo-pick": {
      const v = base("pick", "tutti", 12, now, 20_000);
      return { typeId, screen: v, phone: phone(v, me({ id: "p2", role: "psychic", options: [SPECTRUM, { left: "Sopravvalutato", right: "Sottovalutato" }] })) };
    }
    case "lo-clue": {
      const v = base("clue", "tutti", 12, now, 60_000);
      return { typeId, screen: v, phone: phone(v, me({ id: "p2", role: "psychic", target: 23 })) };
    }
    case "lo-guess": {
      const v = base("guess", "tutti", 30, now, 42_000);
      return { typeId, screen: v, phone: phone(v, me({ myDial: 30, confirmed: false })) };
    }
    case "lo-guess-psychic": {
      const v = base("guess", "tutti", 12, now, 42_000);
      return { typeId, screen: v, phone: phone(v, me({ id: "p2", role: "psychic", target: 23 })) };
    }
    case "lo-guess-team": {
      const v = { ...base("guess", "squadre", 14, now, 42_000), teamDials, teamPos: 24.5 };
      return { typeId, screen: v, phone: phone(v, me({ teamId: "t1", myDial: 18, confirmed: true })) };
    }
    case "lo-counter": {
      const v = { ...base("counter", "squadre", 14, now, 15_000), teamDials, teamPos: 24.5 };
      return {
        typeId,
        screen: v,
        phone: phone(v, me({ id: "p1", role: "counter", teamId: "t2", myCounter: "right", teamCounter: [{ playerId: "p1", nickname: "Bruno", dir: "right" }, { playerId: "p3", nickname: "Dario", dir: "left" }] })),
      };
    }
    case "lo-reveal": {
      const guesses = NAMES.slice(0, 30)
        .map((_, i) => i)
        .filter((i) => i !== 2)
        .map((i) => {
          const pos = Math.round(((i * 37) % 70) + 5);
          const d = Math.abs(pos - 23);
          const zone = (d <= 2.5 ? 4 : d <= 7.5 ? 3 : d <= 12.5 ? 2 : 0) as TurnResult["zone"];
          return { playerId: `p${i}`, pos, zone, points: zone * 25 };
        });
      const result: TurnResult = { number: 3, psychicId: "p2", teamId: null, spectrum: SPECTRUM, clue: "Parlare dell'ex", target: 23, guesses, psychicPoints: 34, teamPos: null, zone: 0, counters: [] };
      const v = { ...base("reveal", "tutti", 30, now, null), result };
      return { typeId, screen: v, phone: phone(v, me({ myDial: guesses[0]!.pos, confirmed: true })) };
    }
    case "lo-reveal-team": {
      const result: TurnResult = {
        number: 3,
        psychicId: "p2",
        teamId: "t1",
        spectrum: SPECTRUM,
        clue: "Parlare dell'ex",
        target: 23,
        guesses: teamDials.map((d) => ({ playerId: d.playerId, pos: d.pos, zone: 0, points: 0 })),
        psychicPoints: 0,
        teamPos: 24.5,
        zone: 4,
        counters: [{ teamId: "t2", dir: "left", correct: true, points: 0 }],
      };
      const v = { ...base("reveal", "squadre", 14, now, null), result };
      return { typeId, screen: v, phone: phone(v, me({ teamId: "t1", myDial: 18, confirmed: true })) };
    }
    case "lo-final": {
      const v = base("final", "tutti", 30, now, null);
      return { typeId, screen: v, phone: phone(v, me()) };
    }
  }
}
