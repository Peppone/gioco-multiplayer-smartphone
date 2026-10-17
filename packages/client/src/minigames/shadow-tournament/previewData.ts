/** Viste d'esempio di Shadow Tournament per l'anteprima dei temi (`/preview`): nessuna partita da giocare. */

export type ShadowSceneId = "shadow-intro" | "shadow-choose" | "shadow-react" | "shadow-reward" | "shadow-out" | "shadow-bye" | "shadow-podium";

export const SHADOW_SCENES: { id: ShadowSceneId; label: string }[] = [
  { id: "shadow-intro", label: "Shadow: regole" },
  { id: "shadow-choose", label: "Shadow: scelta (30 giocatori)" },
  { id: "shadow-react", label: "Shadow: reazioni" },
  { id: "shadow-reward", label: "Shadow: ricompensa" },
  { id: "shadow-out", label: "Shadow: eliminato" },
  { id: "shadow-bye", label: "Shadow: Bye o NPC" },
  { id: "shadow-podium", label: "Shadow: podio" },
];

const NAMES = ["Gina", "Marco", "Sofia", "Luca", "Anna", "Paolo", "Giulia", "Enrico", "Chiara", "Matteo", "Elisa", "Davide", "Sara", "Andrea", "Marta"];
const costs = { bet: 2, shield: 1, trap: 1, swap: 2, counter: 2, extraLife: 2 };
const rules = {
  startLives: 3,
  maxLives: 5,
  startTokens: 2,
  maxTokens: 6,
  allStartLoser: false,
  costs,
  decks: {
    normal: [
      { label: "+1 token", qty: 5, tokens: 1, nextLives: 0, either: false },
      { label: "+2 token", qty: 3, tokens: 2, nextLives: 0, either: false },
      { label: "+1 token e 1 vita", qty: 2, tokens: 1, nextLives: 1, either: false },
      { label: "Neutra", qty: 3, tokens: 0, nextLives: 0, either: false },
      { label: "Rischio lieve", qty: 2, tokens: -1, nextLives: 0, either: false },
    ],
    legendary: [
      { label: "+3 token", qty: 4, tokens: 3, nextLives: 0, either: false },
      { label: "Vantaggio rischioso", qty: 1, tokens: 2, nextLives: -1, either: false },
      { label: "Rischio forte", qty: 3, tokens: -2, nextLives: -1, either: true },
    ],
  },
  points: { placement: [1000, 700, 500], placementMin: 100, boutWin: 50, prediction: 30 },
};

const fighters = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? i : ""}`,
    status: i % 7 === 6 ? ("out" as const) : i % 3 === 0 ? ("L" as const) : ("W" as const),
    tokens: i % 6,
    boutsWon: i % 4,
  }));

type Phase = "extraLife" | "choose" | "react" | "counter" | "show" | "reward" | "risk" | "done";

function bout(now: number, id: string, a: ReturnType<typeof fighters>[number], b: ReturnType<typeof fighters>[number], over: Record<string, unknown> = {}) {
  const side = (f: typeof a, lives: number) => ({ id: f.id, nickname: f.nickname, status: f.status === "out" ? ("L" as const) : f.status, tokens: f.tokens, lives, extraLife: false, blocked: null, picked: false, reacted: false });
  return {
    id,
    phase: "choose" as Phase,
    openedAt: now,
    deadline: now + 12_000,
    exchanges: 2,
    sides: [side(a, 2), side(b, 3)],
    npcPlayer: null,
    reveal: null,
    waitingReact: 0,
    swapBy: null,
    counterBy: null,
    last: null,
    winnerId: null,
    loserId: null,
    reward: null,
    spotlight: false,
    ...over,
  };
}

export function shadowScene(scene: ShadowSceneId, now: number) {
  const f = fighters(30);
  const alive = f.filter((x) => x.status !== "out");
  const [a, b] = [alive[0]!, alive[1]!];
  const others = Array.from({ length: 14 }, (_, i) => {
    const x = alive[2 + (i % (alive.length - 2))]!;
    const y = alive[3 + (i % (alive.length - 3))]!;
    return bout(now, `t3-${i + 2}`, x, y, { phase: i % 4 === 0 ? "done" : "choose", winnerId: i % 4 === 0 ? x.id : null });
  });
  const base = { phase: "bouts" as const, turn: 3, paused: false, openedAt: now, deadline: now + 10_000, alive: alive.length, total: 30, fighters: f, bye: null, rules: null };
  const phoneBase = { phase: "bouts", turn: 3, openedAt: now, deadline: now + 10_000, alive: alive.length, total: 30, costs, maxTokens: 6, rules };
  const me = { id: a.id, nickname: a.nickname, status: a.status, tokens: 3, nextLives: 0, boutsWon: 1, hits: 0 };
  const mine = {
    pick: null,
    canBet: true,
    blockedCard: null,
    canExtraLife: false,
    extraDecided: null,
    reactions: [] as string[],
    swapCards: ["defense", "trick"],
    reacted: false,
    canCounter: false,
    counterCost: 5,
    wonBout: null as boolean | null,
    canChooseDeck: false,
    riskChoice: null,
  };
  const phoneBout = (view: ReturnType<typeof bout>, my: typeof mine) => ({ ...phoneBase, role: "bout", me, asNpc: false, mySide: a.id, opponentId: b.id, bout: view, my });

  switch (scene) {
    case "shadow-intro":
      return {
        typeId: "shadow-tournament",
        screen: { ...base, phase: "intro", turn: 0, bouts: [], focusId: null, rules, podium: null },
        phone: { ...phoneBase, phase: "intro", turn: 0, role: "wait", me, byeNow: null, bye: null },
      };
    case "shadow-choose": {
      const focus = bout(now, "t3-1", a, b, { spotlight: true, sides: [{ ...bout(now, "x", a, b).sides[0], picked: true }, bout(now, "x", a, b).sides[1]] });
      return { typeId: "shadow-tournament", screen: { ...base, bouts: [focus, ...others], focusId: "t3-1", podium: null }, phone: phoneBout(focus, mine) };
    }
    case "shadow-react": {
      const focus = bout(now, "t3-1", a, b, {
        phase: "react",
        deadline: now + 8_000,
        waitingReact: 1,
        reveal: { cards: { [a.id]: "attack", [b.id]: "defense" }, bets: { [a.id]: false, [b.id]: true }, winnerId: b.id },
      });
      return {
        typeId: "shadow-tournament",
        screen: { ...base, bouts: [focus, ...others], focusId: "t3-1", podium: null },
        phone: phoneBout(focus, { ...mine, reactions: ["shield", "trap", "swap"] }),
      };
    }
    case "shadow-reward": {
      const focus = bout(now, "t3-1", a, b, { phase: "reward", winnerId: a.id, loserId: b.id, reward: null });
      return {
        typeId: "shadow-tournament",
        screen: { ...base, bouts: [focus, ...others], focusId: "t3-1", podium: null },
        phone: phoneBout(focus, { ...mine, wonBout: true, canChooseDeck: true }),
      };
    }
    case "shadow-out": {
      const out = f.find((x) => x.status === "out")!;
      const spot = bout(now, "t3-1", a, b, { spotlight: true, exchanges: 0 });
      return {
        typeId: "shadow-tournament",
        screen: { ...base, bouts: [spot, ...others], focusId: "t3-1", podium: null },
        phone: { ...phoneBase, role: "out", me: { ...me, id: out.id, nickname: out.nickname, status: "out", hits: 2 }, spotlight: spot, canPredict: true, prediction: null },
      };
    }
    case "shadow-bye":
      return {
        typeId: "shadow-tournament",
        screen: { ...base, phase: "bye", bouts: [], focusId: null, bye: { id: a.id, nickname: a.nickname, choice: null }, podium: null },
        phone: { ...phoneBase, phase: "bye", role: "bye", me },
      };
    case "shadow-podium": {
      const podium = f.map((x, i) => ({ id: x.id, nickname: x.nickname, rank: i + 1, points: Math.max(100, 1000 - i * 40), boutsWon: x.boutsWon }));
      return {
        typeId: "shadow-tournament",
        screen: { ...base, phase: "done", bouts: [], focusId: null, podium },
        phone: { ...phoneBase, phase: "done", role: "done", me, podium, myRank: 2, myPoints: 700 },
      };
    }
  }
}
