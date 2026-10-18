/** Viste d'esempio di Agenti Segreti per l'anteprima dei temi (`/preview`): nessuna partita da giocare. */
import type { CardKind, Me, Phase, PhoneView, PublicCard, PublicView, Side } from "./types";

export type AgentiSceneId = "as-setup" | "as-clue" | "as-guess" | "as-guess-spy" | "as-wrong" | "as-assassin" | "as-reveal" | "as-small";

export const AGENTI_SCENES: { id: AgentiSceneId; label: string }[] = [
  { id: "as-setup", label: "Agenti: squadre e Capi-spia" },
  { id: "as-clue", label: "Agenti: il Capo-spia scrive l'indizio" },
  { id: "as-guess", label: "Agenti: voto con i pallini (30 giocatori)" },
  { id: "as-guess-spy", label: "Agenti: il Capo-spia guarda il voto" },
  { id: "as-wrong", label: "Agenti: carta sbagliata, tocca agli altri" },
  { id: "as-assassin", label: "Agenti: l'assassino" },
  { id: "as-reveal", label: "Agenti: mappa completa" },
  { id: "as-small", label: "Agenti: griglia 4×4" },
];

const NAMES = [
  "Anna", "Bruno", "Carla", "Dario", "Elena", "Fabio", "Gianni", "Irene", "Luca", "Marta",
  "Nadia", "Oscar", "Paola", "Quirino", "Rita", "Sergio", "Teresa", "Ugo", "Valeria", "Walter",
  "Zoe", "Alberto", "Beatrice", "Cesare", "Debora", "Emanuele", "Federica", "Giacomo", "Ilaria", "Leonardo",
];

/** Le parole più lunghe della lista d'esempio, perché l'anteprima mostri il caso peggiore. */
const WORDS = [
  "Paracadute", "Balena", "Passaporto", "Luna", "Pianoforte",
  "Satellite", "Ponte", "Dinosauro", "Bottiglia", "Oca",
  "Formaggio", "Forchetta", "Tartaruga", "Scheletro", "Orchestra",
  "Ambulanza", "Bersaglio", "Roma", "Cammello", "Telefono",
  "Pinguino", "Ago", "Cervello", "Ospedale", "Zucchero",
];
const MAP: CardKind[] = [
  "red", "civilian", "blue", "red", "blue",
  "assassin", "red", "civilian", "blue", "red",
  "blue", "red", "civilian", "blue", "red",
  "civilian", "blue", "red", "civilian", "red",
  "blue", "civilian", "red", "blue", "blue",
];
const RULES = { gridSize: "5x5" as const, first: 9, second: 8, civilians: 7, assassins: 1, clueSeconds: 90, guessSeconds: 60, maxTurns: 0, allowZeroInfinity: true, win: 100, perAgent: 0 };

function base(phase: Phase, n: number, now: number, ends: number | null, revealed: number[], over = false): PublicView {
  const people = NAMES.slice(0, n).map((nickname, i) => ({ id: `p${i}`, nickname }));
  const red = people.filter((_, i) => i % 2 === 0);
  const blue = people.filter((_, i) => i % 2 === 1);
  const cards: PublicCard[] = WORDS.map((word, i) =>
    revealed.includes(i) || over ? { word, revealed: revealed.includes(i), kind: MAP[i]!, revealedBy: revealed.includes(i) ? (MAP[i] === "blue" ? "blue" : "red") : null } : { word, revealed: false },
  );
  const left = (side: Side) => MAP.filter((k, i) => k === side && !revealed.includes(i)).length;
  return {
    phase,
    phaseStartedAt: now,
    phaseEndsAt: ends === null ? null : now + ends,
    pausedRemainingMs: null,
    rules: RULES,
    starting: "red",
    turn: "red",
    turnNumber: 3,
    maxTurns: 0,
    teams: {
      red: { name: "Rossi", color: "#e5484d", spymaster: red[0]!, members: red, agentsLeft: phase === "setup" ? null : left("red") },
      blue: { name: "Blu", color: "#3e63dd", spymaster: blue[0]!, members: blue, agentsLeft: phase === "setup" ? null : left("blue") },
    },
    cards: phase === "setup" ? [] : cards,
    clue: phase === "guess" ? { side: "red", word: "Viaggio", count: 3, guesses: 1 } : null,
    guessesLeft: phase === "guess" ? 3 : null,
    clues: [
      { seq: 1, side: "red", word: "Mare", count: 2, guesses: 2, rejected: false },
      { seq: 2, side: "blue", word: "Musica", count: 2, guesses: 1, rejected: false },
      ...(phase === "guess" ? [{ seq: 3, side: "red" as const, word: "Viaggio", count: 3, guesses: 1, rejected: false }] : []),
    ],
    votes: [],
    voters: 0,
    confirmed: 0,
    canPass: false,
    lastEnd: { side: "blue", reason: "wrong" },
    lastReveal: revealed.at(-1) ?? null,
    blindBroken: false,
    outcome: null,
  };
}

const me = (over: Partial<Me> = {}): Me => ({ id: "p2", side: "red", role: "agent", canClue: false, canVote: false, myPick: null, confirmed: false, ...over });

/** Voti della squadra rossa (14 agenti), su tre carte e «Passa». */
function withVotes(v: PublicView): PublicView {
  const agents = v.teams.red.members.slice(1);
  const on = (option: string, from: number, to: number) => ({ option, voters: agents.slice(from, to) });
  return { ...v, votes: [on("2", 0, 6), on("4", 6, 10), on("13", 10, 12), on("pass", 12, 13)], voters: agents.length, confirmed: 5, canPass: true };
}

export function agentiScene(scene: AgentiSceneId, now: number): { typeId: string; screen: unknown; phone: unknown } {
  const typeId = "agenti-segreti";
  const phone = (v: PublicView, m: Me): PhoneView => ({ ...v, me: m });
  const revealed = [0, 3, 1, 2];
  switch (scene) {
    case "as-setup": {
      const v = base("setup", 12, now, null, []);
      return { typeId, screen: v, phone: phone(v, me({ id: "p0", role: "spymaster" })) };
    }
    case "as-clue": {
      const v = base("clue", 12, now, 90_000, revealed);
      return { typeId, screen: v, phone: phone(v, me({ id: "p0", role: "spymaster", canClue: true, map: MAP, clueError: "«Balena» è una parola della griglia" })) };
    }
    case "as-guess": {
      const v = withVotes(base("guess", 30, now, 42_000, [...revealed, 6]));
      return { typeId, screen: v, phone: phone(v, me({ canVote: true, myPick: "2" })) };
    }
    case "as-guess-spy": {
      const v = withVotes(base("guess", 30, now, 42_000, [...revealed, 6]));
      return { typeId, screen: v, phone: phone(v, me({ id: "p0", role: "spymaster", map: MAP })) };
    }
    case "as-wrong": {
      const v = { ...base("clue", 12, now, 90_000, revealed), turn: "blue" as const, lastEnd: { side: "red" as const, reason: "wrong" as const } };
      return { typeId, screen: v, phone: phone(v, me()) };
    }
    case "as-assassin": {
      const v: PublicView = { ...base("reveal", 12, now, null, [...revealed, 5], true), outcome: { winner: "blue", reason: "assassin" } };
      return { typeId, screen: v, phone: phone(v, me()) };
    }
    case "as-reveal": {
      const reds = MAP.flatMap((k, i) => (k === "red" ? [i] : []));
      const v: PublicView = { ...base("reveal", 30, now, null, [...new Set([...revealed, ...reds])], true), outcome: { winner: "red", reason: "agents" } };
      return { typeId, screen: v, phone: phone(v, me({ id: "p0", role: "spymaster", map: MAP })) };
    }
    case "as-small": {
      const full = base("guess", 4, now, 60_000, [0]);
      const v: PublicView = { ...full, rules: { ...RULES, gridSize: "4x4", first: 6, second: 5, civilians: 4 }, cards: full.cards.slice(0, 16) };
      return { typeId, screen: v, phone: phone(v, me({ id: "p2", canVote: true })) };
    }
  }
}
