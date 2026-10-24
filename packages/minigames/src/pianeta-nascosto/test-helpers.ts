import type { InputMeta, MinigameContext } from "@gioco/shared";
import { type PianetaConfig, type PianetaState, pianetaNascosto as plugin, pianetaConfigSchema } from "./index.js";
import { botFinalGuess, botLastCall, botTheories, botTurn } from "./bot.js";
import { neighbors } from "./sky.js";
import type { Action, Observatory } from "./types.js";

/** Funzioni comuni ai test del Pianeta Nascosto: serata a due squadre, input con ora, avanzamento del tempo. */
export type S = PianetaState;

export const T0 = 1_000_000;

/** Due squadre «Blu» (a1, a2) e «Rosse» (b1, b2); `sizes` per cambiarne i membri. */
export function ctxFor(seed = 1, sizes: number[] = [2, 2]): MinigameContext {
  const letters = "abcdef";
  return {
    seed,
    teams: sizes.map((_, i) => ({ id: `t${letters[i]}`, name: `Squadra ${letters[i]!.toUpperCase()}` })),
    players: sizes.flatMap((n, i) => Array.from({ length: n }, (_, k) => ({ id: `${letters[i]}${k + 1}`, nickname: `${letters[i]!.toUpperCase()}${k + 1}`, teamId: `t${letters[i]}`, ...(k === 0 && { captain: true as const }) }))),
  };
}

export const cfg = (over: Record<string, unknown> = {}): PianetaConfig => pianetaConfigSchema.parse(over);
export const start = (over: Record<string, unknown> = {}, seed = 1, ctx = ctxFor(seed)): S => plugin.init(cfg(over), ctx, T0);
export const launched = (over: Record<string, unknown> = {}, seed = 1, ctx = ctxFor(seed)): S => plugin.onHostCommand(start(over, seed, ctx), { type: "start" }, T0 + 1000);

export const meta = (at: number): InputMeta => ({ receivedAt: at, claimedTime: at, rtt: 30 });
export const input = (s: S, id: string, i: Record<string, unknown>, at = T0 + 2000): S => plugin.onInput(s, id, plugin.inputSchema.parse(i), meta(at));
export const host = (s: S, command: Record<string, unknown>, at = T0 + 2000): S => plugin.onHostCommand(s, plugin.commandSchema.parse(command), at);
export const tick = (s: S, at: number): S => plugin.onTick(s, at);

export const obs = (s: S, id: string): Observatory => s.observatories.find((o) => o.id === id)!;
export const actingObs = (s: S): Observatory => obs(s, s.actingIds[0]!);
/** Il primo membro della squadra di turno. */
export const actor = (s: S): string => actingObs(s).members[0]!;

/** La squadra di turno propone, tutti la votano e confermano: l'azione è scelta. */
export function play(s0: S, action: Record<string, unknown>, at = T0 + 3000): S {
  let s = s0;
  const o = actingObs(s);
  s = input(s, o.members[0]!, { type: "propose", action }, at);
  const proposalId = actingObs(s).proposals.at(-1)!.id;
  for (const m of o.members) {
    s = input(s, m, { type: "vote", proposalId }, at);
    s = input(s, m, { type: "ready" }, at);
  }
  return s;
}

/** Fa passare le squadre di turno finché la condizione non è vera (o `max` turni). */
export function passUntil(s0: S, done: (s: S) => boolean, max = 200): S {
  let s = s0;
  let at = T0 + 5000;
  for (let i = 0; i < max && !done(s) && s.phase !== "done"; i++) {
    at += 10_000;
    if (s.phase === "turn") s = host(s, { type: "skip" }, at);
    else if (s.phase === "briefing") s = host(s, { type: "start" }, at);
    else if (["conference", "review", "resolve", "theory", "lastCall", "finalGuess", "reveal", "final"].includes(s.phase)) s = host(s, { type: "next" }, at);
  }
  return s;
}

/** L'azione di localizzazione giusta per questo sistema. */
export function locateAction(s: S): Action {
  const n = s.sky.length;
  const x = s.sky.indexOf("planetX") + 1;
  const [l, r] = neighbors(x, n);
  return { type: "locate", sector: x, left: s.sky[l - 1] as never, right: s.sky[r - 1] as never };
}

/** Fa giocare le squadre umane con le scelte del bot (per partite intere nei test); i robot e il tempo vanno avanti da soli. */
export function autoStep(s0: S, at: number): S {
  let s = s0;
  const humans = (ids: string[]) => ids.map((id) => obs(s, id)).filter((o) => !o.bot);
  switch (s.phase) {
    case "briefing":
      return host(s, { type: "start" }, at);
    case "turn":
      for (const o of humans(s.actingIds)) {
        if (s.phase !== "turn" || obs(s, o.id).chosen) continue;
        const action = botTurn(s, o);
        if (action.type === "pass") {
          s = host(s, { type: "skip" }, at); // passare non è una proposta: lo fa la regia
          continue;
        }
        s = input(s, o.members[0]!, { type: "propose", action }, at);
        const proposal = obs(s, o.id).proposals.at(-1);
        if (!proposal) s = host(s, { type: "skip" }, at);
        else s = input(s, o.captainId!, { type: "decide", proposalId: proposal.id }, at);
      }
      return s;
    case "theory":
    case "lastCall":
    case "finalGuess":
      for (const o of humans(s.actingIds)) {
        const cur = obs(s, o.id);
        if (cur.readyBy.length > 0) continue;
        const lag = s.lastCall?.[o.id] ?? 0;
        const plan = s.phase === "theory" ? { guess: null, theories: botTheories(s, cur) } : s.phase === "lastCall" ? botLastCall(s, cur, lag) : { guess: botFinalGuess(s, cur), theories: [] };
        for (const t of plan.theories) s = input(s, cur.members[0]!, { type: "theory", ...t }, at);
        if (plan.guess) s = input(s, cur.members[0]!, { type: "guess", ...plan.guess }, at);
        for (const m of cur.members) if (s.phase === s0.phase) s = input(s, m, { type: "ready" }, at);
      }
      return s;
    case "conference":
    case "reveal":
    case "final":
      return host(s, { type: "next" }, at);
    default:
      return s;
  }
}

/** Gioca una partita intera con `autoStep` e il passare del tempo; `each` vede lo stato a ogni passo. */
export function autoPlay(s0: S, opts: { maxSteps?: number; stepMs?: number; each?: (s: S, at: number) => void } = {}): { s: S; steps: number } {
  let s = s0;
  let at = T0;
  let steps = 0;
  for (; steps < (opts.maxSteps ?? 3000) && s.phase !== "done"; steps++) {
    at += opts.stepMs ?? 700;
    s = tick(s, at);
    s = autoStep(s, at);
    opts.each?.(s, at);
  }
  return { s, steps };
}

export { plugin };
