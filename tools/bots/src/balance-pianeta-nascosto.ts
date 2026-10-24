/**
 * Simulazione di bilanciamento de «Il Pianeta Nascosto». Si lancia con `pnpm balance:pianeta`.
 *
 * Fa giocare il VERO codice del plugin (nessun server) a tre osservatori robot, a passi di un secondo. Misura:
 *  - la durata in giorni (e i minuti stimati con turni da ~40 s e fasi teoria da ~45 s) per Base ed Esperto;
 *  - chi vince in base all'ordine di partenza nella pila (a parità di abilità deve stare vicino a un terzo);
 *  - chi vince in base al livello delle informazioni iniziali (Ragazzi / Esperto / Genio): più fatti devono aiutare,
 *    ma senza che i livelli alti smettano di avere speranze;
 *  - quante localizzazioni sbagliate e teorie sbagliate fanno i robot (devono essere zero: sono certi).
 *
 * I robot ragionano meglio di un gruppo di persone e non discutono: i numeri dicono se le REGOLE sono equilibrate, non quanto
 * dura una serata vera (lì conta la discussione). Si rilancia dopo ogni modifica a costi, gettoni, punti o informazioni iniziali.
 */
import { performance } from "node:perf_hooks";
import { pianetaConfigSchema, pianetaNascosto as plugin } from "../../../packages/minigames/src/pianeta-nascosto/index.js";
import type { PianetaState } from "../../../packages/minigames/src/pianeta-nascosto/index.js";

const TURN_SECONDS = 40;
const THEORY_SECONDS = 45;
const T0 = 1_000_000;

interface Game {
  state: PianetaState;
  days: number;
  turns: number;
  theoryPhases: number;
  maxTickMs: number;
  /** Gli osservatori nell'ordine in cui partono (chi è in fondo alla pila agisce per primo). */
  startOrder: string[];
}

function play(mode: "standard" | "expert", seed: number, levels?: ("youth" | "beginner" | "experienced" | "genius")[]): Game {
  const cfg = pianetaConfigSchema.parse({ mode, bots: 3, botLevel: "normal", turnSeconds: 0, theorySeconds: 0, turnMode: "sequential" });
  let s = plugin.init(cfg, { players: [], teams: [], seed }, T0);
  const startOrder = [...s.observatories].sort((a, b) => a.stack - b.stack).map((o) => o.id);
  if (levels) levels.forEach((difficulty, i) => (s = plugin.onHostCommand(s, { type: "set-difficulty", teamId: `bot-${i + 1}`, difficulty }, T0)));
  s = plugin.onHostCommand(s, { type: "start" }, T0);
  let now = T0;
  let turns = 0;
  let theoryPhases = 0;
  let maxTickMs = 0;
  let last = "";
  for (let i = 0; i < 30_000 && s.phase !== "done"; i++) {
    now += 1000;
    const t = performance.now();
    s = plugin.onTick(s, now);
    maxTickMs = Math.max(maxTickMs, performance.now() - t);
    const key = `${s.phase}${s.actingIds.join()}${s.observatories.reduce((n, o) => n + o.time, 0)}`;
    if (key !== last) {
      if (s.phase === "turn") turns++;
      if (s.phase === "theory") theoryPhases++;
      last = key;
    }
    if (["conference", "reveal", "final"].includes(s.phase)) s = plugin.onHostCommand(s, { type: "next" }, now);
  }
  return { state: s, days: Math.max(...s.observatories.map((o) => o.time)), turns, theoryPhases, maxTickMs, startOrder };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;

function winnerOf(s: PianetaState): string {
  const finder = s.finderIds[0];
  return finder ?? s.observatories[0]!.id;
}

function duration(): void {
  console.log("\nDurata (3 robot, turni da ~%d s e fasi teoria da ~%d s a tavolino)", TURN_SECONDS, THEORY_SECONDS);
  for (const [mode, games] of [["standard", 40], ["expert", 12]] as const) {
    const t0 = performance.now();
    const results = Array.from({ length: games }, (_, i) => play(mode, 100 + i));
    const days = results.map((g) => g.days);
    const minutes = results.map((g) => (g.turns * TURN_SECONDS + g.theoryPhases * THEORY_SECONDS) / 60);
    const wrong = results.reduce((n, g) => n + g.state.publicLog.filter((l) => l.text.includes("sbagliata") || l.ok === false).length, 0);
    console.log(
      `  ${mode === "standard" ? "Base   " : "Esperto"}: ${mean(days).toFixed(1)} giorni in media (mediana ${pct(days, 0.5)}, p90 ${pct(days, 0.9)}), ~${mean(minutes).toFixed(0)} min (p90 ${pct(minutes, 0.9).toFixed(0)}) | ${mean(results.map((g) => g.turns)).toFixed(0)} turni, ${mean(results.map((g) => g.theoryPhases)).toFixed(1)} fasi teoria | errori dei robot: ${wrong} | onTick max ${Math.round(Math.max(...results.map((g) => g.maxTickMs)))} ms | ${((performance.now() - t0) / 1000).toFixed(0)} s di calcolo`,
    );
  }
}

function startingOrder(): void {
  console.log("\nChi localizza per primo, per posto nella pila di partenza (un terzo = nessun vantaggio)");
  const games = 90;
  const wins = [0, 0, 0];
  for (let i = 0; i < games; i++) {
    const g = play("standard", 5_000 + i);
    wins[Math.max(0, g.startOrder.indexOf(winnerOf(g.state)))]!++;
  }
  console.log(`  1° a muoversi ${((wins[0]! / games) * 100).toFixed(0)}% · 2° ${((wins[1]! / games) * 100).toFixed(0)}% · 3° ${((wins[2]! / games) * 100).toFixed(0)}%  (${games} partite in Base)`);
}

function byLevel(): void {
  console.log("\nQuota di localizzazioni per livello delle informazioni iniziali (Base, un robot per livello)");
  const games = 90;
  const levels = ["youth", "experienced", "genius"] as const;
  const wins = [0, 0, 0];
  for (let i = 0; i < games; i++) {
    const g = play("standard", 9_000 + i, [...levels]);
    const finder = winnerOf(g.state);
    const idx = Number(finder.replace("bot-", "")) - 1;
    if (idx >= 0) wins[idx]!++;
  }
  console.log(`  ${levels.map((l, i) => `${l} ${((wins[i]! / games) * 100).toFixed(0)}%`).join(" · ")}  (${games} partite)`);
}

duration();
startingOrder();
byLevel();
