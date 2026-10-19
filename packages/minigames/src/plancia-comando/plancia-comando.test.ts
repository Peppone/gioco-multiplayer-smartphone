import { describe, expect, it } from "vitest";
import { GRACE_MS } from "../util.js";
import { ALARM_SECONDS, BLACKOUT_SECONDS, JUMP_SECONDS, controlsFor, orderSecondsFor, planciaComando as plugin } from "./index.js";
import { type S, T0, cfg, controlOf, crewOf, crewPlay, ctxFor, execute, host, input, inputFor, launched, orderOf, start } from "./test-helpers.js";

const NOW = T0 + 1000;

describe("equipaggi e decollo", () => {
  it("gli equipaggi sono i team della serata (per nome), prima del decollo non ci sono pannelli né ordini", () => {
    const s = start(3);
    expect(s.crews.map((c) => c.id)).toEqual(["ta", "tb"]);
    expect(s.phase).toBe("ready");
    expect(s.sector).toBe(0);
    expect(s.crews.every((c) => c.controls.length === 0 && Object.keys(c.orders).length === 0)).toBe(true);
    expect(plugin.onTick(s, T0 + 999_999)).toBe(s);
    expect(plugin.scores(s)).toEqual([]);
  });

  it("al decollo ogni membro ha i suoi comandi e un ordine, e ogni comando ha un solo proprietario", () => {
    const s = launched(4, {}, ctxFor(4, [3, 5]));
    expect(s.phase).toBe("sector");
    expect(s.sector).toBe(1);
    expect(s.phaseEndsAt).toBe(NOW + 60_000);
    for (const c of s.crews) {
      expect(c.controls).toHaveLength(c.members.length * 4);
      for (const m of c.members) {
        expect(c.controls.filter((x) => x.owner === m)).toHaveLength(4);
        const o = c.orders[m]!;
        expect(o.holder).toBe(m);
        expect(o.deadline).toBe(NOW + 12_000);
      }
      expect(new Set(Object.values(c.orders).map((o) => o.controlId)).size, "un solo ordine per comando").toBe(c.members.length);
    }
    // nomi diversi anche tra equipaggi
    const names = s.crews.flatMap((c) => c.controls.map((x) => x.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("senza team: equipaggi da 4–6; in «unico» tutti insieme; è deterministico", () => {
    const players = (n: number) => ({ seed: 5, teams: [], players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}`, teamId: null })) });
    expect(start(5, {}, players(5)).crews.map((c) => c.members.length)).toEqual([5]);
    expect(start(5, {}, players(7)).crews.map((c) => c.members.length).sort()).toEqual([3, 4]);
    expect(start(5, {}, players(30)).crews.map((c) => c.members.length).sort()).toEqual([6, 6, 6, 6, 6]);
    const unico = start(5, { mode: "unico" }, ctxFor(5, [3, 4]));
    expect(unico.crews).toHaveLength(1);
    expect(unico.crews[0]!.members).toHaveLength(7);
    expect(JSON.stringify(start(8))).toBe(JSON.stringify(start(8)));
    expect(JSON.stringify(start(8))).not.toBe(JSON.stringify(start(9)));
  });

  it("buildConfig: da 2 a 8 membri per equipaggio in «squadre», minimo ordine che non supera il primo", () => {
    const team = (id: string, n: number) => ({ players: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, nickname: id, teamId: id })), teams: [{ id, name: `Squadra ${id}` }] });
    expect(plugin.buildConfig!({}, () => undefined, team("x", 1)).ok).toBe(false);
    const big = plugin.buildConfig!({}, () => undefined, team("x", 9));
    expect(!big.ok && big.error).toContain("al massimo 8");
    expect(plugin.buildConfig!({}, () => undefined, team("x", 8)).ok).toBe(true);
    expect(plugin.buildConfig!({}, () => undefined, team("x", 2)).ok).toBe(true);
    expect(plugin.buildConfig!({ mode: "unico" }, () => undefined, team("x", 30)).ok).toBe(true);
    expect(plugin.buildConfig!({ orderSeconds: 6, minOrderSeconds: 9 }, () => undefined, team("x", 3)).ok).toBe(false);
    expect(plugin.buildConfig!({ sectors: 99 }, () => undefined, team("x", 3)).ok).toBe(false);
  });
});

describe("ordini eseguiti", () => {
  it("il proprietario del comando lo porta al valore chiesto: l'ordine è eseguito, l'astronave avanza e chi lo aveva ne riceve un altro", () => {
    let s = launched(6);
    const holder = "a1";
    const order = orderOf(s, holder);
    const before = crewOf(s, holder);
    s = execute(s, order, NOW + 3000);
    const after = crewOf(s, holder);
    expect(after.done).toBe(1);
    expect(after.progress).toBe(1);
    expect(after.hull).toBe(100);
    expect(after.orders[holder]!.id).not.toBe(order.id);
    expect(after.orders[holder]!.issuedAt).toBe(NOW + 3000);
    expect(after.lastDone!.text).toContain(controlOf(before.controls.length ? s : s, { ...order }).name);
    // gli altri ordini e l'altro equipaggio non cambiano
    for (const m of after.members.filter((x) => x !== holder)) expect(after.orders[m]).toEqual(before.orders[m]);
    expect(s.crews.find((c) => c.id === "tb")).toEqual(start(6).crews.length ? launched(6).crews.find((c) => c.id === "tb") : undefined);
  });

  it("per tutti i tipi di comando: pulsante, interruttore, cursore e selettore", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      let s = launched(seed, {}, ctxFor(seed, [4, 4]));
      for (const holder of ["a1", "a2", "b1", "b2"]) {
        const order = orderOf(s, holder);
        const control = controlOf(s, order);
        seen.add(control.kind);
        const done = crewOf(s, holder).done;
        s = execute(s, order, NOW + 2000);
        expect(crewOf(s, holder).done, `seme ${seed}, ${control.kind}`).toBe(done + 1);
      }
    }
    expect([...seen].sort()).toEqual(["button", "selector", "slider", "toggle"]);
  });

  it("chi non è il proprietario, un comando che non c'è, un valore fuori scala o uguale a quello attuale non fanno nulla", () => {
    const s = launched(7);
    const order = orderOf(s, "a1");
    const control = controlOf(s, order);
    const other = crewOf(s, "a1").members.find((m) => m !== control.owner)!;
    expect(input(s, other, inputFor(control, order.target), NOW + 100)).toBe(s);
    expect(input(s, "estraneo", inputFor(control, order.target), NOW + 100)).toBe(s);
    expect(input(s, "b1", inputFor(control, order.target), NOW + 100)).toBe(s);
    expect(input(s, control.owner, { type: "set", control: "boh", value: 1 }, NOW + 100)).toBe(s);
    expect(input(s, control.owner, { type: "press", control: "boh" }, NOW + 100)).toBe(s);
    if (control.kind === "button") expect(input(s, control.owner, { type: "set", control: control.id, value: 1 }, NOW + 100)).toBe(s);
    else {
      expect(input(s, control.owner, { type: "set", control: control.id, value: control.value }, NOW + 100)).toBe(s);
      expect(input(s, control.owner, { type: "press", control: control.id }, NOW + 100)).toBe(s);
    }
    const toggle = Object.values(s.crews).flatMap((c) => c.controls).find((c) => c.kind === "toggle")!;
    expect(input(s, toggle.owner, { type: "set", control: toggle.id, value: 2 }, NOW + 100)).toBe(s);
    const selector = s.crews.flatMap((c) => c.controls).find((c) => c.kind === "selector")!;
    expect(input(s, selector.owner, { type: "set", control: selector.id, value: selector.options.length }, NOW + 100)).toBe(s);
  });

  it("cambiare un comando senza che nessun ordine lo chieda non è un errore: il valore cambia e basta", () => {
    const s = launched(8);
    const crew = crewOf(s, "a1");
    const asked = new Set(Object.values(crew.orders).map((o) => o.controlId));
    const free = crew.controls.find((c) => !asked.has(c.id) && c.kind !== "button")!;
    const target = free.kind === "toggle" ? 1 - free.value : (free.value + 1) % (free.kind === "slider" ? 6 : free.options.length);
    const out = input(s, free.owner, inputFor(free, target), NOW + 500);
    const after = crewOf(out, "a1");
    expect(after.controls.find((c) => c.id === free.id)!.value).toBe(target);
    expect(after).toMatchObject({ done: 0, missed: 0, hull: 100 });
    expect(after.orders).toEqual(crew.orders);
  });

  it("fuori dal settore o in pausa gli input non contano", () => {
    const ready = start(9);
    expect(input(ready, "a1", { type: "alarm" }, NOW)).toBe(ready);
    const s = launched(9);
    const order = orderOf(s, "a1");
    const paused = host(s, { type: "pause" }, NOW + 1000);
    expect(execute(paused, order, NOW + 2000)).toBe(paused);
  });
});

describe("tempo: scadenze, ora equa e settori", () => {
  it("un ordine scaduto (con la tolleranza) danneggia lo scafo e ne arriva un altro; prima non succede nulla (stesso oggetto)", () => {
    const s = launched(10);
    const order = orderOf(s, "a1");
    expect(plugin.onTick(s, order.deadline + GRACE_MS - 1)).toBe(s);
    const out = plugin.onTick(s, order.deadline + GRACE_MS);
    const c = crewOf(out, "a1");
    // tutti gli ordini di tutti gli equipaggi scadono insieme (stessi tempi): ognuno costa 5%
    expect(c.hull).toBe(100 - 5 * c.members.length);
    expect(c.missed).toBe(c.members.length);
    expect(c.orders["a1"]!.id).not.toBe(order.id);
    expect(c.orders["a1"]!.issuedAt).toBe(order.deadline + GRACE_MS);
    expect(c.done).toBe(0);
  });

  it("un comando che arriva in tempo all'ora equa vale anche se il messaggio arriva dopo la scadenza (entro la tolleranza); uno dichiarato dopo no", () => {
    const s = launched(11);
    const order = orderOf(s, "a1");
    const late = NOW + 12_000 + 300;
    // premuto 100 ms prima della scadenza, arrivato 300 ms dopo (rete lenta)
    expect(crewOf(execute(s, order, late, order.deadline - 100, 800), "a1").done).toBe(1);
    // dichiarato dopo la scadenza: il comando cambia, l'ordine no, e poi scade
    const slow = execute(s, order, late, order.deadline + 100, 40);
    expect(crewOf(slow, "a1").done).toBe(0);
    expect(controlOf(slow, order).value, "il comando è cambiato comunque").toBe(order.target);
    const expired = plugin.onTick(slow, order.deadline + GRACE_MS);
    expect(crewOf(expired, "a1").missed).toBeGreaterThan(0);
  });

  it("lo scafo a zero ferma l'astronave: niente più ordini, e se tutte si fermano il round finisce", () => {
    let s = launched(12, { damagePerMiss: 25, orderSeconds: 5, minOrderSeconds: 3 }, ctxFor(12, [2, 2]));
    let at = NOW;
    for (let i = 0; i < 6 && s.phase === "sector"; i++) {
      at = Math.max(...s.crews.flatMap((c) => Object.values(c.orders).map((o) => o.deadline))) + GRACE_MS;
      s = plugin.onTick(s, at);
    }
    expect(s.crews.every((c) => c.hull === 0 && c.stopped)).toBe(true);
    expect(s.phase).toBe("final");
    expect(s.crews.every((c) => Object.keys(c.orders).length === 0)).toBe(true);
    // un'astronave ferma non riceve input
    expect(input(s, "a1", { type: "alarm" }, at + 10)).toBe(s);
  });

  it("i tempi dei settori: ordini più rapidi del 10% a settore fino al minimo, un comando in più dal terzo", () => {
    const c = cfg({ orderSeconds: 12, minOrderSeconds: 6, controlsPerPanel: 4 });
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => orderSecondsFor(c, n))).toEqual([12, 10.8, 9.7, 8.7, 7.9, 7.1, 6.4, 6, 6, 6]);
    expect([1, 2, 3, 4].map((n) => controlsFor(c, n))).toEqual([4, 4, 5, 5]);
    expect(controlsFor(cfg({ controlsPerPanel: 6 }), 9)).toBe(6);
  });

  it("alla fine del settore c'è il salto, poi pannelli nuovi e ordini più rapidi; all'ultimo settore si va alla classifica", () => {
    // ordini lunghi quanto il settore: non scadono prima della fine
    let s = launched(13, { sectors: 3, events: false, sectorSeconds: 30, orderSeconds: 30, minOrderSeconds: 15 });
    const first = crewOf(s, "a1");
    const end = s.phaseEndsAt!;
    expect(plugin.onTick(s, end - 1)).toBe(s);
    s = plugin.onTick(s, end);
    expect(s.phase).toBe("jump");
    expect(s.phaseEndsAt).toBe(end + JUMP_SECONDS * 1000);
    expect(s.crews.every((c) => Object.keys(c.orders).length === 0)).toBe(true);
    s = plugin.onTick(s, end + JUMP_SECONDS * 1000);
    expect(s.phase).toBe("sector");
    expect(s.sector).toBe(2);
    const second = crewOf(s, "a1");
    expect(second.controls.map((c) => c.name)).not.toEqual(first.controls.map((c) => c.name));
    expect(second.orders["a1"]!.deadline - second.orders["a1"]!.issuedAt).toBe(27_000);
    // il progresso e lo scafo restano
    s = plugin.onTick(plugin.onTick(s, s.phaseEndsAt!), s.phaseEndsAt! + JUMP_SECONDS * 1000 + 1);
    expect(s.sector).toBe(3);
    expect(crewOf(s, "a1").controls).toHaveLength(crewOf(s, "a1").members.length * 5);
    s = plugin.onTick(s, s.phaseEndsAt!);
    expect(s.phase).toBe("final");
    expect(plugin.isFinished(s)).toBe(false);
    expect(host(s, { type: "next" }, 9_999_999).phase).toBe("done");
    expect(plugin.isFinished(host(s, { type: "next" }, 9_999_999))).toBe(true);
  });
});

describe("eventi", () => {
  /** Il settore con l'evento ormai partito. */
  function atEvent(seed: number, kind: "alarm" | "blackout") {
    for (let sd = seed; sd < seed + 200; sd++) {
      // ordini lunghi: prima dell'evento (14–26 s) non scade nessuno e lo scafo è intatto
      const s = launched(sd, { events: true, sectorSeconds: 40, orderSeconds: 30, minOrderSeconds: 15 }, ctxFor(sd, [3, 3]));
      // l'evento finisce (al più 8 s dopo) prima che scada il primo ordine, a 30 s
      if (s.sectorEvent?.kind !== kind || s.sectorEvent.at > NOW + 20_000) continue;
      return { s: plugin.onTick(s, s.sectorEvent.at), at: s.sectorEvent.at };
    }
    throw new Error("nessun seme");
  }

  it("senza eventi niente allarme né blackout", () => {
    const s = launched(1, { events: false });
    expect(s.sectorEvent).toBeNull();
    expect(plugin.onTick(s, s.phaseEndsAt! - 1).crews.every((c) => c.event === null)).toBe(true);
  });

  it("l'evento del settore parte alla stessa ora per tutti gli equipaggi, tra il 35% e il 65% del settore", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = launched(seed, { events: true, sectorSeconds: 60 });
      expect(s.sectorEvent!.at).toBeGreaterThanOrEqual(NOW + 21_000);
      expect(s.sectorEvent!.at).toBeLessThanOrEqual(NOW + 39_000);
      const fired = plugin.onTick(s, s.sectorEvent!.at);
      expect(fired.crews.every((c) => c.event?.kind === s.sectorEvent!.kind)).toBe(true);
      expect(fired.sectorEvent!.fired).toBe(true);
    }
  });

  it("allarme generale: se premono tutti entro 5 s si va avanti di un passo, altrimenti si perde scafo", () => {
    const { s, at } = atEvent(1, "alarm");
    const crew = s.crews[0]!;
    expect(crew.event).toMatchObject({ kind: "alarm", until: at + ALARM_SECONDS * 1000 });
    // tutti premono: superato subito
    let ok = s;
    for (const m of crew.members) ok = input(ok, m, { type: "alarm" }, at + 1000);
    expect(ok.crews[0]!.event).toBeNull();
    expect(ok.crews[0]!.progress).toBe(crew.progress + 1);
    expect(ok.crews[0]!.lastDone!.text).toContain("superato");
    // un doppio tocco o chi non è dell'equipaggio non conta
    expect(input(s, crew.members[0]!, { type: "alarm" }, at + 100).crews[0]!.event!.pressed).toEqual([crew.members[0]]);
    expect(input(input(s, crew.members[0]!, { type: "alarm" }, at + 100), crew.members[0]!, { type: "alarm" }, at + 200).crews[0]!.event!.pressed).toHaveLength(1);
    // uno manca: allo scadere l'allarme costa lo scafo
    let bad = s;
    for (const m of crew.members.slice(1)) bad = input(bad, m, { type: "alarm" }, at + 1000);
    const ended = plugin.onTick(bad, at + ALARM_SECONDS * 1000);
    expect(ended.crews[0]!.event).toBeNull();
    expect(ended.crews[0]!.hull).toBe(95);
    expect(ended.crews[0]!.lastDone!.text).toContain("mancato");
    // dopo la scadenza non si può più premere
    expect(input(ended, crew.members[0]!, { type: "alarm" }, at + 6000)).toBe(ended);
  });

  it("blackout: per 8 s metà dei pannelli mostra solo le iniziali; poi tutto torna normale", () => {
    const { s, at } = atEvent(1, "blackout");
    const crew = s.crews[0]!;
    expect(crew.event).toMatchObject({ kind: "blackout", until: at + BLACKOUT_SECONDS * 1000 });
    expect(crew.event!.victims).toHaveLength(Math.max(1, Math.floor(crew.members.length / 2)));
    const victim = crew.event!.victims[0]!;
    const spared = crew.members.find((m) => !crew.event!.victims.includes(m))!;
    const mine = crew.controls.filter((c) => c.owner === victim);
    const view = plugin.viewFor(s, victim, null) as { me: { controls: { name: string }[] } };
    expect(view.me.controls.map((c) => c.name)).toEqual(mine.map((c) => c.name.split(/\s+/).map((w) => w[0]!.toUpperCase()).join(".") + "."));
    expect((plugin.viewFor(s, spared, null) as { me: { controls: { name: string }[] } }).me.controls.map((c) => c.name)).toEqual(crew.controls.filter((c) => c.owner === spared).map((c) => c.name));
    // gli ordini non cambiano: i nomi interi si gridano comunque
    expect(plugin.viewFor(s, victim, null)).toMatchObject({ me: { order: { text: crew.orders[victim]!.text } } });
    const ended = plugin.onTick(s, at + BLACKOUT_SECONDS * 1000);
    expect(ended.crews[0]!.event).toBeNull();
    expect(ended.crews[0]!.hull).toBe(100);
  });
});

describe("pausa e comandi della regia", () => {
  it("la pausa ferma tutto e la ripresa sposta di altrettanto ordini ed eventi, così non scade nulla durante la pausa", () => {
    const s = launched(14, { events: true });
    const order = orderOf(s, "a1");
    const paused = host(s, { type: "pause" }, NOW + 5000);
    expect(paused.pausedRemainingMs).toBe(s.phaseEndsAt! - (NOW + 5000));
    expect(plugin.onTick(paused, NOW + 10_000_000)).toBe(paused);
    expect(host(paused, { type: "pause" }, NOW + 6000)).toBe(paused);
    const resumed = host(paused, { type: "resume" }, NOW + 65_000);
    expect(orderOf(resumed, "a1").deadline).toBe(order.deadline + 60_000);
    expect(resumed.phaseEndsAt).toBe(NOW + 65_000 + paused.pausedRemainingMs!);
    expect(resumed.sectorEvent!.at).toBe(s.sectorEvent!.at + 60_000);
    expect(plugin.onTick(resumed, NOW + 65_001)).toBe(resumed);
    expect(host(resumed, { type: "resume" }, NOW + 70_000)).toBe(resumed);
  });

  it("«Ripara» riporta al 50% gli scafi sotto il 50% e rimette in moto chi si era fermato", () => {
    const base = launched(15, {}, ctxFor(15, [2, 2]));
    const hurt: S = { ...base, crews: base.crews.map((c, i) => (i === 0 ? { ...c, hull: 0, stopped: true, orders: {} } : i === 1 ? { ...c, hull: 20 } : c)) };
    const fixed = host(hurt, { type: "repair", crewId: "ta" }, NOW + 10);
    expect(fixed.crews[0]).toMatchObject({ hull: 50, stopped: false });
    expect(Object.keys(fixed.crews[0]!.orders).sort(), "un ordine a ogni membro").toEqual(["a1", "a2"]);
    expect(fixed.crews[1]!.hull, "l'altro equipaggio non è toccato").toBe(20);
    const all = host(hurt, { type: "repair" }, NOW + 10);
    expect(all.crews.map((c) => c.hull)).toEqual([50, 50]);
    // uno scafo sopra il 50% resta com'è; prima del decollo e a fine round non fa nulla
    expect(host({ ...base, crews: base.crews.map((c) => ({ ...c, hull: 80 })) }, { type: "repair" }, NOW + 10).crews.map((c) => c.hull)).toEqual([80, 80]);
    expect(host(start(15), { type: "repair" }, T0)).toEqual(start(15));
  });

  it("«Ridistribuisci» toglie i comandi a un telefono fuori uso e li rifà tra gli altri, e si può riabilitare", () => {
    const s = launched(16, {}, ctxFor(16, [4, 4]));
    const out = host(s, { type: "reshuffle", playerId: "a2" }, NOW + 1000);
    const crew = crewOf(out, "a1");
    expect(crew.inactive).toEqual(["a2"]);
    expect(crew.controls.some((c) => c.owner === "a2")).toBe(false);
    expect(crew.orders["a2"]).toBeUndefined();
    expect(Object.keys(crew.orders).sort()).toEqual(["a1", "a3", "a4"]);
    expect(crew.controls).toHaveLength(3 * 4);
    expect(out.phaseEndsAt).toBe(s.phaseEndsAt);
    // chi è fuori uso non può agire; l'altro equipaggio ha pannelli nuovi ma lo stesso numero di comandi
    expect(input(out, "a2", { type: "alarm" }, NOW + 2000)).toBe(out);
    expect(crewOf(out, "b1").controls).toHaveLength(16);
    const back = host(out, { type: "reshuffle", playerId: "a2" }, NOW + 3000);
    expect(crewOf(back, "a1").inactive).toEqual([]);
    expect(crewOf(back, "a1").controls).toHaveLength(16);
  });

  it("«Salta il settore» e «Termina il round» portano avanti e alla classifica; i punti già fatti restano", () => {
    let s = launched(17, { events: false }, ctxFor(17, [2, 2]));
    s = execute(s, orderOf(s, "a1"), NOW + 2000);
    const skipped = host(s, { type: "skip-sector" }, NOW + 3000);
    expect(skipped.phase).toBe("jump");
    expect(skipped.crews.every((c) => Object.keys(c.orders).length === 0)).toBe(true);
    const ended = host(s, { type: "end" }, NOW + 3000);
    expect(ended.phase).toBe("final");
    expect(plugin.scores(ended).length).toBeGreaterThan(0);
    expect(host(ended, { type: "end" }, NOW + 4000)).toBe(ended);
  });
});

describe("punti", () => {
  it("ogni membro prende i punti dell'equipaggio: ordini, scafo e podio tra le squadre", () => {
    let s = launched(18, { events: false, sectors: 1 }, ctxFor(18, [2, 2]));
    // la squadra A esegue due ordini, la B nessuno
    s = execute(s, orderOf(s, "a1"), NOW + 1000);
    s = execute(s, orderOf(s, "a2"), NOW + 1200);
    s = plugin.onTick(s, s.phaseEndsAt!);
    expect(s.phase).toBe("final");
    const totals = Object.fromEntries(plugin.scores(s).map((d) => [d.playerId, d.points]));
    const a = s.crews[0]!;
    const b = s.crews[1]!;
    expect(a.done).toBe(2);
    expect(totals.a1).toBe(totals.a2);
    expect(totals.a1).toBe(2 * 10 + Math.round(a.hull) + 150);
    expect(totals.b1).toBe(0 * 10 + Math.round(b.hull) + 100);
    expect(plugin.scores(s).every((d) => Number.isInteger(d.points) && d.teamId === null)).toBe(true);
    const ranking = plugin.result(s).ranking;
    expect(ranking.find((r) => r.playerId === "a1")!.rank).toBe(1);
    expect(ranking.find((r) => r.playerId === "b1")!.rank).toBe(3);
    // il podio dà il piazzamento a ogni membro della squadra
    expect(plugin.screenView(s)).toMatchObject({ crews: [{ rank: 1 }, { rank: 2 }] });
  });

  it("in «equipaggio unico» niente podio", () => {
    let s = launched(19, { mode: "unico", events: false, sectors: 1 }, ctxFor(19, [2, 2]));
    s = execute(s, orderOf(s, "a1"), NOW + 1000);
    s = plugin.onTick(s, s.phaseEndsAt!);
    const points = plugin.scores(s).map((d) => d.points);
    expect(new Set(points).size).toBe(1);
    expect(points[0]).toBe(10 + crewOf(s, "a1").hull);
  });

  it("un equipaggio piccolo non è battuto da uno grande solo perché ha più ordini (media per membro)", () => {
    let s = launched(20, { events: false, sectors: 1, sectorSeconds: 180, orderSeconds: 30, minOrderSeconds: 15 }, ctxFor(20, [2, 8]));
    // la squadra grande esegue 6 ordini (0,75 a testa), la piccola 3 (1,5 a testa)
    let at = NOW + 1000;
    for (const holder of ["b1", "b2", "b3", "b4", "b5", "b6", "a1", "a2"]) s = execute(s, orderOf(s, holder), (at += 100));
    s = execute(s, orderOf(s, "a1"), (at += 100));
    s = plugin.onTick(s, s.phaseEndsAt!);
    const [small, large] = [s.crews[0]!, s.crews[1]!];
    expect(large.done).toBe(6);
    expect(small.done).toBe(3);
    expect(plugin.screenView(s)).toMatchObject({ crews: [{ id: "ta", rank: 1 }, { id: "tb", rank: 2 }] });
  });
});

describe("una partita simulata", () => {
  it("un equipaggio che grida bene (90%) porta l'astronave in fondo ai settori senza fermarsi; uno che non ascolta si ferma", () => {
    let good: S = launched(21, { sectors: 3, sectorSeconds: 40, events: true }, ctxFor(21, [4, 4]));
    let at = NOW;
    while (good.phase !== "final" && at < NOW + 600_000) {
      if (good.phase === "sector") ({ s: good, at } = crewPlay(good, at, 60_000, { skill: 0.9, seed: at }));
      else {
        at += 100;
        good = plugin.onTick(good, at);
      }
    }
    expect(good.phase).toBe("final");
    expect(good.crews.every((c) => c.done > 5 && !c.stopped)).toBe(true);
    // chi non esegue nulla (skill 0) perde scafo a ogni ordine e finisce fermo o quasi
    let bad: S = launched(22, { sectors: 2, sectorSeconds: 40, events: false, damagePerMiss: 20 }, ctxFor(22, [3, 3]));
    ({ s: bad } = crewPlay(bad, NOW, 120_000, { skill: 0 }));
    expect(bad.crews.every((c) => c.hull < 100 && c.done === 0)).toBe(true);
  });
});

describe("stato", () => {
  it("lo stato è JSON puro e le azioni non modificano quello ricevuto", () => {
    const s = launched(23);
    const frozen = JSON.stringify(s);
    expect(JSON.parse(frozen)).toEqual(s);
    execute(s, orderOf(s, "a1"), NOW + 1000);
    host(s, { type: "pause" }, NOW + 1000);
    host(s, { type: "reshuffle", playerId: "a1" }, NOW + 1000);
    plugin.onTick(s, NOW + 30_000);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});
