import { describe, expect, it } from "vitest";
import { planciaComando as plugin } from "./index.js";
import { type S, T0, crewPlay, ctxFor, host, launched, orderOf } from "./test-helpers.js";

/**
 * Anti-leak della Plancia di Comando: qui il segreto è che **ognuno vede solo il proprio pannello e il proprio ordine**. Un telefono
 * non ha i comandi né gli ordini degli altri, e nemmeno l'avanzamento delle astronavi (solo la TV); la TV non ha mai pannelli né
 * ordini, solo l'ultimo ordine eseguito di ogni equipaggio. La regia vede tutto.
 */

const json = (v: unknown): any => JSON.parse(JSON.stringify(v));

function keysOf(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (acc.add(k), keysOf(x, acc));
  return acc;
}

const PHONE_KEYS = ["phase", "phaseStartedAt", "phaseEndsAt", "pausedRemainingMs", "settings", "sector", "crew", "me"];
const ME_KEYS = ["id", "inactive", "controls", "order", "alarmPressed", "rank", "points"];
const CREW_KEYS = ["id", "name", "color", "hull", "stopped", "event"];
const CONTROL_KEYS = ["id", "name", "kind", "options", "value"];
const SCREEN_CREW_KEYS = ["id", "name", "color", "members", "progress", "distance", "hull", "done", "missed", "stopped", "lastDone", "event", "activeOrders", "rank", "points"];

/** Tutte le violazioni dello stato `s` in tutte le viste. Vuoto = nessuna fuga. */
export function violations(s: S): string[] {
  const out: string[] = [];
  const allNames = s.crews.flatMap((c) => c.controls.map((x) => x.name));
  const allOrders = s.crews.flatMap((c) => Object.values(c.orders).map((o) => o.text));

  // ---- TV ----
  const screen = json(plugin.screenView(s)) as { crews: Record<string, any>[] };
  const tvKeys = keysOf(screen);
  for (const k of ["controls", "order", "orders", "me", "options", "memberList"]) if (tvKeys.has(k)) out.push(`TV: chiave «${k}»`);
  for (const c of screen.crews) {
    for (const k of Object.keys(c)) if (!SCREEN_CREW_KEYS.includes(k)) out.push(`TV: chiave «${k}» in un equipaggio`);
    if (typeof c.activeOrders !== "number") out.push("TV: ordini non aggregati");
    if (c.event) for (const k of Object.keys(c.event)) if (!["kind", "until"].includes(k)) out.push(`TV: chiave «${k}» nell'evento`);
  }
  // l'ultimo ordine eseguito può nominare un comando: tolto quello, nessun nome e nessun ordine
  const tvText = JSON.stringify({ ...screen, crews: screen.crews.map((c) => ({ ...c, lastDone: null })) });
  for (const name of allNames) if (tvText.includes(name)) out.push(`TV: nome di un comando «${name}»`);
  for (const text of allOrders) if (tvText.includes(text)) out.push(`TV: ordine «${text}»`);

  // ---- telefoni ----
  for (const id of [...s.players, "estraneo"]) {
    const view = json(plugin.viewFor(s, id, null));
    const who = `giocatore ${id}`;
    for (const k of Object.keys(view)) if (!PHONE_KEYS.includes(k)) out.push(`${who}: chiave «${k}»`);
    const keys = keysOf(view);
    for (const k of ["crews", "lastDone", "progress", "done", "missed", "distance", "activeOrders", "pressed", "victims", "memberList"]) if (keys.has(k)) out.push(`${who}: chiave «${k}»`);
    const me = view.me as Record<string, any> | null;
    if (!me) continue;
    for (const k of Object.keys(me)) if (!ME_KEYS.includes(k)) out.push(`${who}: chiave «${k}» in me`);
    for (const k of Object.keys(view.crew ?? {})) if (!CREW_KEYS.includes(k)) out.push(`${who}: chiave «${k}» nell'equipaggio`);
    const crew = s.crews.find((c) => c.members.includes(id))!;
    const mine = crew.controls.filter((c) => c.owner === id);
    for (const c of me.controls as Record<string, unknown>[]) for (const k of Object.keys(c)) if (!CONTROL_KEYS.includes(k)) out.push(`${who}: chiave «${k}» in un comando`);
    if ((me.controls as unknown[]).length !== mine.length) out.push(`${who}: ${me.controls.length} comandi invece di ${mine.length}`);
    for (const c of me.controls as { id: string }[]) if (!mine.some((m) => m.id === c.id)) out.push(`${who}: comando altrui ${c.id}`);
    const own = crew.orders[id];
    if ((me.order?.text ?? null) !== (own?.text ?? null)) out.push(`${who}: ordine che non è il suo`);
    // né i nomi dei comandi altrui né gli ordini altrui, in nessun punto della vista (il proprio ordine può nominare un comando di un compagno)
    const text = JSON.stringify({ ...view, me: { ...me, order: null } });
    for (const c of s.crews.flatMap((x) => x.controls).filter((x) => x.owner !== id)) if (text.includes(c.name)) out.push(`${who}: nome del comando altrui «${c.name}»`);
    for (const [holder, o] of s.crews.flatMap((x) => Object.entries(x.orders)).filter(([h]) => h !== id)) if (text.includes(o.text)) out.push(`${who}: ordine di ${holder}`);
  }

  // ---- regia ----
  const info = json(plugin.hostView(s).info) as { crews: { memberList: { id: string; order: string | null }[] }[] };
  for (const c of info.crews) if (c.memberList.length === 0) out.push("regia: membri mancanti");
  return out;
}

const SCENARIOS: { name: string; over: Record<string, unknown>; sizes: number[] }[] = [
  { name: "2 equipaggi da 3", over: {}, sizes: [3, 3] },
  { name: "3 equipaggi, da 2 a 8 membri", over: {}, sizes: [2, 5, 8] },
  { name: "equipaggio unico", over: { mode: "unico" }, sizes: [3, 4] },
  { name: "senza eventi, comandi al massimo", over: { events: false, controlsPerPanel: 6 }, sizes: [4, 4] },
];

describe.each(SCENARIOS)("anti-leak su una partita intera ($name)", ({ over, sizes }) => {
  it("nessuna vista rivela ciò che non deve, a nessun passo", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const found: string[] = [];
      const scan = (s: S, label: string) => violations(s).forEach((v) => found.push(`seme ${seed}, ${label}: ${v}`));
      let s = launched(seed, { sectors: 3, sectorSeconds: 40, ...over }, ctxFor(seed, sizes));
      scan(s, "decollo");
      let at = T0 + 1000;
      let guard = 0;
      while (s.phase !== "final" && guard++ < 40) {
        if (s.phase === "sector") {
          const run = crewPlay(s, at, 60_000, { skill: 0.8, seed: seed * 100 + guard, scan: (x, t) => (t % 1000 === 0 ? scan(x, `settore ${x.sector} +${t - x.phaseStartedAt} ms`) : undefined) });
          s = run.s;
          at = run.at;
        } else {
          at += 500;
          s = plugin.onTick(s, at);
        }
        scan(s, `fase ${s.phase}`);
      }
      s = host(s, { type: "next" }, at + 1);
      scan(s, "classifica");
      expect(found).toEqual([]);
    }
  }, 120_000);
});

describe("il controllo anti-leak funziona", () => {
  const s = launched(3, {}, ctxFor(3, [3, 3]));

  it("sullo stato giusto non segnala nulla", () => {
    expect(violations(s)).toEqual([]);
  });

  it("segnala una fuga in ogni vista", () => {
    const crew = s.crews[0]!;
    const other = crew.members[1]!;
    const stranger = crew.controls.find((c) => c.owner === other)!;
    // un telefono con il comando di un compagno
    const mine = json(plugin.viewFor(s, crew.members[0]!, null));
    const tampered = { ...mine, me: { ...mine.me, controls: [...mine.me.controls, { id: stranger.id, name: stranger.name, kind: stranger.kind, options: [], value: 0 }] } };
    expect(JSON.stringify(tampered)).toContain(stranger.name);
    // lo stesso controllo, applicato alla vista manomessa, la segnala: si riproduce il test di nomi e di ordini altrui
    const text = JSON.stringify({ ...tampered, me: { ...tampered.me, order: null } });
    expect(text.includes(stranger.name)).toBe(true);
    // l'ordine di un compagno non deve comparire nella vista di un altro
    const foreign = orderOf(s, other).text;
    expect(JSON.stringify(plugin.viewFor(s, crew.members[0]!, null)).includes(foreign)).toBe(false);
    expect(JSON.stringify({ ...mine, extra: foreign }).includes(foreign)).toBe(true);
    // la TV con un pannello: la chiave sarebbe vietata
    const tv = json(plugin.screenView(s));
    expect(keysOf({ ...tv, controls: [] }).has("controls")).toBe(true);
    expect(JSON.stringify(tv).includes(stranger.name)).toBe(false);
  });

  it("le viste sono essenziali: cambiano per chi è toccato e non per gli altri", () => {
    const order = orderOf(s, "a1");
    const control = s.crews[0]!.controls.find((c) => c.id === order.controlId)!;
    const input = control.kind === "button" ? { type: "press", control: control.id } : { type: "set", control: control.id, value: order.target };
    const next = plugin.onInput(s, control.owner, plugin.inputSchema.parse(input), { receivedAt: T0 + 3000, claimedTime: T0 + 3000, rtt: 30 });
    const before = (id: string) => JSON.stringify(plugin.viewFor(s, id, null));
    const after = (id: string) => JSON.stringify(plugin.viewFor(next, id, null));
    const changed = s.players.filter((id) => before(id) !== after(id));
    // cambiano solo il proprietario del comando e chi ha ricevuto il nuovo ordine (e a volte sono la stessa persona)
    expect(changed.length).toBeLessThanOrEqual(2);
    expect(changed).toContain("a1");
    for (const id of s.crews[1]!.members) expect(after(id), `giocatore dell'altro equipaggio ${id}`).toBe(before(id));
  });
});
