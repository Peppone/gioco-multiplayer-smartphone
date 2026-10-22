import { z } from "zod";
import { type MinigameType, type ParticipantInfo, type ScoreDelta, fairTime } from "@gioco/shared";
import { type TeamEntry, formTeams } from "../artificieri/turns.js";
import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { GRACE_MS, rankByPoints } from "../util.js";
import { DEFAULT_ADJECTIVES, DEFAULT_NOUNS } from "./names.js";
import { type Control, type Order, SLIDER_MAX, makePanels, nextOrder, valueCount, valueText } from "./panels.js";
import { type CrewScore, crewPoints, distanceOf, rankCrews } from "./scoring.js";

/**
 * Plancia di Comando: ordini gridati tra telefoni, in stile Spaceteam. Ogni giocatore ha un pannello di comandi dai nomi assurdi
 * e un ordine a tempo che quasi sempre riguarda il pannello di un compagno: bisogna gridarlo. Ordine eseguito, l'astronave
 * avanza; ordine scaduto, lo scafo si danneggia. Ogni settore ha pannelli nuovi e ordini più rapidi.
 * Regole e decisioni in docs/PIANO-PLANCIA-COMANDO.md.
 */

export type Phase = "ready" | "sector" | "jump" | "final" | "done";
export type EventKind = "alarm" | "blackout";

/** Il salto tra due settori: la TV lo anima, i telefoni aspettano. */
export const JUMP_SECONDS = 5;
export const ALARM_SECONDS = 5;
export const BLACKOUT_SECONDS = 8;
/** Ogni settore gli ordini durano il 10% meno, fino a `minOrderSeconds`. */
const ORDER_DECAY = 0.9;
const MAX_CREW = 8;

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });
const word = z.string().trim().min(3).max(20);

export const planciaConfigSchema = z.object({
  mode: z
    .enum(["squadre", "unico"])
    .default("squadre")
    .meta({ ...sec("Modalità", "A squadre: ogni team è un equipaggio e si gareggia. Equipaggio unico: tutti insieme contro il tempo"), enumLabels: { squadre: "A squadre", unico: "Equipaggio unico" } }),
  sectors: z.number().int().min(1).max(10).default(5).meta(sec("Settori")),
  sectorSeconds: z.number().int().min(30).max(180).default(60).meta(sec("Durata di un settore (s)", "A ogni settore pannelli nuovi e ordini più rapidi")),
  controlsPerPanel: z.number().int().min(3).max(6).default(4).meta(sec("Comandi per pannello", "Dal terzo settore uno in più, fino a 6")),
  orderSeconds: z.number().int().min(5).max(30).default(12).meta(sec("Tempo per un ordine (s)", "Primo settore; scende del 10% a ogni settore")),
  minOrderSeconds: z.number().int().min(3).max(15).default(6).meta(sec("Tempo minimo per un ordine (s)")),
  ownShare: z.number().int().min(0).max(50).default(20).meta(sec("Ordini sul proprio pannello (%)", "Gli altri riguardano un compagno: vanno gridati")),
  damagePerMiss: z.number().int().min(1).max(25).default(5).meta(sec("Danno per ordine scaduto (% dello scafo)")),
  events: z.boolean().default(true).meta(sec("Eventi", "Allarme generale (tutti premono il pulsante rosso) e blackout (alcuni pannelli mostrano solo le iniziali)")),
  nouns: z.array(word).min(8).max(200).default(DEFAULT_NOUNS).meta({ title: "Sostantivi dei comandi", description: "Con gli aggettivi formano i nomi: «Valvola Gelatinosa»", itemLabel: "Sostantivo", widget: "lines" }),
  adjectives: z.array(word).min(8).max(200).default(DEFAULT_ADJECTIVES).meta({ title: "Aggettivi dei comandi", description: "Al maschile: si accordano con i sostantivi femminili", itemLabel: "Aggettivo", widget: "lines" }),
  stepPoints: z.number().int().min(0).max(100).default(10).meta(sec("Punti per ordine eseguito", "A ogni membro dell'equipaggio")),
  hullBonus: z.number().int().min(0).max(500).default(100).meta(sec("Bonus scafo", "A fine round, in proporzione allo scafo rimasto")),
  podiumPoints: z.array(z.number().int().min(0).max(1000)).min(1).max(8).default([150, 100, 50]).meta({ title: "Punti per piazzamento", description: "Tra le squadre: primo, secondo… (non in «equipaggio unico»)", itemLabel: "Punti" }),
});

export type PlanciaConfig = z.infer<typeof planciaConfigSchema>;

const inputSchema = z.discriminatedUnion("type", [
  /** Interruttore (0/1), cursore (0–5), selettore (indice): solo dal proprietario del comando. */
  z.object({ type: z.literal("set"), control: z.string().min(1).max(20), value: z.number().int().min(0).max(SLIDER_MAX) }),
  z.object({ type: z.literal("press"), control: z.string().min(1).max(20) }),
  z.object({ type: z.literal("alarm") }),
]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("launch") }),
  z.object({ type: z.literal("skip-sector") }),
  /** Riporta al 50% gli scafi sotto il 50% (di un equipaggio, o di tutti) e li rimette in moto. */
  z.object({ type: z.literal("repair"), crewId: z.string().optional() }),
  /** Ridistribuisce i pannelli; con `playerId` segna (o riabilita) un telefono fuori uso e ne toglie i comandi. */
  z.object({ type: z.literal("reshuffle"), playerId: z.string().optional() }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("end") }),
]);
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface CrewEvent {
  kind: EventKind;
  until: number;
  /** Allarme: chi ha già premuto. */
  pressed: string[];
  /** Blackout: i pannelli che mostrano solo le iniziali. */
  victims: string[];
}

export interface CrewState {
  id: string;
  name: string;
  color: string;
  members: string[];
  /** Telefoni fuori uso (segnalati dalla regia): non hanno comandi né ordini. */
  inactive: string[];
  controls: Control[];
  orders: Record<string, Order>;
  progress: number;
  /** Da 0 a 100. */
  hull: number;
  done: number;
  missed: number;
  lastDone: { text: string; at: number } | null;
  event: CrewEvent | null;
  /** Scafo a zero: l'astronave si ferma dov'è. */
  stopped: boolean;
}

export interface PlanciaState {
  cfg: PlanciaConfig;
  seed: number;
  participants: ParticipantInfo[];
  players: string[];
  crews: CrewState[];
  /** Da 1; 0 prima del decollo. */
  sector: number;
  /** Quante volte la regia ha ridistribuito i pannelli (cambia il seme dei nomi). */
  reshuffles: number;
  nextOrderId: number;
  /** L'evento del settore: stesso istante e stesso tipo per tutti gli equipaggi. */
  sectorEvent: { kind: EventKind; at: number; fired: boolean } | null;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  pausedAt: number | null;
}

type S = PlanciaState;

const nick = (s: S, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";
const crewOf = (s: S, playerId: string) => s.crews.find((c) => c.members.includes(playerId));
const activeMembers = (c: CrewState) => c.members.filter((m) => !c.inactive.includes(m));
const crewScore = (c: CrewState): CrewScore => ({ id: c.id, members: c.members.length, progress: c.progress, done: c.done, hull: c.hull });

/** Tempo per un ordine nel settore `sector` (da 1): il 10% in meno a ogni settore, fino al minimo. */
export const orderSecondsFor = (cfg: PlanciaConfig, sector: number): number => Math.max(cfg.minOrderSeconds, Math.round(cfg.orderSeconds * ORDER_DECAY ** (sector - 1) * 10) / 10);
/** Comandi per pannello nel settore `sector`: uno in più dal terzo, fino a 6. */
export const controlsFor = (cfg: PlanciaConfig, sector: number): number => Math.min(6, cfg.controlsPerPanel + (sector >= 3 ? 1 : 0));

// ---- Pannelli e ordini ----

/** Pannelli nuovi per tutti gli equipaggi (nomi diversi tra equipaggi) e un ordine a testa. */
function startSector(s: S, sector: number, now: number): S {
  const taken = new Set<string>();
  let nextOrderId = s.nextOrderId;
  const crews = s.crews.map((c, i) => {
    const members = activeMembers(c);
    const controls = members.length === 0 ? [] : makePanels({ members, perPanel: controlsFor(s.cfg, sector), nouns: s.cfg.nouns, adjectives: s.cfg.adjectives, seed: deriveSeed(s.seed, sector * 1000 + i * 10 + s.reshuffles), taken, idPrefix: `${c.id.slice(0, 4)}-${sector}-` });
    controls.forEach((x) => taken.add(x.name));
    const fresh: CrewState = { ...c, controls, orders: {}, event: null };
    const issued = issueAll(fresh, s, sector, now, nextOrderId);
    nextOrderId = issued.nextOrderId;
    return issued.crew;
  });
  const rng = makeRng(deriveSeed(s.seed, 9000 + sector));
  const sectorEvent = s.cfg.events ? { kind: (rng() < 0.5 ? "alarm" : "blackout") as EventKind, at: now + Math.round(s.cfg.sectorSeconds * 1000 * (0.35 + 0.3 * rng())), fired: false } : null;
  return { ...s, crews, sector, nextOrderId, sectorEvent, phase: "sector", phaseStartedAt: now, phaseEndsAt: now + s.cfg.sectorSeconds * 1000, pausedRemainingMs: null, pausedAt: null };
}

/** Un ordine per ogni membro attivo che non ne ha (gli equipaggi fermi non ne ricevono). */
function issueAll(crew: CrewState, s: S, sector: number, now: number, firstId: number): { crew: CrewState; nextOrderId: number } {
  if (crew.stopped) return { crew: { ...crew, orders: {} }, nextOrderId: firstId };
  let id = firstId;
  const orders = { ...crew.orders };
  for (const holder of activeMembers(crew)) {
    if (orders[holder]) continue;
    const busy = new Set(Object.values(orders).map((o) => o.controlId));
    const order = nextOrder({ controls: crew.controls, busy, holder, ownShare: s.cfg.ownShare, seed: s.seed, id, now, seconds: orderSecondsFor(s.cfg, sector) });
    if (order) {
      orders[holder] = order;
      id++;
    }
  }
  return { crew: { ...crew, orders }, nextOrderId: id };
}

const replaceCrew = (s: S, crew: CrewState): S => ({ ...s, crews: s.crews.map((c) => (c.id === crew.id ? crew : c)) });

/** Un nuovo ordine per `holder` (dopo uno eseguito o scaduto). */
function reissue(s: S, crew: CrewState, holder: string, now: number): S {
  const rest = { ...crew.orders };
  delete rest[holder];
  const busy = new Set(Object.values(rest).map((o) => o.controlId));
  const order = nextOrder({ controls: crew.controls, busy, holder, ownShare: s.cfg.ownShare, seed: s.seed, id: s.nextOrderId, now, seconds: orderSecondsFor(s.cfg, s.sector) });
  return {
    ...replaceCrew(s, { ...crew, orders: order ? { ...rest, [holder]: order } : rest }),
    nextOrderId: order ? s.nextOrderId + 1 : s.nextOrderId,
  };
}

const damage = (s: S, crew: CrewState): CrewState => {
  const hull = Math.max(0, crew.hull - s.cfg.damagePerMiss);
  return { ...crew, hull, stopped: hull === 0, missed: crew.missed + 1 };
};

function executeOrder(s: S, crew: CrewState, order: Order, control: Control, now: number): S {
  const next: CrewState = { ...crew, done: crew.done + 1, progress: crew.progress + 1, lastDone: { text: `${control.name} → ${valueText(control, order.target)}`, at: now } };
  return reissue(replaceCrew(s, next), next, order.holder, now);
}

// ---- Fasi ----

const allStopped = (s: S) => s.crews.every((c) => c.stopped);

/** Chiude l'evento in corso di un equipaggio: l'allarme è superato se hanno premuto tutti, altrimenti costa uno scafo; il blackout finisce e basta. */
function resolveEvent(s: S, crewId: string, now: number): S {
  const c = s.crews.find((x) => x.id === crewId)!;
  const ev = c.event;
  if (!ev) return s;
  let crew: CrewState = { ...c, event: null };
  if (ev.kind === "alarm") {
    const everyone = activeMembers(c).every((m) => ev.pressed.includes(m));
    crew = everyone ? { ...crew, progress: crew.progress + 1, lastDone: { text: "Allarme generale: superato!", at: now } } : { ...damage(s, crew), lastDone: { text: "Allarme generale: mancato", at: now } };
  }
  return replaceCrew(s, crew);
}

const resolveEvents = (s: S, now: number): S => s.crews.reduce((acc, c) => resolveEvent(acc, c.id, now), s);

function endSector(s: S, now: number): S {
  const closed = resolveEvents(s, now);
  const next: S = { ...closed, sectorEvent: null, crews: closed.crews.map((c) => ({ ...c, orders: {} })) };
  if (next.sector >= next.cfg.sectors || allStopped(next)) return { ...next, phase: "final", phaseStartedAt: now, phaseEndsAt: null };
  return { ...next, phase: "jump", phaseStartedAt: now, phaseEndsAt: now + JUMP_SECONDS * 1000 };
}

function fireEvent(s: S, now: number): S {
  const ev = s.sectorEvent!;
  const crews = s.crews.map((c): CrewState => {
    if (c.stopped) return c;
    const members = activeMembers(c);
    const victims = ev.kind === "blackout" ? shuffle(members, makeRng(deriveSeed(s.seed, 7000 + s.sector))).slice(0, Math.max(1, Math.floor(members.length / 2))) : [];
    return { ...c, event: { kind: ev.kind, until: now + (ev.kind === "alarm" ? ALARM_SECONDS : BLACKOUT_SECONDS) * 1000, pressed: [], victims } };
  });
  return { ...s, crews, sectorEvent: { ...ev, fired: true } };
}

/** Sposta di `d` ms ogni tempo (dopo una pausa): ordini, eventi, ultimo ordine eseguito. */
function shiftTimes(s: S, d: number): S {
  return {
    ...s,
    phaseStartedAt: s.phaseStartedAt + d,
    sectorEvent: s.sectorEvent && { ...s.sectorEvent, at: s.sectorEvent.at + d },
    crews: s.crews.map((c) => ({
      ...c,
      orders: Object.fromEntries(Object.entries(c.orders).map(([k, o]) => [k, { ...o, issuedAt: o.issuedAt + d, deadline: o.deadline + d }])),
      event: c.event && { ...c.event, until: c.event.until + d },
      lastDone: c.lastDone && { ...c.lastDone, at: c.lastDone.at + d },
    })),
  };
}

// ---- Punti ----

function standings(s: S): { id: string; rank: number; points: number }[] {
  const order = rankCrews(s.crews.map(crewScore));
  const podium = s.cfg.mode === "squadre" && s.crews.length > 1;
  return order.map((id, rank) => ({ id, rank, points: crewPoints(s.cfg, crewScore(s.crews.find((c) => c.id === id)!), rank, podium) }));
}

function playerTotals(s: S): Record<string, number> {
  const totals: Record<string, number> = {};
  if (s.sector === 0) return totals;
  for (const r of standings(s)) for (const id of s.crews.find((c) => c.id === r.id)!.members) totals[id] = r.points;
  return totals;
}

// ---- Viste ----

export interface RulesInfo {
  mode: PlanciaConfig["mode"];
  sectors: number;
  sectorSeconds: number;
  orderSeconds: number;
  minOrderSeconds: number;
  damagePerMiss: number;
  events: boolean;
  stepPoints: number;
  hullBonus: number;
  podiumPoints: number[];
}

function rulesOf(s: S): RulesInfo {
  const c = s.cfg;
  return { mode: c.mode, sectors: c.sectors, sectorSeconds: c.sectorSeconds, orderSeconds: c.orderSeconds, minOrderSeconds: c.minOrderSeconds, damagePerMiss: c.damagePerMiss, events: c.events, stepPoints: c.stepPoints, hullBonus: c.hullBonus, podiumPoints: c.podiumPoints };
}

/** Parte uguale per tutti, essenziale: niente pannelli, ordini né avanzamento (quello sta solo sulla TV). */
function publicBase(s: S) {
  return {
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    phaseEndsAt: s.phaseEndsAt,
    pausedRemainingMs: s.pausedRemainingMs,
    settings: rulesOf(s),
    sector: s.sector,
  };
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]!.toUpperCase()).join(".") + ".";

function crewPublic(s: S, c: CrewState) {
  const rank = standings(s).find((r) => r.id === c.id);
  return {
    id: c.id,
    name: c.name,
    color: c.color,
    members: c.members.length,
    progress: c.progress,
    distance: Math.round(distanceOf(crewScore(c)) * 10) / 10,
    hull: c.hull,
    done: c.done,
    missed: c.missed,
    stopped: c.stopped,
    lastDone: c.lastDone,
    event: c.event ? { kind: c.event.kind, until: c.event.until } : null,
    // il conto, non gli ordini: lo schermo non rivela né comandi né ordini
    activeOrders: Object.keys(c.orders).length,
    ...((s.phase === "final" || s.phase === "done") && rank && { rank: rank.rank + 1, points: rank.points }),
  };
}

export const planciaComando: MinigameType<PlanciaConfig, PlanciaState, Input, Command> = {
  id: "plancia-comando",
  title: "Plancia di Comando",
  defaultTheme: "retro80",
  teamBased: true,
  configSchema: planciaConfigSchema as unknown as z.ZodType<PlanciaConfig>,
  inputSchema,
  commandSchema,
  minPlayers: 2,

  sampleConfig: planciaConfigSchema.parse({}) as PlanciaConfig,

  // In «squadre» ogni team della serata con giocatori è un equipaggio, da 2 a 8 membri.
  buildConfig(raw, _lookup, roster) {
    const parsed = planciaConfigSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
    if (parsed.data.minOrderSeconds > parsed.data.orderSeconds) return { ok: false, error: "Il tempo minimo per un ordine non può superare quello del primo settore" };
    if (parsed.data.mode === "squadre") {
      for (const t of roster.teams) {
        const n = roster.players.filter((p) => p.teamId === t.id).length;
        if (n === 1) return { ok: false, error: `La squadra «${t.name}» ha un solo giocatore: servono almeno 2 (nessuno a cui gridare gli ordini)` };
        if (n > MAX_CREW) return { ok: false, error: `La squadra «${t.name}» ha ${n} giocatori: al massimo ${MAX_CREW} per equipaggio (gli ordini girerebbero troppo poco)` };
      }
    }
    return { ok: true, config: parsed.data as PlanciaConfig };
  },

  init(config, ctx, now) {
    const rng = makeRng(ctx.seed);
    // senza team (o in «unico») equipaggi da 4–6: uno solo, oppure ceil(n / 6) gruppi
    const teams: TeamEntry[] =
      config.mode === "unico"
        ? ctx.players.length === 0 ? [] : [{ id: "all", name: "Equipaggio", color: "#3e63dd", members: ctx.players.map((p) => p.id), order: [] }]
        : formTeams(ctx.players, ctx.teams, rng, (n) => Math.max(1, Math.ceil(n / 6)));
    return {
      cfg: config,
      seed: ctx.seed,
      participants: ctx.players,
      players: ctx.players.map((p) => p.id),
      crews: teams.map((t): CrewState => ({ id: t.id, name: t.name, color: t.color, members: t.members, inactive: [], controls: [], orders: {}, progress: 0, hull: 100, done: 0, missed: 0, lastDone: null, event: null, stopped: false })),
      sector: 0,
      reshuffles: 0,
      nextOrderId: 1,
      sectorEvent: null,
      phase: teams.length === 0 ? "done" : "ready",
      phaseStartedAt: now,
      phaseEndsAt: null,
      pausedRemainingMs: null,
      pausedAt: null,
    };
  },

  onInput(state, playerId, input, meta) {
    if (!state.players.includes(playerId) || state.phase !== "sector" || state.pausedRemainingMs !== null) return state;
    const crew = crewOf(state, playerId);
    if (!crew || crew.stopped || crew.inactive.includes(playerId)) return state;
    const fair = fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: state.phaseStartedAt });

    if (input.type === "alarm") {
      const ev = crew.event;
      if (!ev || ev.kind !== "alarm" || ev.pressed.includes(playerId) || fair > ev.until) return state;
      const updated: CrewState = { ...crew, event: { ...ev, pressed: [...ev.pressed, playerId] } };
      // se hanno premuto tutti si chiude subito (superato)
      return activeMembers(updated).every((m) => updated.event!.pressed.includes(m))
        ? replaceCrew(state, { ...updated, event: null, progress: updated.progress + 1, lastDone: { text: "Allarme generale: superato!", at: meta.receivedAt } })
        : replaceCrew(state, updated);
    }

    const control = crew.controls.find((c) => c.id === input.control && c.owner === playerId);
    if (!control) return state;
    let value: number;
    if (input.type === "press") {
      if (control.kind !== "button") return state;
      value = control.value + 1;
    } else {
      if (control.kind === "button" || input.value >= valueCount(control) || input.value === control.value) return state;
      value = input.value;
    }
    const moved: CrewState = { ...crew, controls: crew.controls.map((c) => (c === control ? { ...c, value } : c)) };
    const updated = { ...control, value };
    // l'ordine di qualcuno che chiedeva questo valore, se è ancora in tempo (ora equa), è eseguito
    const order = Object.values(crew.orders).find((o) => o.controlId === control.id && o.target === value);
    if (order && fair <= order.deadline) return executeOrder(replaceCrew(state, moved), moved, order, updated, meta.receivedAt);
    return replaceCrew(state, moved);
  },

  onTick(state, now) {
    if (state.pausedRemainingMs !== null) return state;
    if (state.phase === "jump" && state.phaseEndsAt !== null && now >= state.phaseEndsAt) return startSector(state, state.sector + 1, now);
    if (state.phase !== "sector" || state.phaseEndsAt === null) return state;
    if (now >= state.phaseEndsAt || allStopped(state)) return endSector(state, now);

    let s = state;
    // fine degli eventi
    for (const c of state.crews) if (c.event && now >= c.event.until) s = resolveEvent(s, c.id, now);
    // inizio dell'evento del settore
    if (s.sectorEvent && !s.sectorEvent.fired && now >= s.sectorEvent.at) s = fireEvent(s, now);
    // ordini scaduti (con la tolleranza)
    for (const c of s.crews) {
      for (const order of Object.values(c.orders)) {
        if (now < order.deadline + GRACE_MS) continue;
        const cur = s.crews.find((x) => x.id === c.id)!;
        if (cur.orders[order.holder]?.id !== order.id) continue;
        const hit = damage(s, cur);
        s = hit.stopped ? replaceCrew(s, { ...hit, orders: {} }) : reissue(replaceCrew(s, hit), hit, order.holder, now);
      }
    }
    return s;
  },

  onHostCommand(state, command, now) {
    const timed = state.phase === "sector" || state.phase === "jump";
    switch (command.type) {
      case "launch":
        return state.phase === "ready" ? startSector(state, 1, now) : state;
      case "pause":
        if (!timed || state.pausedRemainingMs !== null) return state;
        return { ...state, pausedRemainingMs: Math.max(0, (state.phaseEndsAt ?? now) - now), phaseEndsAt: null, pausedAt: now };
      case "resume": {
        if (state.pausedRemainingMs === null || state.pausedAt === null) return state;
        const shifted = shiftTimes(state, now - state.pausedAt);
        return { ...shifted, phaseEndsAt: now + state.pausedRemainingMs, pausedRemainingMs: null, pausedAt: null };
      }
      case "skip-sector":
        return state.phase === "sector" ? endSector(state, now) : state;
      case "repair": {
        if (state.phase === "final" || state.phase === "done" || state.phase === "ready") return state;
        let s = state;
        for (const c of state.crews.filter((x) => (command.crewId === undefined || x.id === command.crewId) && x.hull < 50)) {
          const fixed: CrewState = { ...c, hull: 50, stopped: false };
          s = state.phase === "sector" ? issueAllInto(replaceCrew(s, fixed), fixed, now) : replaceCrew(s, fixed);
        }
        return s;
      }
      case "reshuffle": {
        if ((state.phase !== "sector" && state.phase !== "ready") || state.pausedRemainingMs !== null) return state;
        const crews = state.crews.map((c) => {
          if (command.playerId === undefined || !c.members.includes(command.playerId)) return c;
          return { ...c, inactive: c.inactive.includes(command.playerId) ? c.inactive.filter((p) => p !== command.playerId) : [...c.inactive, command.playerId] };
        });
        const base: S = { ...state, crews, reshuffles: state.reshuffles + 1 };
        // senza decollo i pannelli non ci sono ancora: bastano i telefoni segnalati; in settore si rifanno subito
        return state.phase === "ready" ? base : { ...startSector(base, base.sector, now), phaseEndsAt: state.phaseEndsAt ?? now + state.cfg.sectorSeconds * 1000, phaseStartedAt: state.phaseStartedAt };
      }
      case "next":
        return state.phase === "final" ? { ...state, phase: "done", phaseStartedAt: now, phaseEndsAt: null } : state;
      case "end":
        if (state.phase === "final" || state.phase === "done") return state;
        return { ...resolveEvents(state, now), sectorEvent: null, crews: state.crews.map((c) => ({ ...c, orders: {} })), phase: "final", phaseStartedAt: now, phaseEndsAt: null, pausedRemainingMs: null, pausedAt: null };
    }
  },

  isFinished: (state) => state.phase === "done",

  scores(state): ScoreDelta[] {
    return Object.entries(playerTotals(state)).filter(([, points]) => points !== 0).map(([playerId, points]) => ({ playerId, teamId: null, points, reason: "Plancia di Comando" }));
  },
  result: (state) => rankByPoints(playerTotals(state), state.players),

  screenView(state) {
    return { ...publicBase(state), crews: state.crews.map((c) => crewPublic(state, c)) };
  },

  viewFor(state, playerId) {
    const base = publicBase(state);
    const crew = crewOf(state, playerId);
    if (!state.players.includes(playerId) || !crew) return { ...base, me: null };
    const victim = !!crew.event && crew.event.kind === "blackout" && crew.event.victims.includes(playerId);
    const mine = crew.controls.filter((c) => c.owner === playerId);
    const order = crew.orders[playerId];
    return {
      ...base,
      crew: { id: crew.id, name: crew.name, color: crew.color, hull: crew.hull, stopped: crew.stopped, event: crew.event ? { kind: crew.event.kind, until: crew.event.until } : null },
      me: {
        id: playerId,
        inactive: crew.inactive.includes(playerId),
        // Solo i propri comandi (con il blackout, solo le iniziali dei nomi) e solo il proprio ordine.
        controls: mine.map((c) => ({ id: c.id, name: victim ? initials(c.name) : c.name, kind: c.kind, options: c.options, value: c.value })),
        order: order ? { text: order.text, issuedAt: order.issuedAt, deadline: order.deadline } : null,
        alarmPressed: !!crew.event && crew.event.kind === "alarm" && crew.event.pressed.includes(playerId),
        ...((state.phase === "final" || state.phase === "done") && (() => {
          const r = standings(state).find((x) => x.id === crew.id)!;
          return { rank: r.rank + 1, points: r.points };
        })()),
      },
    };
  },

  hostView(state) {
    const timed = state.phase === "sector" || state.phase === "jump";
    const paused = state.pausedRemainingMs !== null;
    return {
      info: {
        ...publicBase(state),
        crews: state.crews.map((c) => ({
          ...crewPublic(state, c),
          memberList: c.members.map((id) => ({ id, nickname: nick(state, id), inactive: c.inactive.includes(id), order: c.orders[id]?.text ?? null, controls: c.controls.filter((x) => x.owner === id).length })),
        })),
        sectorEvent: state.sectorEvent,
      },
      actions: [
        { id: "launch", label: "Decollo", enabled: state.phase === "ready" },
        { id: "next", label: "Avanti", enabled: state.phase === "final" },
        paused ? { id: "resume", label: "Riprendi", enabled: true } : { id: "pause", label: "Pausa", enabled: timed },
        { id: "repair", label: "Ripara gli scafi", enabled: state.phase === "sector" || state.phase === "jump", danger: true },
        { id: "reshuffle", label: "Ridistribuisci i pannelli", enabled: state.phase === "sector" || state.phase === "ready", danger: true },
        { id: "skip-sector", label: "Salta il settore", enabled: state.phase === "sector", danger: true },
        { id: "end", label: "Termina il round", enabled: state.phase !== "final" && state.phase !== "done", danger: true },
      ],
    };
  },
};

/** Dopo una riparazione in settore: un ordine a ogni membro che non ne ha. */
function issueAllInto(s: S, crew: CrewState, now: number): S {
  const issued = issueAll(crew, s, s.sector, now, s.nextOrderId);
  return { ...replaceCrew(s, issued.crew), nextOrderId: issued.nextOrderId };
}
