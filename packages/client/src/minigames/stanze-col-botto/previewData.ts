/** Viste d'esempio di Stanze col botto per l'anteprima dei temi (`/preview`): nessuna partita da giocare. */
import type { Card, Me, Person, Phase, PhoneView, PublicView } from "./types";

export type BottoSceneId =
  | "scb-pairing"
  | "scb-deal"
  | "scb-round"
  | "scb-round-full"
  | "scb-offer"
  | "scb-swap"
  | "scb-known"
  | "scb-lock"
  | "scb-leaders"
  | "scb-hostages"
  | "scb-travel"
  | "scb-gamble"
  | "scb-reveal";

export const BOTTO_SCENES: { id: BottoSceneId; label: string }[] = [
  { id: "scb-pairing", label: "Botto: abbinamento con i QR" },
  { id: "scb-deal", label: "Botto: carte distribuite" },
  { id: "scb-round", label: "Botto: round (12 giocatori)" },
  { id: "scb-round-full", label: "Botto: round (30 giocatori)" },
  { id: "scb-offer", label: "Botto: proposta di scambio" },
  { id: "scb-swap", label: "Botto: scambio di persona con i QR" },
  { id: "scb-known", label: "Botto: carte viste" },
  { id: "scb-lock", label: "Botto: attesa del blocco" },
  { id: "scb-leaders", label: "Botto: leader rivelati" },
  { id: "scb-hostages", label: "Botto: scelta degli ostaggi" },
  { id: "scb-travel", label: "Botto: ostaggio in viaggio" },
  { id: "scb-gamble", label: "Botto: previsione" },
  { id: "scb-reveal", label: "Botto: rivelazione" },
];

const NAMES = ["Anna", "Bruno", "Carla", "Dario", "Elena", "Fabio", "Gianni", "Irene", "Luca", "Marta", "Nadia", "Oscar", "Paola", "Remo", "Sara", "Tommaso", "Ugo", "Vera", "Walter", "Zoe", "Alessandro", "Beatrice", "Costantino", "Domitilla", "Eleonora", "Francesco", "Graziella", "Ildebrando", "Jacopo", "Ludovica"];
const LONG = ["Maria Antonietta", "Gianfrancesco", "Bartolomeo", "Evangelina", "Costantino", "Margherita", "Alessandro", "Concetta", "Ferdinando", "Sebastiano", "Annalisa", "Pierpaolo", "Valentina", "Massimiliano", "Cristoforo"];

const person = (i: number, names = NAMES): Person => ({ id: `p${i}`, nickname: names[i] ?? `Giocatore ${i}` });
const split = (n: number, names = NAMES): [Person[], Person[]] => {
  const half = Math.ceil(n / 2);
  return [Array.from({ length: half }, (_, i) => person(i, names)), Array.from({ length: n - half }, (_, i) => person(half + i, names))];
};

function base(phase: Phase, now: number, n: number, ends: number | null, over: Partial<PublicView> = {}): PublicView {
  return {
    phase,
    phaseStartedAt: now,
    phaseEndsAt: ends === null ? null : now + ends,
    pausedRemainingMs: null,
    roomNames: ["Salotto", "Cucina"],
    round: 1,
    roundCount: 3,
    roundSeconds: 120,
    hostages: 1,
    hostagesNeeded: 1,
    rooms: split(n),
    unassigned: [],
    leaders: [null, null],
    leadersFresh: false,
    locked: [false, false],
    hostagesConfirmed: [false, false],
    startPressed: [false, false],
    exchange: null,
    hostSeesCards: false,
    ...over,
  };
}

const RULES = { players: 12, rounds: [{ seconds: 180, hostages: 2 }, { seconds: 120, hostages: 1 }, { seconds: 60, hostages: 1 }], colorAllowed: true, shareMethod: "both" as const, startAfterFirstSeconds: 5, startAfterExchangeSeconds: 15 };
const blueCard: Card = { team: "blue", character: "blue-member" };

const me = (over: Partial<Me> = {}): Me => ({
  id: "p1",
  room: 0,
  card: { team: "blue", character: "president" },
  joinRefused: null,
  leader: person(2),
  isLeader: false,
  leaderLocked: false,
  canVote: true,
  canAppoint: false,
  myVote: null,
  votes: { p2: 1 },
  abdicateTo: null,
  abdicationFrom: null,
  canAbdicate: false,
  hostagePicks: [],
  hostagesConfirmed: false,
  canPickHostages: false,
  canConfirmHostages: false,
  canStart: false,
  travel: null,
  canShare: true,
  colorAllowed: true,
  appSwap: true,
  qrSwap: false,
  qrCode: null,
  scanOut: null,
  scanIn: [],
  incoming: [],
  outgoing: null,
  known: [],
  canGamble: false,
  myGuess: null,
  ...over,
});

export function bottoScene(scene: BottoSceneId, now: number): { typeId: string; screen: unknown; phone: unknown } {
  const typeId = "stanze-col-botto";
  const phone = (v: PublicView, m: Me, rulesPlayers = v.rooms[0].length + v.rooms[1].length): PhoneView => ({ ...v, me: m, rules: { ...RULES, players: rulesPlayers } });
  switch (scene) {
    case "scb-pairing": {
      const v = base("pairing", now, 12, null, { round: 0, unassigned: [person(10), person(11)], rooms: [NAMES.slice(0, 5).map((_, i) => person(i)), NAMES.slice(5, 10).map((_, i) => person(5 + i))], pairing: { mode: "qr", codes: ["K7M2P", "X4N9Q"], capacity: 6 } });
      return { typeId, screen: v, phone: phone(v, me({ room: null, card: null })) };
    }
    case "scb-deal": {
      const v = base("deal", now, 12, null, { round: 0 });
      return { typeId, screen: v, phone: phone(v, me()) };
    }
    case "scb-round": {
      const v = base("round", now, 12, 87_000, { hostagesNeeded: 2 });
      return { typeId, screen: v, phone: phone(v, me({ votes: { p2: 3, p4: 1 }, myVote: "p2" })) };
    }
    case "scb-round-full": {
      const rooms: [Person[], Person[]] = [LONG.map((_, i) => person(i, LONG)), Array.from({ length: 15 }, (_, i) => ({ id: `p${15 + i}`, nickname: NAMES[15 + i]! }))];
      const v = base("round", now, 30, 87_000, { hostagesNeeded: 3, leaders: [person(2, LONG), person(20)], rooms });
      return { typeId, screen: v, phone: phone(v, me({ votes: { p2: 4, p4: 2 } }), 30) };
    }
    case "scb-offer": {
      const v = base("round", now, 12, 87_000);
      return { typeId, screen: v, phone: phone(v, me({ incoming: [{ seq: 4, kind: "card", at: now, from: person(3) }] })) };
    }
    case "scb-swap": {
      const v = base("round", now, 12, 87_000);
      return { typeId, screen: v, phone: phone(v, me({ qrSwap: true, qrCode: "K7M2P9", scanIn: [person(3)] })) };
    }
    case "scb-known": {
      const v = base("round", now, 12, 87_000);
      return { typeId, screen: v, phone: phone(v, me({ known: [{ playerId: "p3", nickname: "Dario", seq: 1, level: "card", card: { team: "red", character: "bomber" } }] })) };
    }
    case "scb-lock": {
      const v = base("lock", now, 12, 20_000, { locked: [true, false], leaders: [person(2), null] });
      return { typeId, screen: v, phone: phone(v, me({ leaderLocked: true, canVote: false })) };
    }
    case "scb-leaders": {
      const v = base("hostages", now, 12, 20_000, { leaders: [person(2), person(8)], leadersFresh: true, locked: [true, true], hostagesConfirmed: [true, false] });
      return { typeId, screen: v, phone: phone(v, me({ canVote: false, leaderLocked: true, hostagePicks: ["p4"] })) };
    }
    case "scb-hostages": {
      const v = base("hostages", now, 12, 20_000, { hostagesNeeded: 2, leaders: [person(1), person(8)], leadersFresh: true, locked: [true, true] });
      return { typeId, screen: v, phone: phone(v, me({ leader: person(1), isLeader: true, canVote: false, leaderLocked: true, hostagePicks: ["p3"], canPickHostages: true, canShare: false })) };
    }
    case "scb-travel": {
      const moved = [{ ...person(4), from: 0 as const, to: 1 as const }, { ...person(9), from: 1 as const, to: 0 as const }];
      const v = base("exchange", now, 12, 15_000, { leaders: [person(2), person(8)], leadersFresh: true, locked: [true, true], startPressed: [true, false], exchange: { round: 1, moved } });
      return { typeId, screen: v, phone: phone(v, me({ id: "p4", travel: { from: 0, to: 1 }, room: 1, canVote: false })) };
    }
    case "scb-gamble": {
      const v = base("gamble", now, 11, 20_000, { round: 2 });
      return { typeId, screen: v, phone: phone(v, me({ card: { team: "grey", character: "gambler" }, canGamble: true, canVote: false }), 11) };
    }
    case "scb-reveal": {
      const cards = NAMES.slice(0, 12).map((nickname, i) => ({
        id: `p${i}`,
        nickname,
        room: (i < 6 ? 0 : 1) as 0 | 1,
        card: (i === 1 ? { team: "blue", character: "president" } : i === 3 ? { team: "red", character: "bomber" } : i % 2 ? blueCard : { team: "red", character: "red-member" }) as Card,
      }));
      const v = base("reveal", now, 12, null, { round: 2, cards, outcome: { winner: "red", reason: "Il Presidente era nella stanza del Bombarolo: botto!", sameRoom: true }, gamblerGuess: null });
      return { typeId, screen: v, phone: phone(v, me({ card: { team: "red", character: "red-member" } })) };
    }
  }
}
