import type { MinigameContext } from "@gioco/shared";
import { makeRng, shuffle } from "../knight-duel/rng.js";
import { type ShadowConfig, sampleShadowConfig } from "./config.js";
import { CARDS } from "./exchange.js";
import { type ShadowState, shadowTournament as plugin } from "./index.js";

/** Stile di gioco di un giocatore simulato: probabilità di usare ciascuna azione quando può. */
export interface Style {
  /** Probabilità di scegliere il mazzo Leggendario. */
  legendary: number;
  bet: number;
  extraLife: number;
  shield: number;
  trap: number;
  swap: number;
  counter: number;
}

export const BALANCED: Style = { legendary: 0.5, bet: 0.3, extraLife: 0.5, shield: 0.6, trap: 0.3, swap: 0.5, counter: 0.5 };

export interface SimOptions {
  players: number;
  seed: number;
  cfg?: Partial<ShadowConfig>;
  /** Secondi medi che un giocatore impiega a rispondere. */
  thinkSec?: number;
  /** Stile di ciascun giocatore (per indice); i mancanti giocano `BALANCED`. */
  styles?: Partial<Style>[];
}

export interface SimResult {
  state: ShadowState;
  /** Turni giocati e durata complessiva simulata. */
  turns: number;
  seconds: number;
  /** Quante volte è stata usata ogni azione. */
  usage: Record<string, number>;
}

/** Fa giocare un torneo intero a giocatori simulati che rispondono dopo un tempo casuale. */
export function simulateTournament(opts: SimOptions): SimResult {
  const cfg = { ...sampleShadowConfig, ...opts.cfg } as ShadowConfig;
  const ids = Array.from({ length: opts.players }, (_, i) => `p${i}`);
  const ctx: MinigameContext = { players: ids.map((id) => ({ id, nickname: id, teamId: null })), teams: [], seed: opts.seed };
  const rng = makeRng(opts.seed * 7919 + 13);
  const think = opts.thinkSec ?? 5;
  const usage: Record<string, number> = {};
  const used = (k: string) => (usage[k] = (usage[k] ?? 0) + 1);

  let now = 1_000_000;
  const start = now;
  let state = plugin.init(cfg, ctx, now);
  const send = (id: string, input: Parameters<typeof plugin.onInput>[2]) => {
    state = plugin.onInput(state, id, input, { receivedAt: now, claimedTime: now, rtt: 0 });
  };

  for (let step = 0; step < 20_000 && !plugin.isFinished(state); step++) {
    now += 1000;
    state = plugin.onTick(state, now);
    for (const [i, id] of shuffle(ids, rng).entries()) {
      if (rng() > 1 / think) continue; // sta ancora pensando
      const style = { ...BALANCED, ...opts.styles?.[Number(id.slice(1))] };
      const v = plugin.viewFor(state, id, null) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      void i;
      if (v.role === "bye") send(id, { type: "byeChoice", choice: rng() < 0.5 ? "bye" : "npc" });
      else if (v.role === "out" && v.canPredict && !v.prediction) {
        const sides = v.spotlight.sides as { id: string }[];
        send(id, { type: "predict", winnerId: sides[Math.floor(rng() * 2)]!.id });
      } else if (v.role === "bout") {
        const b = v.bout, my = v.my;
        if (b.phase === "extraLife" && my.canExtraLife) {
          const spend = rng() < style.extraLife;
          if (spend) used("extraLife");
          send(id, { type: "extraLife", spend });
        } else if (b.phase === "choose" && !my.pick) {
          const allowed = CARDS.filter((c) => c !== my.blockedCard);
          const bet = my.canBet && rng() < style.bet;
          if (bet) used("bet");
          send(id, { type: "play", card: allowed[Math.floor(rng() * allowed.length)]!, bet });
        } else if (b.phase === "react" && !my.reacted && my.reactions.length > 0) {
          const options: string[] = my.reactions;
          const pick = options.find((a) => rng() < (style as Record<string, number>)[a === "shield" ? "shield" : a === "trap" ? "trap" : "swap"]!);
          if (pick === "swap") {
            const cards: string[] = my.swapCards;
            used("swap");
            send(id, { type: "react", action: "swap", card: cards[Math.floor(rng() * cards.length)] as "attack" });
          } else if (pick) {
            used(pick);
            send(id, { type: "react", action: pick as "shield" | "trap" });
          } else send(id, { type: "react", action: "pass" });
        } else if (b.phase === "counter" && my.canCounter) {
          const yes = rng() < style.counter;
          if (yes) used("counter");
          send(id, { type: "react", action: yes ? "counter" : "pass" });
        } else if (b.phase === "reward" && my.canChooseDeck) {
          const deck = rng() < style.legendary ? "legendary" : "normal";
          used(deck);
          send(id, { type: "deck", deck });
        } else if (b.phase === "risk" && my.riskChoice) {
          send(id, { type: "riskChoice", pay: my.riskChoice.canPayTokens ? "tokens" : "life" });
        }
      }
    }
  }
  return { state, turns: state.turn, seconds: (now - start) / 1000, usage };
}
