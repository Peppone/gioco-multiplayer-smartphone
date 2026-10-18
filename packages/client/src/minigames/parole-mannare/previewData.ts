/** Viste d'esempio di Parole Mannare per l'anteprima dei temi (`/preview`): nessuna partita da giocare. */
import type { Me, Phase, PhoneView, PublicView, Role } from "./types";

export type ParoleSceneId =
  | "pm-word"
  | "pm-night"
  | "pm-questions"
  | "pm-questions-player"
  | "pm-grace"
  | "pm-seer-hunt"
  | "pm-vote"
  | "pm-runoff"
  | "pm-reveal";

export const PAROLE_SCENES: { id: ParoleSceneId; label: string }[] = [
  { id: "pm-word", label: "Parole: scelta della parola" },
  { id: "pm-night", label: "Parole: notte (Lupo)" },
  { id: "pm-questions", label: "Parole: domande, Sindaco (12 giocatori)" },
  { id: "pm-questions-player", label: "Parole: domande, giocatore" },
  { id: "pm-grace", label: "Parole: Esatto" },
  { id: "pm-seer-hunt", label: "Parole: caccia al Veggente" },
  { id: "pm-vote", label: "Parole: voto sul Lupo" },
  { id: "pm-runoff", label: "Parole: ballottaggio" },
  { id: "pm-reveal", label: "Parole: rivelazione" },
];

const NAMES = ["Anna", "Bruno", "Carla", "Dario", "Elena", "Fabio", "Gianni", "Irene", "Luca", "Marta", "Nadia", "Oscar"];
const ROLES: Role[] = ["villager", "villager", "werewolf", "villager", "villager", "seer", "villager", "villager", "werewolf", "villager", "villager", "werewolf"];
const summary = (i: number) => ({ yes: (i * 3) % 5, no: (i * 2) % 4, maybe: i % 3, close: i === 2 ? 1 : 0, far: i === 1 ? 1 : 0 });

function base(phase: Phase, now: number, n: number, ends: number | null): PublicView {
  const players = NAMES.slice(0, n).map((nickname, i) => ({ id: `p${i}`, nickname, summary: phase === "questions" || phase === "correct-grace" ? summary(i) : { yes: 0, no: 0, maybe: 0, close: 0, far: 0 } }));
  return {
    phase,
    phaseStartedAt: now,
    phaseEndsAt: ends === null ? null : now + ends,
    pausedRemainingMs: null,
    mayor: { id: "p4", nickname: NAMES[4]! },
    players,
    reserves: { yesNo: 23, maybe: 9, close: 0, far: 1 },
    rules: { players: n, werewolves: n >= 12 ? 3 : n >= 7 ? 2 : 1, questionSeconds: 240, yesNoPool: 36, maybePool: 12, closeTokens: 1, farTokens: 1, seerHuntSeconds: 30, voteSeconds: 60, runoffSeconds: 30 },
    log: [
      { seq: 1, playerId: "p0", nickname: "Anna", token: "yes", undone: false },
      { seq: 2, playerId: "p1", nickname: "Bruno", token: "far", undone: false },
      { seq: 3, playerId: "p2", nickname: "Carla", token: "no", undone: true },
      { seq: 4, playerId: "p2", nickname: "Carla", token: "close", undone: false },
    ],
    correctBy: null,
    runoff: null,
    voted: 0,
    voters: 0,
    word: null,
    wolves: null,
  };
}

const me = (over: Partial<Me> = {}): Me => ({
  id: "p2",
  isMayor: false,
  role: "werewolf",
  word: "Faro",
  wordOptions: null,
  mates: ["Irene", "Oscar"],
  seen: false,
  canVote: false,
  targets: [],
  myVote: null,
  teamVotes: null,
  canUndo: false,
  lastToken: null,
  ...over,
});

const targets = (ids: number[]) => ids.map((i) => ({ id: `p${i}`, nickname: NAMES[i]! }));

export function paroleScene(scene: ParoleSceneId, now: number): { typeId: string; screen: unknown; phone: unknown } {
  const typeId = "parole-mannare";
  const roles = NAMES.slice(0, 12).map((nickname, i) => ({ id: `p${i}`, nickname, role: ROLES[i]! }));
  const phone = (v: PublicView, m: Me): PhoneView => ({ ...v, me: m });
  switch (scene) {
    case "pm-word": {
      const v = base("word", now, 12, 20_000);
      return { typeId, screen: v, phone: phone(v, me({ id: "p4", isMayor: true, role: null, word: null, wordOptions: ["Faro", "Ombrello", "Violino"], mates: [] })) };
    }
    case "pm-night": {
      const v = base("night", now, 12, 15_000);
      return { typeId, screen: v, phone: phone(v, me()) };
    }
    case "pm-questions": {
      const v = base("questions", now, 12, 167_000);
      return { typeId, screen: v, phone: phone(v, me({ id: "p4", isMayor: true, role: "villager", mates: [], canUndo: true, lastToken: { token: "close", nickname: "Carla" } })) };
    }
    case "pm-questions-player": {
      const v = base("questions", now, 8, 167_000);
      return { typeId, screen: v, phone: phone(v, me()) };
    }
    case "pm-grace": {
      const v = { ...base("correct-grace", now, 8, 5_000), correctBy: "Carla" };
      return { typeId, screen: v, phone: phone(v, me({ id: "p4", isMayor: true, role: "villager", mates: [] })) };
    }
    case "pm-seer-hunt": {
      const v = { ...base("seer-hunt", now, 8, 30_000), correctBy: "Carla", wolves: ["Carla", "Irene"], voted: 1, voters: 2 };
      return { typeId, screen: v, phone: phone(v, me({ canVote: true, targets: targets([0, 1, 3, 4, 5, 6]), myVote: "p5", teamVotes: { p2: "p5" } })) };
    }
    case "pm-vote": {
      const v = { ...base("werewolf-vote", now, 12, 60_000), word: "Faro", voted: 5, voters: 12 };
      return { typeId, screen: v, phone: phone(v, me({ canVote: true, targets: targets([0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11]), myVote: "p8" })) };
    }
    case "pm-runoff": {
      const v = { ...base("werewolf-vote", now, 12, 30_000), word: "Faro", voted: 3, voters: 12, runoff: [{ id: "p0", nickname: "Anna" }, { id: "p8", nickname: "Luca" }] };
      return { typeId, screen: v, phone: phone(v, me({ canVote: true, targets: targets([0, 8]), myVote: null })) };
    }
    case "pm-reveal": {
      const v = { ...base("reveal", now, 12, null), word: "Faro", roles, outcome: { winner: "village" as const, reason: "Il Lupo è stato scoperto" } };
      return { typeId, screen: v, phone: phone(v, me()) };
    }
  }
}
