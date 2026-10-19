import { describe, expect, it } from "vitest";
import type { AnyMinigame, MinigameContext } from "@gioco/shared";
import { artificieri } from "../../../packages/minigames/src/artificieri/index.js";
import { pilotaCieco } from "../../../packages/minigames/src/pilota-cieco/index.js";
import { clock, decide, makeRnd, oracle, privacyProblem } from "./strategy.js";

/**
 * I bot di Artificieri e di Pilota alla cieca giocano, senza rete, una partita vera: il tempo è simulato (50 ms a passo)
 * e le loro decisioni (con il tempo di riflessione e la chiave che evita i doppioni, come nel bot vero) arrivano al plugin
 * come input. Se i bot si bloccano o il plugin rifiuta ciò che mandano, la partita non finisce.
 */

interface Sim {
  s: any;
  now: number;
  leaks: string[];
  inputs: number;
}

function simulate(plugin: AnyMinigame, s0: any, start: number, maxMs: number, until: (s: any) => boolean, hostTick?: (s: any, now: number) => any, seed = 1): Sim {
  const rnd = makeRnd(seed);
  let s = s0;
  let now = start;
  const lastKey = new Map<string, string>();
  const due: { at: number; id: string; input: unknown; claimed: number }[] = [];
  const leaks: string[] = [];
  let inputs = 0;
  clock.now = () => now;
  try {
    for (; now < start + maxMs && !until(s); now += 50) {
      oracle.artificieri = plugin.id === "artificieri" ? plugin.hostView(s).info : null;
      oracle.pilota = plugin.id === "pilota-cieco" ? plugin.hostView(s).info : null;
      s = plugin.onTick(s, now);
      if (hostTick) s = hostTick(s, now);
      for (const id of s.players as string[]) {
        const view = plugin.viewFor(s, id, null);
        const leak = privacyProblem(plugin.id, view);
        if (leak) leaks.push(leak);
        const d = decide(plugin.id, view, rnd);
        if (!d || d.key === lastKey.get(id)) continue;
        lastKey.set(id, d.key);
        const [lo, hi] = d.thinkMs ?? [200, 1500];
        const at = now + lo + rnd() * (hi - lo);
        for (const input of d.inputs) due.push({ at, id, input, claimed: at });
      }
      for (const job of due.filter((j) => j.at <= now)) {
        due.splice(due.indexOf(job), 1);
        inputs++;
        s = plugin.onInput(s, job.id, plugin.inputSchema.parse(job.input), { receivedAt: now, claimedTime: job.claimed, rtt: 40 });
      }
    }
  } finally {
    clock.now = () => Date.now();
  }
  return { s, now, leaks, inputs };
}

const people = (sizes: number[]): MinigameContext => ({
  seed: 7,
  teams: sizes.map((_, i) => ({ id: `t${i}`, name: `Squadra ${i}` })),
  players: sizes.flatMap((n, i) => Array.from({ length: n }, (_, k) => ({ id: `p${i}${k}`, nickname: `P${i}${k}`, teamId: `t${i}` }))),
});

describe("bot di Pilota alla cieca", () => {
  it("due squadre di piloti simulati arrivano in fondo aspettando porte e blocchi, e nessuna vista rivela strati che non doveva", () => {
    const cfg = pilotaCieco.configSchema.parse({ levels: 1, size: "piccolo", patrols: true, doors: 3, mineDensity: 8, levelSeconds: 300, stepMs: 300, penaltyMs: 1500 });
    let s: any = pilotaCieco.init(cfg, people([4, 4]), 0);
    s = pilotaCieco.onHostCommand(s, { type: "go" }, 100);
    const out = simulate(pilotaCieco, s, 100, 300_000, (x) => x.phase !== "run", undefined, 3);
    expect(out.s.phase).toBe("level-end");
    expect(out.leaks).toEqual([]);
    expect(out.s.results.filter((r: { finished: boolean }) => r.finished).length, "squadre arrivate").toBe(2);
    expect(out.inputs).toBeGreaterThan(40);
    // i piloti hanno sbagliato ogni tanto (mine, porte) ma ce l'hanno fatta
    expect(out.s.results.every((r: { points: number | null }) => r.points !== null)).toBe(true);
  });

  it("il pilota aspetta la fine del blocco e la porta chiusa: il tempo di riflessione lo comprende", () => {
    const cfg = pilotaCieco.configSchema.parse({ levels: 1, size: "piccolo", levelSeconds: 300, stepMs: 300 });
    let s: any = pilotaCieco.init(cfg, people([3, 3]), 0);
    s = pilotaCieco.onHostCommand(s, { type: "go" }, 100);
    const lane = s.lanes[0];
    const pilot = lane.pilotId as string;
    clock.now = () => 5_000;
    oracle.pilota = pilotaCieco.hostView({ ...s, lanes: s.lanes.map((l: any, i: number) => (i === 0 ? { ...l, run: { ...l.run, frozenUntil: 9_000 } } : l)) }).info;
    const frozen = pilotaCieco.viewFor(s, pilot, null);
    const d = decide("pilota-cieco", frozen, makeRnd(1))!;
    expect(d.inputs).toHaveLength(1);
    expect(d.thinkMs![0], "dopo il blocco di 4 s").toBeGreaterThanOrEqual(4_000);
    // senza blocco, almeno la pausa tra due passi
    oracle.pilota = pilotaCieco.hostView(s).info;
    clock.now = () => 5_000;
    expect(decide("pilota-cieco", frozen, makeRnd(1))!.thinkMs![0]).toBeGreaterThanOrEqual(300);
    clock.now = () => Date.now();
    // i navigatori e chi non corre non fanno nulla
    const nav = (s.lanes[0].layers as Record<string, unknown>) && Object.keys(s.lanes[0].layers)[0]!;
    expect(decide("pilota-cieco", pilotaCieco.viewFor(s, nav, null), makeRnd(1))).toBeNull();
  });

  it("il controllo di privacy segnala strati a chi non li deve avere e strati scoperti in gara", () => {
    const cfg = pilotaCieco.configSchema.parse({ levels: 1, size: "piccolo" });
    let s: any = pilotaCieco.init(cfg, people([3, 3]), 0);
    s = pilotaCieco.onHostCommand(s, { type: "go" }, 100);
    const pilot = s.lanes[0].pilotId as string;
    const nav = Object.keys(s.lanes[0].layers)[0]!;
    expect(privacyProblem("pilota-cieco", pilotaCieco.viewFor(s, pilot, null))).toBeNull();
    expect(privacyProblem("pilota-cieco", pilotaCieco.viewFor(s, nav, null))).toBeNull();
    const view = pilotaCieco.viewFor(s, pilot, null) as { me: Record<string, unknown> };
    expect(privacyProblem("pilota-cieco", { ...view, me: { ...view.me, layerData: { mines: [1] } } })).toContain("strati a un pilot");
    expect(privacyProblem("pilota-cieco", { ...view, secrets: [] })).toContain("segreti");
    expect(privacyProblem("pilota-cieco", { ...view, lanes: [{ reveal: {} }] })).toContain("strati scoperti in run");
    const navView = pilotaCieco.viewFor(s, nav, null) as { me: { layers: string[]; layerData: Record<string, unknown> } };
    expect(privacyProblem("pilota-cieco", { ...navView, me: { ...navView.me, layerData: { ...navView.me.layerData, patrols: [] , mines: [], doors: [], keys: [] } } })).toContain("strati diversi");
  });
});

describe("bot di Artificieri", () => {
  it("l'artificiere simulato legge il piano dalla regia, sbaglia ogni tanto, e la bomba si disinnesca; gli altri scommettono", () => {
    const cfg = artificieri.configSchema.parse({ difficulty: "facile", modules: 4, seconds: 400, betSeconds: 5, enabledModules: { wires: true, button: false, symbols: true, colors: true, maze: true, word: false } });
    const s0: any = artificieri.init(cfg, people([3, 3]), 0);
    expect(s0.phase).toBe("bet");
    const out = simulate(artificieri, s0, 0, 200_000, (x) => x.phase === "outcome" || x.phase === "final", undefined, 5);
    expect(out.leaks).toEqual([]);
    expect(out.s.phase).toBe("outcome");
    expect(out.s.history[0].solved, "moduli disinnescati").toBeGreaterThanOrEqual(3);
    // le scommesse sono state fatte da tutti gli altri
    expect(Object.keys(out.s.history[0].bets)).toHaveLength(3);
  });

  it("il controllo di privacy segnala bordo, dati, regole, soluzioni e manuale a chi non li deve avere", () => {
    const cfg = artificieri.configSchema.parse({ betSeconds: 0 });
    let s: any = artificieri.init(cfg, people([3, 3]), 0);
    s = artificieri.onHostCommand(s, { type: "start" }, 10);
    const defuser = s.bomb.defuserId as string;
    const expert = Object.keys(s.bomb.pages)[0]!;
    const bettor = s.players.find((p: string) => p.startsWith("p1"))!;
    expect(privacyProblem("artificieri", artificieri.viewFor(s, defuser, null))).toBeNull();
    expect(privacyProblem("artificieri", artificieri.viewFor(s, expert, null))).toBeNull();
    expect(privacyProblem("artificieri", artificieri.viewFor(s, bettor, null))).toBeNull();
    const dv = artificieri.viewFor(s, defuser, null) as { me: Record<string, unknown> };
    expect(privacyProblem("artificieri", { ...dv, me: { ...dv.me, edgework: {} } })).toContain("edgework");
    expect(privacyProblem("artificieri", { ...dv, me: { ...dv.me, manual: [] } })).toContain("manuale a un defuser");
    const bv = artificieri.viewFor(s, bettor, null) as { me: Record<string, unknown> };
    expect(privacyProblem("artificieri", { ...bv, me: { ...bv.me, controls: [] } })).toContain("comandi a un bettor");
  });
});
