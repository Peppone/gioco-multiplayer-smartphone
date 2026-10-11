/**
 * Cosa fa un bot in ogni minigioco: guarda la vista che il server gli ha mandato e decide gli input da inviare.
 * Restituisce una `key` che identifica la situazione (domanda, fase, battaglia…): il bot agisce una volta per key.
 */
export interface Decision {
  key: string;
  inputs: unknown[];
}

export type Rnd = () => number;

const pick = <T>(list: T[], rnd: Rnd): T => list[Math.floor(rnd() * list.length)]!;

type View = Record<string, any>;

function decideRound(typeId: string, v: View, rnd: Rnd): Decision | null {
  switch (typeId) {
    case "quiz-multipla":
      if (v.phase === "question" && v.myChoice === null) return { key: `q${v.index}`, inputs: [{ type: "answer", choice: Math.floor(rnd() * v.options.length) }] };
      return null;

    case "buzzer":
      // Non tutti premono: così si formano code di dimensioni diverse.
      if (v.canBuzz && !v.buzzed && (v.phase === "open" || v.phase === "collecting") && rnd() < 0.35) return { key: `b${v.question}`, inputs: [{ type: "buzz" }] };
      return null;

    case "indovina-canzone":
      if (v.canBuzz && !v.buzzed && (v.phase === "playing" || v.phase === "collecting") && rnd() < 0.35) return { key: `ic${v.phase}-${v.position}`, inputs: [{ type: "buzz" }] };
      return null;

    case "vero-falso":
      if (v.phase === "statement" && v.myAnswer === null) return { key: `vf${v.index}`, inputs: [{ type: "answer", value: rnd() < 0.5 }] };
      return null;

    case "stima":
      if (v.phase === "question" && v.myGuess === null) {
        const lo = v.min ?? 0;
        const hi = v.max ?? 1000;
        return { key: `st${v.index}`, inputs: [{ type: "guess", value: Math.round(lo + rnd() * (hi - lo)) }] };
      }
      return null;

    case "sondaggio":
      if (v.phase === "voting" && v.myVote === null) {
        const input = v.kind === "options" ? { type: "vote", option: Math.floor(rnd() * v.options.length) } : v.candidates.length > 0 ? { type: "vote", target: pick(v.candidates as { id: string }[], rnd).id } : null;
        return input ? { key: `po${v.index}`, inputs: [input] } : null;
      }
      return null;

    case "zombie-hunt": {
      if (v.phase !== "play" || (v.role !== "human" && v.role !== "zombie") || v.bye || v.opponent === null || v.choice !== null) return null;
      const r = rnd();
      // lo zombie morde quasi sempre, ogni tanto si mimetizza (se ha carte)
      if (v.role === "zombie" && (r < 0.7 || v.cards.length === 0)) return { key: `zh${v.round}`, inputs: [{ type: "bite" }] };
      const cards = v.cards as { suit: number; value: number }[];
      const follow = cards.filter((c) => c.suit === v.suit); // obbligo di seme
      const card = pick(follow.length > 0 ? follow : cards, rnd);
      const input = r < 0.12 && v.shotgun ? { type: "shotgun" } : r < 0.24 && v.vaccine ? { type: "vaccine" } : { type: "play", suit: card.suit, value: card.value };
      return { key: `zh${v.round}`, inputs: [input] };
    }

    default:
      return null;
  }
}

/** Il duello: minigioco figlio (avvolto in `child`), voto del draft e voto della battaglia. */
function decideDuel(v: View, rnd: Rnd): Decision | null {
  if (v.side === null || v.side === undefined) return null; // spettatore
  if (v.phase === "minigame" && v.minigame) {
    const inner = decideRound(v.minigame.typeId, v.minigame.view, rnd);
    return inner ? { key: `dm${v.battleNo}:${v.minigamesLeft}:${inner.key}`, inputs: inner.inputs.map((input) => ({ type: "child", input })) } : null;
  }
  if (v.phase === "draft" && v.draft?.role === "picker" && !v.draft.vote.confirmed) {
    const uid = pick(v.draft.cards as { uid: string }[], rnd).uid;
    return { key: `dd${v.battleNo}:${v.minigamesLeft}:${v.draft.first}`, inputs: [{ type: "draft-cast", uid }, { type: "draft-confirm" }] };
  }
  if (v.phase === "battle" && v.battle?.vote && !v.battle.vote.confirmed) {
    const hand = (v.hand ?? []) as { uid: string }[];
    if (hand.length === 0) return { key: `db${v.battleNo}`, inputs: [{ type: "vote-confirm" }] };
    const n = 1 + Math.floor(rnd() * Math.min(v.battle.vote.max, hand.length));
    const chosen = [...hand].sort(() => rnd() - 0.5).slice(0, n);
    return { key: `db${v.battleNo}`, inputs: [...chosen.map((c) => ({ type: "vote-cast", uid: c.uid })), { type: "vote-confirm" }] };
  }
  return null;
}

export function decide(typeId: string, view: unknown, rnd: Rnd): Decision | null {
  const v = view as View;
  return typeId === "knight-duel" ? decideDuel(v, rnd) : decideRound(typeId, v, rnd);
}

/** Generatore pseudo-casuale a seme: i bot sono riproducibili. */
export function makeRnd(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
