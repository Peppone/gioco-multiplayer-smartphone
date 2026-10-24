// Stress test e simulatore di serata: N giocatori simulati giocano partite complete.
//
//   pnpm stress                         → avvia un server di prova isolato e gioca con 30 bot (partita classica + duello)
//   pnpm stress --players 20 --scenario duel
//   pnpm stress --players 10 --scenario stanze         → Stanze Segrete con un Game Master simulato (massimo 10 giocatori)
//   pnpm stress --players 12 --scenario parole         → Parole Mannare: Sindaco simulato a raffica di gettoni (massimo 12 giocatori)
//   pnpm stress --players 30 --scenario botto          → Stanze col botto: partita intera in due stanze (da 6 a 30 giocatori)
//   pnpm stress --players 30 --scenario shadow         → Shadow Tournament: torneo intero con tempi brevi
//   pnpm stress --players 30 --scenario agenti         → Agenti Segreti: Capi-spia e agenti simulati (da 4 a 30 giocatori)
//   pnpm stress --players 30 --scenario onda           → Lunghezza d'Onda: una partita tutti contro tutti e una a squadre (da 3 a 30 giocatori)
//   pnpm stress --players 30 --scenario pilota         → Pilota alla cieca: 4 squadre in contemporanea, piloti simulati a raffica di passi (da 2 a 30 giocatori)
//   pnpm stress --players 30 --scenario artificieri    → Artificieri: squadre da 5, artificieri simulati che leggono le soluzioni dalla regia (da 2 a 30 giocatori)
//   pnpm stress --players 30 --scenario plancia        → Plancia di Comando: equipaggi da 8 che si gridano gli ordini a vicenda (da 2 a 30 giocatori)
//   pnpm stress --players 30 --scenario pianeta        → Il Pianeta Nascosto: osservatori da 5–6 che votano le azioni, con un robot (da 1 a 30 giocatori)
//   pnpm stress --latency 80,400 --think 200,2500      → rete più lenta, giocatori più lenti
//   pnpm stress --url http://localhost:3000 --password ...   → contro un server già avviato (CREA dati reali: usa un server di prova!)
import { pathToFileURL } from "node:url";
import type { GameAdminState } from "@gioco/shared";
import { scoreFreeForAll, scoreTeams } from "../../../packages/minigames/src/lunghezza-onda/scoring.js";
import { AdminApi } from "./api.js";
import { Bot } from "./bot.js";
import { AutoHost, type MatchRun, fanout } from "./host.js";
import { agentiMatch, artificieriMatch, bottoMatch, classicMatch, duelMatch, ondaMatch, paroleMatch, pilotaMatch, pianetaMatch, planciaMatch, setupEvent, shadowMatch, stanzeMatch } from "./scenario.js";
import { type StanzeRun, playStanze } from "./stanze.js";
import { oracle } from "./strategy.js";
import { type TestServer, startTestServer } from "./server-process.js";

export interface StressOptions {
  /** Se assente si avvia un server di prova isolato. */
  url?: string;
  password?: string;
  players: number;
  scenario: "classic" | "duel" | "stanze" | "shadow" | "parole" | "botto" | "agenti" | "onda" | "artificieri" | "pilota" | "plancia" | "pianeta" | "all";
  /** Durata della sessione di Stanze Segrete con il GM simulato, in secondi (default 20). */
  stanzeSeconds?: number;
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
    if (opts.scenario === "classic" || opts.scenario === "all") jobs.push({ name: "Partita classica (5 minigiochi)", matchId: (await classicMatch(api, setup.eventId)).matchId });
    if (opts.scenario === "duel" || opts.scenario === "all") jobs.push({ name: "Duello dei Cavalieri", matchId: (await duelMatch(api, setup)).matchId });

    if (opts.scenario === "shadow") jobs.push({ name: "Shadow Tournament", matchId: (await shadowMatch(api, setup.eventId)).matchId });
    if (opts.scenario === "parole") jobs.push({ name: "Parole Mannare", matchId: (await paroleMatch(api, setup.eventId)).matchId });
    if (opts.scenario === "botto") jobs.push({ name: "Stanze col botto", matchId: (await bottoMatch(api, setup.eventId)).matchId });
    if (opts.scenario === "agenti") jobs.push({ name: "Agenti Segreti", matchId: (await agentiMatch(api, setup.eventId)).matchId });
    let pilotaPlan = { teams: 0, levels: 0 };
    if (opts.scenario === "pilota") {
      const m = await pilotaMatch(api, setup, bots.map((b) => b.playerId));
      pilotaPlan = { teams: m.teams, levels: m.levels };
      jobs.push({ name: "Pilota alla cieca", matchId: m.matchId });
    }
    let planciaPlan = { crews: 0, sectors: 0 };
    if (opts.scenario === "plancia") {
      const m = await planciaMatch(api, setup, bots.map((b) => b.playerId));
      planciaPlan = { crews: m.crews, sectors: m.sectors };
      jobs.push({ name: "Plancia di Comando", matchId: m.matchId });
    }
    let pianetaTeams = 0;
    if (opts.scenario === "pianeta") {
      const m = await pianetaMatch(api, setup, bots.map((b) => b.playerId));
      pianetaTeams = m.teams;
      jobs.push({ name: "Il Pianeta Nascosto", matchId: m.matchId });
    }
    let artificieriTeams = 0;
    if (opts.scenario === "artificieri") {
      const m = await artificieriMatch(api, setup, bots.map((b) => b.playerId));
      artificieriTeams = m.teams;
      jobs.push({ name: "Artificieri", matchId: m.matchId });
    }
    if (opts.scenario === "onda") {
      jobs.push({ name: "Lunghezza d'Onda (tutti contro tutti)", matchId: (await ondaMatch(api, setup.eventId, "tutti")).matchId });
      jobs.push({ name: "Lunghezza d'Onda (a squadre)", matchId: (await ondaMatch(api, setup.eventId, "squadre")).matchId });
    }
    if (opts.scenario === "stanze") jobs.push({ name: "Stanze Segrete (con Game Master)", matchId: (await stanzeMatch(api, setup.eventId)).matchId });

    for (const job of jobs) {
      log(`Parte: ${job.name}`);
      const run = opts.scenario === "stanze" ? await playStanze(host, api, url, job.matchId, opts.stanzeSeconds ?? 20) : await host.runMatch(job.matchId, opts.scenario === "shadow" ? (Number(process.env.SHADOW_TIMEOUT) || 600_000) : undefined);
      report.matches.push({ name: job.name, run });
      log(`  ${run.reachedEnd ? "conclusa" : "NON conclusa"} in ${(run.durationMs / 1000).toFixed(1)}s, ${run.commands.length} comandi`);
      if (run.finalState) checkMatch(job.name, run.finalState, bots.length, check);
      if (opts.scenario === "parole" && run.reachedEnd) checkParole(bots, check);
      if (opts.scenario === "botto" && run.reachedEnd) checkBotto(bots, check);
      if (opts.scenario === "agenti" && run.reachedEnd) checkAgenti(bots, check);
      if (opts.scenario === "onda" && run.reachedEnd) checkOnda(job.name, bots, check);
      if (opts.scenario === "pilota" && run.reachedEnd) checkPilota(bots, pilotaPlan, run.finalState, check, log);
      if (opts.scenario === "plancia" && run.reachedEnd) checkPlancia(bots, planciaPlan, run.finalState, check, log);
      if (opts.scenario === "pianeta" && run.reachedEnd) checkPianeta(bots, pianetaTeams, run.finalState, check, log);
      if (opts.scenario === "artificieri" && run.reachedEnd) checkArtificieri(bots, artificieriTeams, run.finalState, check);
      if (opts.scenario === "stanze" && run.reachedEnd) await checkStanze(api, setup.eventId, run as StanzeRun, check);
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

/** Scritture nel database della sessione con il GM: tutti i messaggi e gli eventi, e le accettazioni dei bot. */
async function checkStanze(api: AdminApi, eventId: string, run: StanzeRun, check: (n: string, ok: boolean, d?: string) => void): Promise<void> {
  const rows = await api.get<{ kind: string; fromKind: string; recipients: { acceptedAt: number | null }[] }[]>(`/events/${eventId}/messages`);
  const events = rows.filter((r) => r.kind === "event");
  const fromPlayers = rows.filter((r) => r.kind === "message" && r.fromKind === "player");
  check("Stanze: spostamenti approvati dal GM", run.moves > 0, String(run.moves));
  check("Stanze: tutti i messaggi del GM sono nel database", rows.filter((r) => r.kind === "message" && r.fromKind === "master").length === run.messagesSent, `${rows.length} righe, ${run.messagesSent} inviati`);
  check("Stanze: i giocatori hanno scritto al GM", fromPlayers.length > 0, String(fromPlayers.length));
  check("Stanze: tutti gli eventi sono nel database", events.length === run.eventsSent, `${events.length}/${run.eventsSent}`);
  // L'ultimo evento può arrivare a fine sessione: si controllano i primi.
  const settled = events.slice(0, Math.max(0, events.length - 1));
  check("Stanze: i bot hanno accettato gli eventi", settled.length > 0 && settled.every((e) => e.recipients.length > 0 && e.recipients.every((x) => x.acceptedAt !== null)), `${settled.filter((e) => e.recipients.some((x) => x.acceptedAt === null)).length} eventi con accettazioni mancanti`);
}

/** Parole Mannare: tutti i telefoni hanno l'identica vista pubblica e i conteggi tornano con le riserve e con i ruoli. */
function checkParole(bots: Bot[], check: (n: string, ok: boolean, d?: string) => void): void {
  type V = { phase: string; players: { id: string; summary: { yes: number; no: number; maybe: number; close: number; far: number } }[]; reserves: { yesNo: number; maybe: number | null; close: number; far: number }; rules: { yesNoPool: number; maybePool: number | null; closeTokens: number; farTokens: number; werewolves: number }; roles?: { id: string; role: string }[]; outcome?: { winner: string } | null; word: string | null };
  const views = bots.map((b) => b.lastViews.get("parole-mannare") as V | undefined);
  check("Parole: tutti i telefoni hanno ricevuto la vista del round", views.every((v) => v !== undefined));
  const known = views.filter((v): v is V => v !== undefined);
  if (known.length === 0) return;
  const v = known[0]!;
  const same = (pick: (x: V) => unknown) => known.every((x) => JSON.stringify(pick(x)) === JSON.stringify(pick(v)));
  check("Parole: i telefoni sono arrivati alla rivelazione", known.every((x) => x.phase === "reveal" || x.phase === "done"), known.map((x) => x.phase).join(","));
  check("Parole: stessi gettoni su tutti i telefoni", same((x) => x.players.map((p) => p.summary)));
  check("Parole: stesse riserve su tutti i telefoni", same((x) => x.reserves));
  const sum = (key: "yes" | "no" | "maybe" | "close" | "far") => v.players.reduce((n, p) => n + p.summary[key], 0);
  check("Parole: Sì/No dati = riserva comune − rimasti", sum("yes") + sum("no") === v.rules.yesNoPool - v.reserves.yesNo, `${sum("yes") + sum("no")} contro ${v.rules.yesNoPool - v.reserves.yesNo}`);
  check("Parole: Forse dati coerenti con la riserva", v.rules.maybePool === null || sum("maybe") === v.rules.maybePool - (v.reserves.maybe ?? 0));
  check("Parole: «Ci sei quasi» e «Lontanissimo» mai oltre la dotazione", sum("close") <= v.rules.closeTokens && sum("far") <= v.rules.farTokens);
  check("Parole: stesso esito e stessi ruoli su tutti i telefoni", same((x) => [x.outcome, x.roles]) && v.outcome !== null && v.outcome !== undefined, known.map((x) => JSON.stringify([x.outcome, (x.roles ?? []).length])).filter((t, i, a) => a.indexOf(t) === i).join(" | "));
  const wolves = (v.roles ?? []).filter((r) => r.role === "werewolf").length;
  check("Parole: numero di Lupi come da regola", wolves === v.rules.werewolves && (v.roles ?? []).filter((r) => r.role === "seer").length === 1, `${wolves} Lupi`);
}

/** Stanze col botto: tutti i telefoni vedono lo stesso esito, le carte tornano con le regole e l'esito con le stanze. */
function checkBotto(bots: Bot[], check: (n: string, ok: boolean, d?: string) => void): void {
  type Card = { team: string; character: string };
  type V = { phase: string; me: { id: string; card: Card | null } | null; cards?: { id: string; room: number | null; card: Card }[]; outcome?: { winner: string; sameRoom: boolean } | null };
  const views = bots.map((b) => b.lastViews.get("stanze-col-botto") as V | undefined);
  check("Botto: tutti i telefoni hanno ricevuto la vista del round", views.every((v) => v !== undefined));
  const known = views.filter((v): v is V => v !== undefined);
  if (known.length === 0) return;
  const v = known[0]!;
  const same = (pick: (x: V) => unknown) => known.every((x) => JSON.stringify(pick(x)) === JSON.stringify(pick(v)));
  check("Botto: i telefoni sono arrivati alla rivelazione", known.every((x) => x.phase === "reveal" || x.phase === "done"), known.map((x) => x.phase).join(","));
  const cards = v.cards ?? [];
  const count = (c: string) => cards.filter((x) => x.card.character === c).length;
  const n = bots.length;
  check("Botto: una carta per giocatore, un Presidente e un Bombarolo", cards.length === n && count("president") === 1 && count("bomber") === 1, `${cards.length} carte`);
  check("Botto: Giocatore d'azzardo solo con i dispari", count("gambler") === n % 2, String(count("gambler")));
  check("Botto: squadre Blu e Rossa pari", cards.filter((x) => x.card.team === "blue").length === cards.filter((x) => x.card.team === "red").length);
  check("Botto: ogni telefono ha la propria carta uguale a quella rivelata", known.every((x) => JSON.stringify(cards.find((c) => c.id === x.me?.id)?.card) === JSON.stringify(x.me?.card)));
  check("Botto: stesso esito e stesse carte su tutti i telefoni", same((x) => [x.outcome, x.cards]) && !!v.outcome);
  const room = (c: string) => cards.find((x) => x.card.character === c)?.room;
  check("Botto: l'esito corrisponde alle stanze del Presidente e del Bombarolo", !!v.outcome && v.outcome.sameRoom === (room("president") === room("bomber")) && v.outcome.winner === (v.outcome.sameRoom ? "red" : "blue"));
  const sizes = [0, 1].map((r) => cards.filter((x) => x.room === r).length);
  check("Botto: stanze bilanciate a fine partita", Math.abs(sizes[0]! - sizes[1]!) <= 1, sizes.join("/"));
}

/**
 * Agenti Segreti: tutti i telefoni vedono lo stesso esito e la stessa mappa finale, la mappa torna con le regole
 * (9/8 agenti, 7 civili, 1 assassino), solo due Capi-spia, e nessun telefono ha mai ricevuto ciò che non doveva.
 */
function checkAgenti(bots: Bot[], check: (n: string, ok: boolean, d?: string) => void): void {
  type V = { phase: string; starting: string; cards: { word: string; revealed: boolean; kind?: string }[]; outcome: { winner: string; reason: string } | null; me: { role: string; map?: string[] } | null };
  const views = bots.map((b) => b.lastViews.get("agenti-segreti") as V | undefined);
  check("Agenti: tutti i telefoni hanno ricevuto la vista del round", views.every((v) => v !== undefined));
  const known = views.filter((v): v is V => v !== undefined);
  if (known.length === 0) return;
  const v = known[0]!;
  const same = (pick: (x: V) => unknown) => known.every((x) => JSON.stringify(pick(x)) === JSON.stringify(pick(v)));
  check("Agenti: i telefoni sono arrivati alla fine", known.every((x) => x.phase === "reveal" || x.phase === "done"), known.map((x) => x.phase).join(","));
  check("Agenti: stesso esito e stessa griglia su tutti i telefoni", same((x) => [x.outcome, x.cards]) && !!v.outcome);
  const kinds = v.cards.map((c) => c.kind);
  const count = (k: string) => kinds.filter((x) => x === k).length;
  const second = v.starting === "red" ? "blue" : "red";
  check("Agenti: mappa con 9 e 8 agenti, 7 civili e 1 assassino", v.cards.length === 25 && count(v.starting) === 9 && count(second) === 8 && count("civilian") === 7 && count("assassin") === 1, kinds.join(","));
  const spies = known.filter((x) => x.me?.role === "spymaster");
  check("Agenti: due Capi-spia, con la stessa mappa che si vede alla fine", spies.length === 2 && spies.every((x) => JSON.stringify(x.me!.map) === JSON.stringify(kinds)), `${spies.length} Capi-spia`);
  const assassin = v.cards.findIndex((c) => c.kind === "assassin");
  check("Agenti: l'esito torna con la griglia", !!v.outcome && (v.outcome.reason !== "assassin" || v.cards[assassin]!.revealed));
  const leaks = bots.flatMap((b) => b.stats.leaks);
  check("Agenti: nessun telefono ha ricevuto colori delle carte coperte o la mappa senza essere Capo-spia", leaks.length === 0, leaks.slice(0, 3).join("; "));
}

/**
 * Pilota alla cieca: tutti i telefoni vedono la stessa cronologia dei livelli, i punti di ogni livello tornano rifacendo i
 * conti (ordine di arrivo, strada fatta, penalità), la classifica torna con i punti dei livelli, e nessun telefono ha
 * mai ricevuto gli strati che non doveva. Misura anche quanto ci mette lo stato ad arrivare dopo un passo dei piloti.
 */
function checkPilota(bots: Bot[], plan: { teams: number; levels: number }, finalState: GameAdminState | null, check: (n: string, ok: boolean, d?: string) => void, log: (l: string) => void): void {
  type Res = { teamId: string; finished: boolean; elapsedMs: number | null; progress: number; strikes: number; points: number | null };
  type V = { phase: string; settings: { finishPoints: number[]; distancePoints: number; strikePenalty: number }; teams: { id: string; members: unknown[] }[]; history: { level: number; results: Res[] }[]; board: Record<string, number> };
  const views = bots.map((b) => b.lastViews.get("pilota-cieco") as V | undefined);
  check("Pilota: tutti i telefoni hanno ricevuto la vista del round", views.every((v) => v !== undefined));
  const known = views.filter((v): v is V => v !== undefined);
  if (known.length === 0) return;
  const v = known[0]!;
  check("Pilota: i telefoni sono arrivati alla classifica", known.every((x) => x.phase === "final" || x.phase === "done"), known.map((x) => x.phase).join(","));
  check("Pilota: stessa cronologia e stessa classifica su tutti i telefoni", known.every((x) => JSON.stringify([x.history, x.board]) === JSON.stringify([v.history, v.board])));
  check("Pilota: un risultato per squadra e per livello", v.history.length === plan.levels && v.history.every((h) => h.results.length === plan.teams), v.history.map((h) => h.results.length).join(","));
  const s = v.settings;
  const bad = v.history.flatMap((h) => {
    const finishers = h.results.filter((r) => r.finished).sort((a, b) => a.elapsedMs! - b.elapsedMs! || a.teamId.localeCompare(b.teamId));
    return h.results.filter((r) => {
      const base = r.finished ? s.finishPoints[Math.min(finishers.indexOf(r), s.finishPoints.length - 1)]! : Math.round(s.distancePoints * r.progress);
      return r.points !== Math.max(0, base - s.strikePenalty * r.strikes);
    });
  });
  check("Pilota: i punti di ogni livello tornano con le regole", bad.length === 0, JSON.stringify(bad.slice(0, 1)));
  const sums = Object.fromEntries(v.teams.map((t) => [t.id, v.history.reduce((n, h) => n + (h.results.find((r) => r.teamId === t.id)?.points ?? 0), 0)]));
  check("Pilota: la classifica è la somma dei livelli", v.teams.every((t) => (v.board[t.id] ?? 0) === sums[t.id]), JSON.stringify([v.board, sums]));
  const size = new Map(v.teams.map((t) => [t.id, t.members.length]));
  const expected = v.teams.reduce((n, t) => n + (v.board[t.id] ?? 0) * (size.get(t.id) ?? 0), 0);
  const lb = finalState?.leaderboards;
  if (lb) check("Pilota: la somma dei punti in classifica torna con le squadre", lb.players.reduce((n, p) => n + p.points, 0) === expected, `${lb.players.reduce((n, p) => n + p.points, 0)} contro ${expected}`);
  const arrivals = v.history.flatMap((h) => h.results).filter((r) => r.finished).length;
  check("Pilota: almeno una squadra è arrivata in fondo", arrivals > 0, `${arrivals} arrivi`);
  check("Pilota: qualche errore tra mine e pattuglie (i piloti sbagliano ogni tanto)", v.history.flatMap((h) => h.results).some((r) => r.strikes > 0));
  const leaks = bots.flatMap((b) => b.stats.leaks);
  check("Pilota: nessun telefono ha ricevuto strati che non doveva", leaks.length === 0, leaks.slice(0, 3).join("; "));
  const lat = bots.flatMap((b) => b.stats.inputToState).sort((a, b) => a - b);
  if (lat.length > 0) {
    const at = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]!;
    log(`  Pilota: dopo un passo lo stato arriva a chi l'ha mandato in mediana ${at(0.5)} ms · p95 ${at(0.95)} ms · max ${lat.at(-1)} ms (${lat.length} passi)`);
    check("Pilota: lo stato arriva in fretta dopo un passo (p95 sotto 500 ms)", at(0.95) < 500, `p95 ${at(0.95)} ms`);
  }
}

/**
 * Plancia di Comando: tutti i telefoni arrivano alla classifica, i membri di un equipaggio hanno lo stesso piazzamento e gli
 * stessi punti, i punti tornano rifacendo i conti (ordini eseguiti, scafo, podio), la somma in classifica torna con gli
 * equipaggi e nessun telefono ha ricevuto più del suo pannello. Misura anche il tempo tra un comando e lo stato di ritorno.
 */
function checkPlancia(bots: Bot[], plan: { crews: number; sectors: number }, finalState: GameAdminState | null, check: (n: string, ok: boolean, d?: string) => void, log: (l: string) => void): void {
  type V = { phase: string; sector: number; settings: { mode: string; stepPoints: number; hullBonus: number; podiumPoints: number[] }; crew?: { id: string }; me: { rank?: number; points?: number } | null };
  type C = { id: string; members: number; done: number; missed: number; hull: number; distance: number; rank?: number; points?: number };
  const views = bots.map((b) => b.lastViews.get("plancia-comando") as V | undefined);
  check("Plancia: tutti i telefoni hanno ricevuto la vista del round", views.every((v) => v !== undefined));
  const known = views.filter((v): v is V => v !== undefined);
  if (known.length === 0) return;
  check("Plancia: i telefoni sono arrivati alla classifica", known.every((x) => x.phase === "final" || x.phase === "done"), known.map((x) => x.phase).join(","));
  const crews = (oracle.plancia?.crews ?? []) as C[];
  check("Plancia: gli equipaggi sono quelli previsti", crews.length === plan.crews, `${crews.length} contro ${plan.crews}`);
  const s = known[0]!.settings;
  const podium = s.mode === "squadre" && crews.length > 1;
  const bad = crews.filter((c) => c.points !== s.stepPoints * c.done + Math.round((s.hullBonus * c.hull) / 100) + (podium ? (s.podiumPoints[c.rank! - 1] ?? 0) : 0));
  check("Plancia: i punti di ogni equipaggio tornano con le regole", bad.length === 0, JSON.stringify(bad.slice(0, 1)));
  const sorted = [...crews].sort((a, b) => a.rank! - b.rank!);
  check("Plancia: la classifica va per strada fatta (media per membro)", sorted.every((c, i) => i === 0 || sorted[i - 1]!.distance >= c.distance), sorted.map((c) => c.distance).join(","));
  const byCrew = new Map<string, V[]>();
  for (const v of known) byCrew.set(v.crew?.id ?? "?", [...(byCrew.get(v.crew?.id ?? "?") ?? []), v]);
  check(
    "Plancia: i membri di un equipaggio hanno lo stesso piazzamento e gli stessi punti, uguali a quelli dell'equipaggio",
    crews.every((c) => (byCrew.get(c.id) ?? []).every((v) => v.me?.rank === c.rank && v.me?.points === c.points)),
  );
  const lb = finalState?.leaderboards;
  if (lb) {
    const expected = crews.reduce((n, c) => n + (c.points ?? 0) * c.members, 0);
    check("Plancia: la somma dei punti in classifica torna con gli equipaggi", lb.players.reduce((n, p) => n + p.points, 0) === expected, `${lb.players.reduce((n, p) => n + p.points, 0)} contro ${expected}`);
  }
  check("Plancia: gli equipaggi hanno eseguito ordini", crews.every((c) => c.done > 0), crews.map((c) => c.done).join(","));
  check("Plancia: qualche ordine scaduto (i bot non sentono tutto)", crews.some((c) => c.missed > 0));
  const leaks = bots.flatMap((b) => b.stats.leaks);
  check("Plancia: nessun telefono ha ricevuto più del suo pannello o stato grezzo", leaks.length === 0, leaks.slice(0, 3).join("; "));
  log(`  Plancia: ${crews.map((c) => `${c.rank}° ${c.done} ordini (${c.missed} scaduti, scafo ${c.hull}%)`).join(" · ")}`);
  const lat = bots.flatMap((b) => b.stats.inputToState).sort((a, b) => a - b);
  if (lat.length > 0) {
    const at = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]!;
    log(`  Plancia: dopo un comando lo stato arriva a chi l'ha mandato in mediana ${at(0.5)} ms · p95 ${at(0.95)} ms · max ${lat.at(-1)} ms (${lat.length} comandi)`);
    // un pulsante premuto non cambia la vista di chi lo preme (cambia quella del compagno che aveva l'ordine): senza stato di ritorno
    // il campione chiude con il primo aggiornamento qualsiasi, quindi la coda lunga è attesa; si controlla che resti sotto 1,5 s
    check("Plancia: lo stato arriva in fretta dopo un comando (p95 sotto 1,5 s)", at(0.95) < 1_500, `p95 ${at(0.95)} ms`);
  }
}

/**
 * Il Pianeta Nascosto: tutti i telefoni arrivano al punteggio; la somma in classifica torna con i punti delle squadre
 * (i robot non contano); nessun telefono ha ricevuto il sistema solare prima della rivelazione. Misura anche il tempo tra
 * un input e lo stato di ritorno.
 */
function checkPianeta(bots: Bot[], teams: number, finalState: GameAdminState | null, check: (n: string, ok: boolean, d?: string) => void, log: (l: string) => void): void {
  type Row = { id: string; rank: number; breakdown: { total: number } };
  type V = { phase: string; settings: { pointScale: number }; observatories: { id: string; bot: boolean; members: number }[]; scores?: Row[]; sky?: string[]; mine: { id: string } | null };
  const views = bots.map((b) => b.lastViews.get("pianeta-nascosto") as V | undefined);
  check("Pianeta: tutti i telefoni hanno ricevuto la vista del round", views.every((v) => v !== undefined));
  const known = views.filter((v): v is V => v !== undefined);
  if (known.length === 0) return;
  check("Pianeta: i telefoni sono arrivati al punteggio", known.every((x) => x.phase === "final" || x.phase === "done"), known.map((x) => x.phase).join(","));
  const v0 = known[0]!;
  check("Pianeta: gli osservatori sono quelli previsti (squadre e un robot)", v0.observatories.length === teams + 1 && v0.observatories.filter((o) => o.bot).length === 1, JSON.stringify(v0.observatories.map((o) => o.id)));
  check("Pianeta: il sistema solare compare solo alla rivelazione", known.every((x) => Array.isArray(x.sky) && x.sky.length === 12));
  const humans = v0.observatories.filter((o) => !o.bot);
  const lb = finalState?.leaderboards;
  if (lb && v0.scores) {
    const expected = humans.reduce((n, o) => n + (v0.scores!.find((r) => r.id === o.id)?.breakdown.total ?? 0) * v0.settings.pointScale * o.members, 0);
    const sum = lb.players.reduce((n, p) => n + p.points, 0);
    check("Pianeta: la somma dei punti in classifica torna con le squadre (i robot non contano)", sum === expected, `${sum} contro ${expected}`);
  }
  const leaks = bots.flatMap((b) => b.stats.leaks);
  check("Pianeta: nessun telefono ha ricevuto il sistema solare, la soluzione o le teorie altrui", leaks.length === 0, leaks.slice(0, 3).join("; "));
  const lat = bots.flatMap((b) => b.stats.inputToState).sort((a, b) => a - b);
  if (lat.length > 0) {
    const at = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]!;
    log(`  Pianeta: dopo un input lo stato arriva a chi l'ha mandato in mediana ${at(0.5)} ms · p95 ${at(0.95)} ms · max ${lat.at(-1)} ms (${lat.length} input)`);
    check("Pianeta: lo stato arriva in fretta dopo un input (p95 sotto 1,5 s)", at(0.95) < 1_500, `p95 ${at(0.95)} ms`);
  }
}

/**
 * Artificieri: tutti i telefoni vedono la stessa cronologia, con un esito per ogni squadra; i punti di ogni turno tornano
 * con le regole; la somma dei punti in classifica torna con i turni e con le scommesse; nessuna fuga di informazioni.
 */
function checkArtificieri(bots: Bot[], teams: number, finalState: GameAdminState | null, check: (n: string, ok: boolean, d?: string) => void): void {
  type Entry = { outcome: string; reason: string; solved: number; moduleCount: number; secondsLeft: number; points: number; betWinners: unknown[]; teamId: string };
  type V = { phase: string; settings: { modulePoints: number; defusePoints: number; timeBonus: number; betPoints: number }; teams: { id: string; members: unknown[] }[]; history: Entry[] };
  const views = bots.map((b) => b.lastViews.get("artificieri") as V | undefined);
  check("Artificieri: tutti i telefoni hanno ricevuto la vista del round", views.every((v) => v !== undefined));
  const known = views.filter((v): v is V => v !== undefined);
  if (known.length === 0) return;
  const v = known[0]!;
  check("Artificieri: i telefoni sono arrivati alla classifica", known.every((x) => x.phase === "final" || x.phase === "done"), known.map((x) => x.phase).join(","));
  check("Artificieri: stessa cronologia su tutti i telefoni", known.every((x) => JSON.stringify(x.history) === JSON.stringify(v.history)));
  check("Artificieri: un turno per squadra", v.history.length === teams, `${v.history.length} turni per ${teams} squadre`);
  check("Artificieri: ogni turno ha un esito (disinnescata o esplosa)", v.history.every((e) => e.outcome === "defused" || e.outcome === "exploded"), v.history.map((e) => e.outcome).join(","));
  const s = v.settings;
  const bad = v.history.filter((e) => e.points !== s.modulePoints * e.solved + (e.outcome === "defused" ? s.defusePoints + s.timeBonus * e.secondsLeft : 0) || e.solved > e.moduleCount);
  check("Artificieri: i punti di ogni turno tornano con le regole", bad.length === 0, JSON.stringify(bad.slice(0, 1)));
  const size = new Map(v.teams.map((t) => [t.id, t.members.length]));
  const expected = v.history.reduce((n, e) => n + e.points * (size.get(e.teamId) ?? 0) + e.betWinners.length * s.betPoints, 0);
  const lb = finalState?.leaderboards;
  if (lb) check("Artificieri: la somma dei punti in classifica torna con turni e scommesse", lb.players.reduce((n, p) => n + p.points, 0) === expected, `${lb.players.reduce((n, p) => n + p.points, 0)} contro ${expected}`);
  check("Artificieri: almeno una bomba disinnescata dai bot", v.history.some((e) => e.outcome === "defused"), v.history.map((e) => `${e.outcome}:${e.solved}`).join(","));
  const leaks = bots.flatMap((b) => b.stats.leaks);
  check("Artificieri: nessun telefono ha ricevuto bordo, dati, regole, soluzioni o manuale altrui", leaks.length === 0, leaks.slice(0, 3).join("; "));
}

/**
 * Lunghezza d'Onda: tutti i telefoni hanno la stessa classifica e la stessa cronologia, e ogni turno della cronologia
 * torna rifacendo i conti con `scoring.ts`; la somma dei turni dà la classifica. Nessuna vista con il bersaglio a chi
 * non doveva averlo.
 */
function checkOnda(name: string, bots: Bot[], check: (n: string, ok: boolean, d?: string) => void): void {
  type R = { psychicId: string; teamId: string | null; target: number; guesses: { playerId: string; pos: number; zone: number; points: number }[]; psychicPoints: number; teamPos: number | null; zone: number; counters: { teamId: string; dir: "left" | "right" | null; correct: boolean; points: number }[] };
  type V = { phase: string; mode: "tutti" | "squadre"; rules: { zoneWidth: number; unitPoints: number; counterPoints: number }; history: R[]; standings: { id: string; points: number }[]; teams: { id: string; score: number }[] };
  const views = bots.map((b) => b.lastViews.get("lunghezza-onda") as V | undefined);
  check(`${name}: tutti i telefoni hanno ricevuto la vista del round`, views.every((v) => v !== undefined));
  const known = views.filter((v): v is V => v !== undefined);
  if (known.length === 0) return;
  const v = known[0]!;
  const same = (pick: (x: V) => unknown) => known.every((x) => JSON.stringify(pick(x)) === JSON.stringify(pick(v)));
  check(`${name}: i telefoni sono arrivati alla classifica finale`, known.every((x) => x.phase === "final" || x.phase === "done"), known.map((x) => x.phase).join(","));
  check(`${name}: stessa classifica e stessa cronologia su tutti i telefoni`, same((x) => [x.standings, x.history, x.teams]));
  check(`${name}: almeno un turno giocato`, v.history.length > 0, String(v.history.length));
  const { zoneWidth: zw, unitPoints: unit, counterPoints: cp } = v.rules;
  const totals = new Map<string, number>();
  const add = (id: string, n: number) => totals.set(id, (totals.get(id) ?? 0) + n);
  const wrong: string[] = [];
  for (const [i, r] of v.history.entries()) {
    if (v.mode === "tutti") {
      const again = scoreFreeForAll(r.guesses.map((g) => ({ playerId: g.playerId, pos: g.pos })), r.target, zw, unit);
      if (JSON.stringify(again.guesses) !== JSON.stringify(r.guesses) || again.psychicPoints !== r.psychicPoints) wrong.push(`turno ${i + 1}`);
      for (const g of r.guesses) add(g.playerId, g.points);
      add(r.psychicId, r.psychicPoints);
    } else {
      const again = scoreTeams(r.teamPos, r.target, zw, r.counters.map((c) => ({ teamId: c.teamId, dir: c.dir })), cp);
      if (again.zone !== r.zone || JSON.stringify(again.counters) !== JSON.stringify(r.counters)) wrong.push(`turno ${i + 1}`);
      add(r.teamId!, r.zone);
      for (const c of r.counters) add(c.teamId, c.points);
    }
  }
  check(`${name}: i punti di ogni turno tornano con scoring.ts`, wrong.length === 0, wrong.join(", "));
  const mismatch =
    v.mode === "tutti"
      ? v.standings.filter((p) => p.points !== (totals.get(p.id) ?? 0)).map((p) => p.id)
      : v.teams.filter((t) => t.score !== (totals.get(t.id) ?? 0)).map((t) => t.id);
  check(`${name}: la classifica è la somma dei turni`, mismatch.length === 0, mismatch.slice(0, 3).join(", "));
  if (v.mode === "squadre") {
    const scoreOfTeam = new Map(v.teams.map((t) => [t.id, t.score]));
    check(`${name}: in classifica ogni punto vale ${unit} per ogni membro`, v.standings.every((p) => [...scoreOfTeam.values()].some((s) => s * unit === p.points)));
  }
  const leaks = bots.flatMap((b) => b.stats.leaks);
  check(`${name}: nessun bersaglio o posizione altrui prima della rivelazione`, leaks.length === 0, leaks.slice(0, 3).join("; "));
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
  if (!["classic", "duel", "stanze", "shadow", "parole", "botto", "agenti", "onda", "artificieri", "pilota", "plancia", "pianeta", "all"].includes(scenario)) {
    console.error("--scenario deve essere classic, duel, stanze, shadow, parole, botto, agenti, onda, artificieri, pilota, plancia, pianeta o all");
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
