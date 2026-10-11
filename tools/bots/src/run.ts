// Stress test e simulatore di serata: N giocatori simulati giocano partite complete.
//
//   pnpm stress                         → avvia un server di prova isolato e gioca con 30 bot (partita classica + duello)
//   pnpm stress --players 20 --scenario duel
//   pnpm stress --latency 80,400 --think 200,2500      → rete più lenta, giocatori più lenti
//   pnpm stress --url http://localhost:3000 --password ...   → contro un server già avviato (CREA dati reali: usa un server di prova!)
import { pathToFileURL } from "node:url";
import type { GameAdminState } from "@gioco/shared";
import { AdminApi } from "./api.js";
import { Bot } from "./bot.js";
import { AutoHost, type MatchRun, fanout } from "./host.js";
import { classicMatch, duelMatch, setupEvent } from "./scenario.js";
import { type TestServer, startTestServer } from "./server-process.js";

export interface StressOptions {
  /** Se assente si avvia un server di prova isolato. */
  url?: string;
  password?: string;
  players: number;
  scenario: "classic" | "duel" | "all";
  latencyMs: [number, number];
  thinkMs: [number, number];
  seed: number;
  log?: (line: string) => void;
}

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface StressReport {
  players: number;
  joined: number;
  matches: { name: string; run: MatchRun }[];
  inputs: number;
  states: number;
  errors: string[];
  disconnects: number;
  fanoutMs: { samples: number; p50: number; p95: number; max: number };
  totalMs: number;
  checks: Check[];
  ok: boolean;
}

const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]! : 0);

export async function runStress(opts: StressOptions): Promise<StressReport> {
  const log = opts.log ?? (() => undefined);
  const t0 = Date.now();
  fanout.length = 0;
  let server: TestServer | null = null;
  const url = opts.url ?? (server = await startTestServer()).url;
  const password = opts.password ?? "password-di-prova";
  const api = new AdminApi(url);
  const bots: Bot[] = [];
  let host: AutoHost | null = null;
  const report: StressReport = { players: opts.players, joined: 0, matches: [], inputs: 0, states: 0, errors: [], disconnects: 0, fanoutMs: { samples: 0, p50: 0, p95: 0, max: 0 }, totalMs: 0, checks: [], ok: false };
  const check = (name: string, ok: boolean, detail?: string) => report.checks.push({ name, ok, detail });

  try {
    await api.login(password, !opts.url); // sul server di prova la password si imposta da sé
    log(`Server: ${url}`);

    // ---- Giocatori ----
    for (let i = 0; i < opts.players; i++) {
      const bot = new Bot({
        url,
        nickname: `Bot${String(i + 1).padStart(2, "0")}`,
        latencyMs: opts.latencyMs,
        thinkMs: opts.thinkMs,
        skewMs: (((opts.seed * 7919 + i * 104729) % 2001) - 1000) | 0, // orologi sfasati fino a ±1 s
        seed: opts.seed * 1000 + i,
      });
      await bot.join();
      bots.push(bot);
      report.joined++;
      await new Promise((r) => setTimeout(r, 25)); // ingressi scaglionati, come una sala che si riempie
    }
    log(`${report.joined} giocatori connessi`);

    // ---- Serata e partite ----
    const setup = await setupEvent(api, bots.map((b) => b.playerId));
    host = new AutoHost(url, api.token, bots);
    await host.connect();

    const jobs: { name: string; matchId: string }[] = [];
    if (opts.scenario !== "duel") jobs.push({ name: "Partita classica (5 minigiochi)", matchId: (await classicMatch(api, setup.eventId)).matchId });
    if (opts.scenario !== "classic") jobs.push({ name: "Duello dei Cavalieri", matchId: (await duelMatch(api, setup)).matchId });

    for (const job of jobs) {
      log(`Parte: ${job.name}`);
      const run = await host.runMatch(job.matchId);
      report.matches.push({ name: job.name, run });
      log(`  ${run.reachedEnd ? "conclusa" : "NON conclusa"} in ${(run.durationMs / 1000).toFixed(1)}s, ${run.commands.length} comandi`);
      if (run.finalState) checkMatch(job.name, run.finalState, bots.length, check);
    }

    // ---- Controlli finali ----
    report.inputs = bots.reduce((n, b) => n + b.stats.inputs, 0);
    report.states = bots.reduce((n, b) => n + b.stats.states, 0);
    report.errors = bots.flatMap((b) => b.stats.errors);
    report.disconnects = bots.reduce((n, b) => n + b.stats.disconnects, 0);
    check("tutti i giocatori sono entrati", report.joined === opts.players, `${report.joined}/${opts.players}`);
    check("nessun errore di connessione", report.errors.length === 0, report.errors.slice(0, 3).join("; "));
    check("nessuna disconnessione imprevista", report.disconnects === 0, String(report.disconnects));
    check("tutte le partite concluse", report.matches.every((m) => m.run.reachedEnd));
    check("nessun comando della regia rifiutato", report.matches.every((m) => !m.run.warnings.some((w) => w.includes("rifiutato"))), report.matches.flatMap((m) => m.run.warnings).slice(0, 3).join("; "));
    // Se la regia automatica ha dovuto forzare qualcosa, i giocatori simulati erano rimasti bloccati.
    const emergencies = report.matches.flatMap((m) => m.run.warnings.filter((w) => w.includes("emergenza")));
    check("la regia non ha dovuto forzare nulla", emergencies.length === 0, emergencies.slice(0, 2).join("; "));
    check("tutti i telefoni hanno ricevuto aggiornamenti", bots.every((b) => b.stats.states > 0));
    check("i giocatori hanno inviato risposte", report.inputs > opts.players);

    // Coerenza: i punti che ogni telefono mostra coincidono con la classifica della regia
    const final = report.matches.at(-1)?.run.finalState;
    if (final?.leaderboards) {
      const byName = new Map(final.leaderboards.players.map((p) => [p.name, p.points]));
      const mismatched = bots.filter((b) => b.state?.me && byName.get(b.nickname) !== undefined && byName.get(b.nickname) !== b.state.me.points);
      check("i punti sui telefoni coincidono con la classifica", mismatched.length === 0, mismatched.map((b) => b.nickname).slice(0, 3).join(", "));
    }

    report.fanoutMs = { samples: fanout.length, p50: pct(fanout, 0.5), p95: pct(fanout, 0.95), max: Math.max(0, ...fanout) };
    check("aggiornamenti ai telefoni rapidi (p95 sotto 1,5 s)", fanout.length === 0 || report.fanoutMs.p95 < 1_500, `p95 ${report.fanoutMs.p95} ms su ${fanout.length} campioni`);
    if (server) check("il server non ha scritto errori", !/error|exception|unhandled/i.test(server.log()), server.log().split("\n").filter((l) => /error|exception/i.test(l)).slice(0, 2).join(" | "));
  } catch (err) {
    check("esecuzione completata", false, err instanceof Error ? err.message : String(err));
  } finally {
    bots.forEach((b) => b.close());
    host?.close();
    server?.stop();
  }
  report.totalMs = Date.now() - t0;
  report.ok = report.checks.every((c) => c.ok);
  return report;
}

/** Controlli sulla classifica finale di una partita. */
function checkMatch(name: string, s: GameAdminState, bots: number, check: (n: string, ok: boolean, d?: string) => void): void {
  const lb = s.leaderboards;
  if (!lb) return check(`${name}: classifica presente`, false);
  const players = lb.players.reduce((n, p) => n + p.points, 0);
  const teams = lb.teams.reduce((n, t) => n + t.points, 0);
  check(`${name}: tutti i giocatori in classifica`, lb.players.length === bots, `${lb.players.length}/${bots}`);
  check(`${name}: punti dei giocatori = punti delle squadre`, players === teams, `${players} contro ${teams}`);
  check(`${name}: qualcuno ha fatto punti`, players !== 0);
}

function printReport(r: StressReport): void {
  const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  console.log(`\n=== Report: ${r.joined}/${r.players} giocatori, durata ${s(r.totalMs)} ===`);
  for (const m of r.matches) console.log(`  ${m.run.reachedEnd ? "✓" : "✗"} ${m.name}: ${s(m.run.durationMs)} · ${m.run.commands.length} comandi regia${m.run.warnings.length ? ` · avvisi: ${m.run.warnings.join("; ")}` : ""}`);
  console.log(`  Messaggi: ${r.inputs} input inviati, ${r.states} aggiornamenti ricevuti dai telefoni`);
  console.log(`  Aggiornamento a tutti i telefoni dopo un comando: mediana ${r.fanoutMs.p50} ms · p95 ${r.fanoutMs.p95} ms · max ${r.fanoutMs.max} ms (${r.fanoutMs.samples} misure)`);
  console.log("\nControlli:");
  for (const c of r.checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail && !c.ok ? `  → ${c.detail}` : ""}`);
  console.log(r.ok ? "\nTutto in ordine.\n" : "\nCI SONO PROBLEMI (vedi i controlli con ✗).\n");
}

// ---- Riga di comando ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const range = (name: string, fallback: [number, number]): [number, number] => {
    const v = arg(name)?.split(",").map(Number);
    return v && v.length === 2 && v.every(Number.isFinite) ? [v[0]!, v[1]!] : fallback;
  };
  const scenario = (arg("scenario") ?? "all") as StressOptions["scenario"];
  if (!["classic", "duel", "all"].includes(scenario)) {
    console.error("--scenario deve essere classic, duel o all");
    process.exit(2);
  }
  const url = arg("url");
  if (url) console.warn("Attenzione: si gioca su un server esistente e si CREANO profili, squadre e partite reali. Meglio un server di prova.");
  const report = await runStress({
    url,
    password: arg("password") ?? process.env.GIOCO_ADMIN_PASSWORD,
    players: Number(arg("players") ?? 30),
    scenario,
    latencyMs: range("latency", [50, 250]),
    thinkMs: range("think", [200, 1500]),
    seed: Number(arg("seed") ?? 1),
    log: (l) => console.log(l),
  });
  printReport(report);
  process.exit(report.ok ? 0 : 1);
}
