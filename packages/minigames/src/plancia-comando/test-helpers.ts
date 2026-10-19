import type { InputMeta, MinigameContext } from "@gioco/shared";
import { makeRng } from "../knight-duel/rng.js";
import { type CrewState, type PlanciaState, planciaComando as plugin, planciaConfigSchema } from "./index.js";
import type { Control, Order } from "./panels.js";

/** Funzioni comuni ai test della Plancia di Comando: squadre, input con ora e ritardo, ordini eseguiti, equipaggio simulato. */
export type S = PlanciaState;

export const T0 = 1_000_000;
export const TEAM_IDS = ["ta", "tb", "tc", "td"];

/** Giocatori con i team della serata: `sizes[i]` giocatori nella squadra i (ids `a1, a2…`, `b1…`). */
export function ctxFor(seed: number, sizes: number[] = [3, 3]): MinigameContext {
  const letters = "abcd";
  return {
    seed,
    teams: sizes.map((_, i) => ({ id: TEAM_IDS[i]!, name: `Squadra ${letters[i]!.toUpperCase()}` })),
    players: sizes.flatMap((n, i) => Array.from({ length: n }, (_, k) => ({ id: `${letters[i]}${k + 1}`, nickname: `${letters[i]!.toUpperCase()}${k + 1}`, teamId: TEAM_IDS[i]! }))),
  };
}

export const cfg = (over: Record<string, unknown> = {}) => planciaConfigSchema.parse(over);
export const start = (seed = 1, over: Record<string, unknown> = {}, ctx = ctxFor(seed)): S => plugin.init(cfg(over), ctx, T0);
export const launched = (seed = 1, over: Record<string, unknown> = {}, ctx = ctxFor(seed)): S => plugin.onHostCommand(start(seed, over, ctx), { type: "launch" }, T0 + 1000);

export const meta = (at: number, claimed = at, rtt: number | null = 30): InputMeta => ({ receivedAt: at, claimedTime: claimed, rtt });
export const input = (s: S, id: string, i: Record<string, unknown>, at: number, claimed = at, rtt: number | null = 30): S => plugin.onInput(s, id, plugin.inputSchema.parse(i), meta(at, claimed, rtt));
export const host = (s: S, command: Record<string, unknown>, at: number): S => plugin.onHostCommand(s, plugin.commandSchema.parse(command), at);

export const crewOf = (s: S, playerId: string): CrewState => s.crews.find((c) => c.members.includes(playerId))!;
export const orderOf = (s: S, playerId: string): Order => crewOf(s, playerId).orders[playerId]!;
export const controlOf = (s: S, order: Order): Control => crewOf(s, order.holder).controls.find((c) => c.id === order.controlId)!;

/** L'input con cui il proprietario del comando porta `control` al valore `target`. */
export function inputFor(control: Control, target: number): Record<string, unknown> {
  return control.kind === "button" ? { type: "press", control: control.id } : { type: "set", control: control.id, value: target };
}

/** Il giocatore che ha l'ordine `order` lo fa eseguire dal proprietario del comando, all'ora `at`. */
export function execute(s: S, order: Order, at: number, claimed = at, rtt: number | null = 30): S {
  const control = controlOf(s, order);
  return input(s, control.owner, inputFor(control, order.target), at, claimed, rtt);
}

/**
 * Un equipaggio simulato: a ogni passo di 100 ms ogni ordine attivo viene eseguito con probabilità `skill` dopo un po' di
 * «grida» (`shoutMs`), altrimenti scade. `scan` vede lo stato a ogni passo. Si ferma quando la fase non è più `sector` o dopo `maxMs`.
 */
export function crewPlay(s0: S, from: number, maxMs: number, opts: { skill?: number; shoutMs?: [number, number]; seed?: number; scan?: (s: S, at: number) => void } = {}): { s: S; at: number } {
  const rng = makeRng(opts.seed ?? 1);
  const [lo, hi] = opts.shoutMs ?? [1500, 5000];
  const planned = new Map<number, number>();
  let s = s0;
  let at = from;
  for (; at < from + maxMs && s.phase === "sector"; at += 100) {
    for (const crew of s.crews) {
      for (const order of Object.values(crew.orders)) {
        if (!planned.has(order.id)) planned.set(order.id, rng() < (opts.skill ?? 0.9) ? order.issuedAt + lo + rng() * (hi - lo) : Infinity);
        if (planned.get(order.id)! <= at) {
          planned.delete(order.id);
          s = execute(s, order, at);
        }
      }
    }
    s = plugin.onTick(s, at);
    opts.scan?.(s, at);
  }
  return { s, at };
}
