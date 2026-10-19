import { describe, expect, it } from "vitest";
import { MODULES, buildManual } from "./bomb.js";
import { artificieri as plugin } from "./index.js";
import type { ManualBlock } from "./modules/types.js";
import { type S, T0, ctxFor, only, host, input, midSecondWithDigit, roster, solutionOf, solveModule, start, strikeAt, timeFor } from "./test-helpers.js";

/**
 * Anti-leak di Artificieri: a ogni passo di una partita le viste di TV, artificiere, esperti, scommettitori ed
 * estranei non devono contenere ciò che non devono sapere (bordo, dati dei moduli, regole, soluzioni, pagine degli
 * altri esperti, scommesse altrui). La regia vede tutto.
 */

const json = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

function keysOf(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (acc.add(k), keysOf(x, acc));
  return acc;
}

/** Frammenti di testo che identificano una pagina del manuale: frasi lunghe e colonne di simboli. */
function fingerprints(blocks: ManualBlock[]): string[] {
  return blocks.flatMap((b) => {
    if (b.type === "p") return b.text.length >= 12 ? [b.text] : [];
    if (b.type === "list") return b.items;
    if (b.type === "symbols") return b.columns.map((c) => JSON.stringify(c));
    if (b.type === "mazes") return b.mazes.map((m) => JSON.stringify(m.cells));
    if (b.type === "words") return [JSON.stringify(b.words)];
    if (b.type === "table") return b.rows.map((r) => JSON.stringify(r));
    return [];
  });
}

/** Chiavi vietate a tutti tranne a chi è indicato. */
const SECRET_KEYS = ["data", "edgework", "rules", "solution", "lastStrike", "pages", "bets", "controls", "manual", "index", "bomb"];

const CONTROL_KEYS = ["id", "kind", "solved", "wires", "cut", "holding", "symbols", "pressed"];
const HISTORY_KEYS = ["turn", "teamId", "outcome", "reason", "solved", "moduleCount", "strikes", "secondsLeft", "points", "betWinners", "betsDefused", "betsExploded"];
const STATUS_KEYS = ["strikes", "maxStrikes", "moduleCount", "solved", "speed", "clock", "pausedRemainingMs", "outcome"];

interface Secrets {
  serial: string;
  /** Per pagina: id, testi che la identificano. */
  pages: { id: number; texts: string[] }[];
  solutions: string[];
}

function secretsOf(s: S): Secrets | null {
  const b = s.bomb;
  if (!b) return null;
  return {
    serial: b.edgework.serial,
    pages: buildManual(b.rules).map((p) => ({ id: p.id, texts: fingerprints(p.blocks) })),
    solutions: b.modules.filter((m) => !m.solved).map((m) => solutionOf(s, m).text),
  };
}

function bannedKeys(view: unknown, banned: string[], who: string): string[] {
  const keys = keysOf(view);
  return banned.filter((k) => keys.has(k)).map((k) => `${who}: chiave «${k}»`);
}

function leakedTexts(view: unknown, texts: string[], who: string, what: string): string[] {
  const text = JSON.stringify(view);
  return texts.filter((t) => text.includes(JSON.stringify(t).slice(1, -1)) || text.includes(t)).map((t) => `${who}: ${what} «${t.slice(0, 40)}»`);
}

function checkScreen(s: S, view: unknown, sec: Secrets | null): string[] {
  const v = json(view) as Record<string, unknown>;
  const out = [...bannedKeys(v, ["rules", "solution", "lastStrike", "pages", "bets", "controls", "manual", "index", "me"], "TV")];
  const bomb = v.bomb as { modules: { kind: string; data: Record<string, unknown>; progress: { holding?: boolean } }[] } | null;
  if (s.phase !== "defuse" && s.phase !== "outcome" && bomb) out.push("TV: bomba prima di «Inizia» o dopo l'esito");
  for (const m of bomb?.modules ?? []) if (m.kind === "button" && "strip" in m.data && !m.progress.holding && s.phase !== "outcome") out.push("TV: striscia del pulsante non tenuto");
  if (sec) {
    out.push(...leakedTexts(v, sec.pages.flatMap((p) => p.texts), "TV", "pagina del manuale"));
    out.push(...leakedTexts(v, sec.solutions, "TV", "soluzione"));
  }
  return out;
}

function checkDefuser(s: S, view: unknown, sec: Secrets | null, who: string): string[] {
  const v = json(view) as { me: { controls?: Record<string, unknown>[] } & Record<string, unknown> };
  const out = bannedKeys(v, ["data", "edgework", "rules", "solution", "lastStrike", "pages", "bets", "manual", "index", "bomb"], who);
  if (v.me.controls && s.phase !== "defuse") out.push(`${who}: comandi fuori dal disinnesco`);
  for (const c of v.me.controls ?? []) for (const k of Object.keys(c)) if (!CONTROL_KEYS.includes(k)) out.push(`${who}: comando con chiave «${k}»`);
  if (sec) {
    out.push(...leakedTexts(v, [sec.serial], who, "numero di serie"));
    out.push(...leakedTexts(v, sec.pages.flatMap((p) => p.texts), who, "pagina del manuale"));
    out.push(...leakedTexts(v, sec.solutions, who, "soluzione"));
  }
  return out;
}

function checkExpert(s: S, view: unknown, sec: Secrets | null, who: string, own: number[]): string[] {
  const v = json(view) as { me: { manual: { id: number; blocks: ManualBlock[] }[]; index: Record<string, unknown>[] } };
  const out = bannedKeys(v, ["data", "edgework", "rules", "solution", "lastStrike", "pages", "bets", "controls", "bomb"], who);
  if (s.phase !== "briefing" && s.phase !== "defuse" && v.me.manual.length > 0) out.push(`${who}: manuale fuori da briefing e disinnesco`);
  for (const p of v.me.manual) if (!own.includes(p.id)) out.push(`${who}: pagina ${p.id} non sua`);
  for (const i of v.me.index) for (const k of Object.keys(i)) if (!["id", "title", "owners", "mine"].includes(k)) out.push(`${who}: indice con chiave «${k}»`);
  if (sec) {
    out.push(...leakedTexts(v, [sec.serial], who, "numero di serie"));
    out.push(...leakedTexts(v, sec.solutions, who, "soluzione"));
    // le frasi che compaiono anche nelle proprie pagine (come «Altrimenti: …») non identificano una pagina altrui
    const ownBlob = JSON.stringify(sec.pages.filter((p) => own.includes(p.id)).map((p) => p.texts));
    for (const p of sec.pages.filter((p) => !own.includes(p.id))) out.push(...leakedTexts(v, p.texts.filter((x) => !ownBlob.includes(JSON.stringify(x).slice(1, -1))), who, `pagina ${p.id}`));
  }
  return out;
}

function checkBettor(s: S, view: unknown, sec: Secrets | null, who: string, ownBet: string | null): string[] {
  const v = json(view) as { me: { myBet?: string | null } | null; turn: { betsPlaced?: unknown } | null };
  const out = bannedKeys(v, SECRET_KEYS, who);
  if (v.me && v.me.myBet !== undefined && v.me.myBet !== ownBet) out.push(`${who}: scommessa che non è la sua`);
  if (v.turn && typeof v.turn.betsPlaced !== "number") out.push(`${who}: scommesse non aggregate`);
  if (sec) {
    out.push(...leakedTexts(v, [sec.serial], who, "numero di serie"));
    out.push(...leakedTexts(v, sec.pages.flatMap((p) => p.texts), who, "pagina del manuale"));
    out.push(...leakedTexts(v, sec.solutions, who, "soluzione"));
  }
  return out;
}

/** Controlli comuni a ogni vista pubblica: cronologia e stato della bomba senza dettagli. */
function checkPublicShape(view: unknown, who: string): string[] {
  const v = json(view) as { history: Record<string, unknown>[]; status: Record<string, unknown> | null };
  const out: string[] = [];
  for (const e of v.history) for (const k of Object.keys(e)) if (!HISTORY_KEYS.includes(k)) out.push(`${who}: cronologia con chiave «${k}»`);
  for (const k of Object.keys(v.status ?? {})) if (!STATUS_KEYS.includes(k)) out.push(`${who}: stato con chiave «${k}»`);
  return out;
}

/** Tutte le violazioni dello stato `s`, per tutte le viste. Vuoto = nessuna fuga. */
export function violations(s: S): string[] {
  const sec = secretsOf(s);
  const out: string[] = [];
  const screen = plugin.screenView(s);
  out.push(...checkScreen(s, screen, sec), ...checkPublicShape(screen, "TV"));
  for (const id of [...s.players, "estraneo"]) {
    const view = plugin.viewFor(s, id, null);
    out.push(...checkPublicShape(view, id));
    const b = s.bomb;
    const inTurn = !!b && s.phase !== "final" && s.phase !== "done" && s.teams.find((t) => t.id === b.teamId)!.members.includes(id);
    if (inTurn && id === b!.defuserId) out.push(...checkDefuser(s, view, sec, `artificiere ${id}`));
    else if (inTurn) out.push(...checkExpert(s, view, sec, `esperto ${id}`, b!.pages[id] ?? []));
    else out.push(...checkBettor(s, view, sec, `scommettitore ${id}`, s.bets[id] ?? null));
  }
  // la regia vede tutto: soluzioni comprese (e le scommesse), quindi qui non si vieta nulla ma si controlla che non manchino
  const hostInfo = json(plugin.hostView(s).info) as { bomb: { modules: { solution: string | null; solved: boolean }[] } | null };
  if (s.bomb && hostInfo.bomb?.modules.some((m) => !m.solved && !m.solution)) out.push("regia: soluzione mancante");
  return out;
}

/** Gioca un turno intero scorrendo tutte le fasi e controllando le viste a ogni passo. */
function playTurn(s0: S, at: number, finish: "solve" | "explode", scan: (s: S, label: string) => void): { s: S; at: number } {
  let s = s0;
  scan(s, "inizio turno");
  if (s.phase === "bet") {
    const bettors = s.players.filter((id) => !s.teams.find((t) => t.id === s.bomb!.teamId)!.members.includes(id));
    s = input(s, bettors[0]!, { type: "bet", outcome: "defused" }, (at += 100));
    scan(s, "una scommessa");
    s = input(s, bettors[1]!, { type: "bet", outcome: "exploded" }, (at += 100));
    scan(s, "due scommesse");
    s = plugin.onTick(s, s.phaseEndsAt! + 1);
    at = s.phaseStartedAt;
  }
  scan(s, "briefing");
  const defuser = s.bomb!.defuserId;
  s = input(s, defuser, { type: "start" }, (at += 1000));
  scan(s, "disinnesco");
  s = input(s, defuser, { type: "select", module: 1 }, (at += 500));
  scan(s, "modulo scelto");
  // un pulsante da tenere premuto: la striscia compare sulla TV solo ora
  const hold = s.bomb!.modules.find((m) => m.kind === "button" && solutionOf(s, m).actions[0]!.type === "hold");
  if (hold) {
    s = input(s, defuser, { type: "hold", module: hold.id }, (at += 500));
    scan(s, "pulsante tenuto");
    const wrong = timeFor(s, midSecondWithDigit((solutionOf(s, hold).releaseDigit! + 3) % 10, 200_000));
    s = input(s, defuser, { type: "release", module: hold.id }, wrong);
    scan(s, "rilascio sbagliato");
    at = wrong;
  }
  s = strikeAt(s, (at += 500));
  scan(s, "un errore");
  s = host(s, "pause", (at += 500));
  scan(s, "pausa");
  s = host(s, "resume", (at += 500));
  if (finish === "solve") {
    s = host(s, "strike-undo", (at += 500));
    scan(s, "errore annullato");
    for (const m of s.bomb!.modules) {
      s = solveModule(s, s.bomb!.modules[m.id]!, (at += 500));
      scan(s, `modulo ${m.id} risolto`);
      if (s.phase === "outcome") break;
    }
  } else {
    s = host(s, "explode", (at += 500));
  }
  expect(s.phase).toBe("outcome");
  scan(s, "esito");
  return { s: host(s, "next", (at += 500)), at };
}

const SCENARIOS: { name: string; over: Record<string, unknown> }[] = [
  { name: "predefinita", over: {} },
  { name: "stesso manuale", over: { sameManual: true } },
  { name: "difficile, 6 moduli, 2 bombe", over: { difficulty: "difficile", modules: 6, bombsPerTeam: 2 } },
  { name: "solo fili e simboli", over: { enabledModules: only("wires", "symbols") } },
  { name: "tutti i tipi, parola compresa", over: { modules: 6, enabledModules: only("wires", "button", "symbols", "colors", "maze", "word") } },
];

describe.each(SCENARIOS)("anti-leak su una partita intera ($name)", ({ over }) => {
  it("nessuna vista rivela ciò che non deve, a nessun passo", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const found: string[] = [];
      const scan = (s: S, label: string) => violations(s).forEach((v) => found.push(`seme ${seed}, ${label}: ${v}`));
      let s = start(seed, over, ctxFor(seed, { players: [...roster(3, "ta", "a"), ...roster(4, "tb", "b"), ...roster(1, null, "s")] }));
      let at = T0;
      let turns = 0;
      while (s.phase !== "final") {
        ({ s, at } = playTurn(s, at, turns % 2 === 0 ? "solve" : "explode", scan));
        turns++;
      }
      scan(s, "classifica");
      s = host(s, "next", at + 1000);
      scan(s, "fine");
      expect(found).toEqual([]);
      expect(turns).toBe(over.bombsPerTeam ? 4 : 2);
    }
  });
});

describe("il controllo anti-leak funziona", () => {
  const s = (() => {
    let cur = start(3, { betSeconds: 0 });
    cur = input(cur, cur.bomb!.defuserId, { type: "start" }, T0 + 1000);
    return cur;
  })();

  it("sullo stato giusto non segnala nulla", () => {
    expect(violations(s)).toEqual([]);
  });

  it("segnala una fuga in ogni vista", () => {
    const b = s.bomb!;
    const expert = Object.keys(b.pages)[0]!;
    const other = Object.keys(b.pages).find((id) => id !== expert)!;
    const sec = secretsOf(s)!;
    const leaky = (view: unknown, extra: Record<string, unknown>) => ({ ...(view as object), ...extra });
    const tv = plugin.screenView(s);
    expect(checkScreen(s, leaky(tv, { rules: b.rules }), sec).length).toBeGreaterThan(0);
    expect(checkScreen(s, leaky(tv, { text: buildManual(b.rules)[1]!.blocks }), sec).length).toBeGreaterThan(0);
    const def = plugin.viewFor(s, b.defuserId, null) as { me: object };
    expect(checkDefuser(s, { ...def, me: { ...def.me, edgework: b.edgework } }, sec, "x").length).toBeGreaterThan(0);
    expect(checkDefuser(s, { ...def, note: b.edgework.serial }, sec, "x").length).toBeGreaterThan(0);
    const ex = plugin.viewFor(s, expert, null) as { me: { manual: unknown[] } };
    expect(checkExpert(s, ex, sec, "x", b.pages[expert]!)).toEqual([]);
    // una pagina che non è sua
    const foreign = plugin.viewFor(s, other, null);
    expect(checkExpert(s, foreign, sec, "x", b.pages[expert]!).length).toBeGreaterThan(0);
    expect(checkExpert(s, { ...ex, me: { ...ex.me, data: b.modules[0]!.data } }, sec, "x", b.pages[expert]!).length).toBeGreaterThan(0);
    const bettor = plugin.viewFor(s, "b1", null) as { me: object };
    expect(checkBettor(s, { ...bettor, me: { ...bettor.me, myBet: "exploded" } }, sec, "x", null).length).toBeGreaterThan(0);
    expect(checkBettor(s, leaky(bettor, { solution: MODULES.wires }), sec, "x", null).length).toBeGreaterThan(0);
  });
});

describe("regole di visibilità per fase", () => {
  it("prima di «Inizia» la TV non ha la bomba e gli esperti non hanno il manuale finché non c'è il briefing", () => {
    const bet = start(4);
    expect(json(plugin.screenView(bet))).toMatchObject({ bomb: null });
    const expert = Object.keys(bet.bomb!.pages)[0]!;
    expect((json(plugin.viewFor(bet, expert, null)) as { me: { manual: unknown[]; index: unknown[] } }).me).toMatchObject({ manual: [], index: [] });
    const brief = plugin.onTick(bet, bet.phaseEndsAt! + 1);
    expect((json(plugin.viewFor(brief, expert, null)) as { me: { manual: unknown[] } }).me.manual.length).toBeGreaterThan(0);
    expect(json(plugin.screenView(brief))).toMatchObject({ bomb: null });
    const defuserBrief = json(plugin.viewFor(brief, brief.bomb!.defuserId, null)) as { me: object };
    expect(defuserBrief.me).toMatchObject({ canStart: true });
    expect(defuserBrief.me).not.toHaveProperty("controls");
  });

  it("l'artificiere riceve solo comandi: del pulsante non vede né colore né scritta, dei fili non il colore", () => {
    let s = start(4, { betSeconds: 0, modules: 6 });
    s = input(s, s.bomb!.defuserId, { type: "start" }, T0 + 1000);
    const view = json(plugin.viewFor(s, s.bomb!.defuserId, null)) as { me: { controls: Record<string, unknown>[] } };
    expect(view.me.controls).toHaveLength(6);
    const text = JSON.stringify(view);
    for (const m of s.bomb!.modules) {
      if (m.kind === "wires") expect(text).not.toContain(JSON.stringify((m.data as { wires: string[] }).wires));
      if (m.kind === "button") {
        const d = m.data as { color: string; label: string; strip: string };
        expect(text).not.toContain(d.label);
      }
    }
  });

  it("a fine partita nessuna vista ha più bomba né comandi", () => {
    let s = start(4, { betSeconds: 0 });
    s = host(host(s, "skip-team", T0 + 1), "skip-team", T0 + 2);
    expect(s.phase).toBe("final");
    for (const id of [...s.players, "estraneo"]) expect((json(plugin.viewFor(s, id, null)) as { me: unknown }).me).toBeNull();
    expect(json(plugin.screenView(s))).toMatchObject({ bomb: null });
  });
});
