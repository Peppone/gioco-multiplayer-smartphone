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

    case "caccia-fantasmi": {
      if (v.phase !== "play") return null;
      // Un'azione sola per partita: i bot non conoscono i tempi di pausa e non devono martellare il server.
      if (v.role === "ghost") return { key: "gf-scan", inputs: [{ type: "scan", code: pick(GHOST_HUNT_BOT_CODES, rnd) }] };
      const suspects = (v.suspects ?? []) as { id: string }[];
      return suspects.length > 0 ? { key: "gf-accuse", inputs: [{ type: "accuse", target: pick(suspects, rnd).id }] } : null;
    }

    case "stanze-segrete":
      return decideStanze(v, rnd);

    case "shadow-tournament":
      return decideShadow(v, rnd);

    default:
      return null;
  }
}

/**
 * Shadow Tournament: carte a caso, azioni con probabilità moderata, mazzo a caso. La `key` include l'apertura della fase
 * dello scontro, così anche gli scambi rigiocati (pareggio, contromossa) ricevono una nuova risposta.
 */
function decideShadow(v: View, rnd: Rnd): Decision | null {
  if (v.role === "bye") return { key: `sh-bye-${v.turn}`, inputs: [{ type: "byeChoice", choice: rnd() < 0.5 ? "bye" : "npc" }] };
  if (v.role === "out") {
    const sides = (v.spotlight?.sides ?? []) as { id: string }[];
    return v.canPredict && !v.prediction && sides.length === 2 ? { key: `sh-pr-${v.turn}`, inputs: [{ type: "predict", winnerId: pick(sides, rnd).id }] } : null;
  }
  if (v.role !== "bout") return null;
  const b = v.bout, my = v.my;
  const key = `sh-${b.id}-${b.phase}-${b.openedAt}`;
  if (b.phase === "extraLife" && my.canExtraLife) return { key, inputs: [{ type: "extraLife", spend: rnd() < 0.5 }] };
  if (b.phase === "choose" && !my.pick) {
    const cards = (["attack", "defense", "trick"] as string[]).filter((c) => c !== my.blockedCard);
    return { key, inputs: [{ type: "play", card: pick(cards, rnd), bet: my.canBet && rnd() < 0.3 }] };
  }
  if (b.phase === "react" && !my.reacted && my.reactions.length > 0) {
    const action = pick(["pass", ...(my.reactions as string[])], rnd);
    return { key, inputs: [action === "swap" ? { type: "react", action, card: pick(my.swapCards as string[], rnd) } : { type: "react", action }] };
  }
  if (b.phase === "counter" && my.canCounter) return { key, inputs: [{ type: "react", action: rnd() < 0.5 ? "counter" : "pass" }] };
  if (b.phase === "reward" && my.canChooseDeck) return { key, inputs: [{ type: "deck", deck: rnd() < 0.5 ? "legendary" : "normal" }] };
  if (b.phase === "risk" && my.riskChoice) return { key, inputs: [{ type: "riskChoice", pay: my.riskChoice.canPayTokens ? "tokens" : "life" }] };
  return null;
}

/**
 * Stanze Segrete: un giocatore che fa quello che può quando il GM lo abilita. Accetta gli eventi, legge e risponde,
 * chiede di muoversi e di guardare la lettera, scrive al GM. Dopo ogni azione arriva un nuovo stato e ne segue
 * un'altra: è la «raffica» che mette sotto sforzo posta, richieste e database.
 */
function decideStanze(v: View, rnd: Rnd): Decision | null {
  if (!v.member) return null;
  const events = (v.pendingEvents ?? []) as { id: number }[];
  if (events.length > 0) return { key: `ss-ev-${events[0]!.id}`, inputs: [{ type: "accept-event", eventId: events[0]!.id }] };
  const msgs = (v.messages ?? []) as { id: number; mine: boolean; readAt: number | null; canReply: boolean }[];
  const unread = msgs.find((m) => !m.mine && m.readAt === null);
  if (unread) return { key: `ss-ack-${unread.id}`, inputs: [{ type: "ack", messageId: unread.id }] };
  const open = msgs.find((m) => m.canReply);
  if (open) return { key: `ss-reply-${open.id}`, inputs: [{ type: "reply", messageId: open.id, text: "Ricevuto, Master." }] };

  const pending = (v.pending ?? []) as { kind: string }[];
  const abilities = ((v.abilities ?? []) as { action: string }[]).map((a) => a.action);
  const move = v.compass?.move as Record<string, string> | undefined;
  if (move && !pending.some((r) => r.kind === "move")) {
    const dirs = Object.keys(move).filter((d) => move[d] === "open");
    if (dirs.length > 0) return { key: `ss-mv-${v.cell}-${v.feedback?.at ?? 0}`, inputs: [{ type: "move", direction: pick(dirs, rnd) }] };
  }
  if (abilities.includes("sight") && !v.sighting) return { key: `ss-sight-${v.cell}-${v.feedback?.at ?? 0}-${msgs.length}`, inputs: [{ type: "sight" }] };
  if (abilities.includes("message")) return { key: `ss-msg-${msgs.length}`, inputs: [{ type: "message", text: "Master, cosa succede?" }] };
  return null;
}

/**
 * Codici delle zone della configurazione di esempio di «Caccia ai Fantasmi». Chi gioca davvero li legge dai QR
 * appesi nella location, le viste non li contengono: i bot si affidano all'esempio (un test li tiene allineati).
 */
export const GHOST_HUNT_BOT_CODES = ["K7QD", "M2XP", "R9TV", "H4WZ"];

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
