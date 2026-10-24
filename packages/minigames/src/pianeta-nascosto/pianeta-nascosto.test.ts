import { describe, expect, it } from "vitest";
import { type S, T0, actingObs, actor, ctxFor, host, input, launched, locateAction, obs, passUntil, play, plugin, start, tick } from "./test-helpers.js";
import { TOKEN_KINDS } from "./board.js";

const total = (o: { tokens: Record<string, number> }) => Object.values(o.tokens).reduce((a, b) => a + b, 0);

describe("pianeta-nascosto: avvio", () => {
  it("osservatori, pila, gettoni e fatti iniziali per livello", () => {
    const s = start();
    expect(s.phase).toBe("briefing");
    expect(s.observatories).toHaveLength(2);
    expect(s.observatories.map((o) => o.time)).toEqual([0, 0]);
    expect(new Set(s.observatories.map((o) => o.stack)).size).toBe(2);
    expect(s.observatories.map(total)).toEqual([9, 9]);
    expect(s.observatories.every((o) => o.facts.length === 8)).toBe(true);
    const expert = start({ mode: "expert", difficulty: "youth" });
    expect(expert.observatories.map(total)).toEqual([12, 12]);
    expect(expert.observatories.every((o) => o.facts.length === 12)).toBe(true);
    expect(expert.sky).toHaveLength(18);
    expect(start({ difficulty: "genius" }).observatories[0]!.facts).toEqual([]);
  });

  it("la regia cambia il livello di una squadra solo nel briefing", () => {
    let s = start();
    const id = s.observatories[0]!.id;
    for (const [level, n] of [["youth", 12], ["experienced", 4], ["genius", 0], ["beginner", 8]] as const) {
      s = host(s, { type: "set-difficulty", teamId: id, difficulty: level });
      expect(obs(s, id).facts).toHaveLength(n);
    }
    s = host(s, { type: "start" });
    expect(host(s, { type: "set-difficulty", teamId: id, difficulty: "youth" })).toBe(s);
  });

  it("buildConfig: una sola squadra serve un robot; al massimo 6 osservatori", () => {
    const roster = (teams: number) => ({ players: ctxFor(1, Array(teams).fill(2)).players, teams: ctxFor(1, Array(teams).fill(2)).teams });
    expect(plugin.buildConfig!({}, () => undefined, roster(1)).ok).toBe(false);
    expect(plugin.buildConfig!({ bots: 1 }, () => undefined, roster(1)).ok).toBe(true);
    expect(plugin.buildConfig!({}, () => undefined, roster(2)).ok).toBe(true);
    expect(plugin.buildConfig!({ bots: 3 }, () => undefined, roster(4)).ok).toBe(false);
  });
});

describe("pianeta-nascosto: turni e pila", () => {
  it("agisce chi è più indietro; a pari giorni chi è arrivato prima; chi si muove va davanti", () => {
    let s = launched();
    const [first, second] = [...s.observatories].sort((a, b) => a.stack - b.stack).map((o) => o.id);
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(s.actingIds[0]!);
      s = host(s, { type: "skip" }, T0 + 10_000 * (i + 2));
      s = tick(s, T0 + 10_000 * (i + 2) + 5000);
    }
    expect(order).toEqual([first, second, first, second, first, second]);
    expect(obs(s, first!).time).toBeGreaterThan(0);
  });

  it("simultaneo: agiscono insieme tutte le squadre nel settore più arretrato", () => {
    let s = launched({ turnMode: "simultaneous" });
    expect([...s.actingIds].sort()).toEqual(s.observatories.map((o) => o.id).sort());
    s = host(s, { type: "skip" });
    expect(s.phase).toBe("resolve");
    s = tick(s, T0 + 20_000);
    expect(s.phase).toBe("turn");
    expect(s.observatories.map((o) => o.time)).toEqual([1, 1]);
  });

  it("proposta, voto e conferma: l'azione costa giorni e il risultato è solo della squadra", () => {
    let s = launched({ turnSeconds: 0 });
    const who = actingObs(s);
    const visible = (s.earth % 12) + 1;
    const asteroidsInArc = [visible, visible + 1, visible + 2].filter((x) => s.sky[x - 1] === "asteroid").length;
    s = play(s, { type: "survey", object: "asteroid", from: visible, to: visible + 2 });
    expect(s.phase).toBe("resolve");
    const after = obs(s, who.id);
    expect(after.time).toBe(4);
    expect(after.log[0]!.result).toEqual({ type: "survey", count: asteroidsInArc });
    // La cronaca pubblica dice cosa si è scelto, mai il risultato.
    expect(s.publicLog.at(-1)!.text).toContain("rileva asteroidi");
    expect(s.publicLog.at(-1)!.text).not.toContain(String(asteroidsInArc + "!"));
    expect(JSON.stringify(plugin.screenView(s))).not.toContain('"count"');
  });

  it("azioni non valide: fuori dal cielo visibile, comete senza estremi da cometa, puntamenti finiti, ricerca di fila", () => {
    let s = launched({ turnSeconds: 0 });
    const who = actingObs(s).id;
    const before = actingObs(s).proposals.length;
    s = input(s, actor(s), { type: "propose", action: { type: "survey", object: "asteroid", from: 7, to: 9 } });
    s = input(s, actor(s), { type: "propose", action: { type: "survey", object: "comet", from: 1, to: 3 } });
    expect(actingObs(s).proposals).toHaveLength(before);
    s = play(s, { type: "research", topic: "A" });
    s = tick(s, T0 + 30_000);
    // un'altra squadra gioca…
    s = host(s, { type: "skip" }, T0 + 31_000);
    s = tick(s, T0 + 40_000);
    expect(s.actingIds[0]).toBe(who);
    const n = actingObs(s).proposals.length;
    s = input(s, actor(s), { type: "propose", action: { type: "research", topic: "B" } }, T0 + 41_000);
    expect(actingObs(s).proposals).toHaveLength(n);
  });

  it("senza proposte il turno scaduto è un passo; con il solo capitano decide lui", () => {
    let s = launched({ turnSeconds: 30 });
    const id = s.actingIds[0]!;
    s = tick(s, T0 + 1000 + 30_000);
    expect(s.phase).toBe("resolve");
    expect(obs(s, id).time).toBe(1);

    let c = launched({ decision: "captain", turnSeconds: 0 });
    const members = actingObs(c).members;
    c = input(c, members[1]!, { type: "propose", action: { type: "target", sector: (c.earth % 12) + 1 } });
    const proposal = actingObs(c).proposals[0]!;
    c = input(c, members[1]!, { type: "decide", proposalId: proposal.id });
    expect(c.phase).toBe("turn");
    c = input(c, members[0]!, { type: "decide", proposalId: proposal.id });
    expect(c.phase).toBe("resolve");
  });

  it("chi non è in serata non influenza la partita", () => {
    const s = launched();
    expect(JSON.stringify(input(s, "estraneo", { type: "propose", action: { type: "target", sector: 1 } }))).toBe(JSON.stringify(s));
  });

  it("pausa e ripresa spostano le scadenze", () => {
    let s = launched({ turnSeconds: 30 });
    s = host(s, { type: "pause" }, T0 + 10_000);
    expect(s.phaseEndsAt).toBeNull();
    expect(tick(s, T0 + 100_000)).toBe(s);
    s = host(s, { type: "resume" }, T0 + 100_000);
    expect(s.phaseEndsAt).toBe(T0 + 100_000 + 21_000);
  });
});

describe("pianeta-nascosto: Terra, conferenze e teorie", () => {
  it("in Base la prima fase teoria arriva al settore 4, poi ogni 3 settori", () => {
    let s = launched({ turnSeconds: 0, theorySeconds: 0 });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = passUntil(s, (x) => x.phase === "theory");
      seen.push(s.earth);
      s = host(s, { type: "next" });
      s = passUntil(s, (x) => x.phase !== "review");
    }
    expect(seen).toEqual([3, 6, 9, 12]);
  });

  it("la conferenza X1 si tiene una volta sola, la teoria a ogni giro", () => {
    let s = launched({ turnSeconds: 0, theorySeconds: 0, maxDays: 0 });
    let conferences = 0;
    let theories = 0;
    let at = T0 + 5000;
    for (let i = 0; i < 400 && s.earth < 40; i++) {
      at += 10_000;
      const phase = s.phase;
      if (phase === "turn") s = host(s, { type: "skip" }, at);
      else if (phase === "conference") {
        conferences++;
        expect(s.earth % 12).toBe(10);
        s = host(s, { type: "next" }, at);
      } else if (phase === "theory") {
        theories++;
        s = host(s, { type: "next" }, at);
      } else s = host(s, { type: "next" }, at);
    }
    expect(conferences).toBe(1);
    expect(theories).toBeGreaterThanOrEqual(12);
    expect(s.conferences[0]!.held).toBe(true);
  });

  it("in Esperto le conferenze sono due: X1 dopo il settore 7, X2 dopo il 16", () => {
    let s = launched({ mode: "expert", turnSeconds: 0, theorySeconds: 0 });
    const earths: number[] = [];
    for (let i = 0; i < 500 && earths.length < 2; i++) {
      s = passUntil(s, (x) => x.phase === "conference" || x.phase === "done");
      if (s.phase === "conference") earths.push(s.earth);
      s = host(s, { type: "next" });
    }
    expect(earths).toEqual([7, 16]);
  });

  it("teorie: il gettone si scala alla chiusura, il ritiro non costa, limiti e rifiuti", () => {
    let s = launched({ turnSeconds: 0, theorySeconds: 0 });
    s = passUntil(s, (x) => x.phase === "theory");
    const o = s.observatories[0]!;
    const m = o.members[0]!;
    const truth = (sector: number) => s.sky[sector - 1];
    const asteroid = s.sky.indexOf("asteroid") + 1;
    s = input(s, m, { type: "theory", sector: asteroid, object: "asteroid" });
    s = input(s, m, { type: "theory", sector: asteroid === 1 ? 2 : 1, object: "gas" }); // oltre il limite di una per fase in Base
    expect(obs(s, o.id).draft).toHaveLength(1);
    s = input(s, m, { type: "withdraw", sector: asteroid });
    expect(obs(s, o.id).draft).toHaveLength(0);
    expect(total(obs(s, o.id))).toBe(9);
    // una cometa fuori dai settori da cometa è rifiutata
    s = input(s, m, { type: "theory", sector: 1, object: "comet" });
    expect(obs(s, o.id).draft).toHaveLength(0);
    s = input(s, m, { type: "theory", sector: asteroid, object: "asteroid" });
    for (const id of s.observatories.flatMap((x) => x.members)) s = input(s, id, { type: "ready" });
    expect(s.phase).toBe("review");
    expect(obs(s, o.id).tokens.asteroid).toBe(3);
    const placed = s.theories.find((t) => t.ownerId === o.id)!;
    expect(placed.space).toBe(1);
    expect(placed.faceUp).toBe(false);
    expect(truth(asteroid)).toBe("asteroid");
    // Nessuno dei due telefoni degli avversari vede l'oggetto.
    expect(JSON.stringify(plugin.screenView(s))).not.toContain('"object":"asteroid"');
  });

  it("una teoria giusta viene confermata dopo tre fasi; una sbagliata costa un giorno e il gettone", () => {
    let s = launched({ turnSeconds: 0, theorySeconds: 0 });
    s = passUntil(s, (x) => x.phase === "theory");
    const [right, wrong] = s.observatories;
    const asteroid = s.sky.indexOf("asteroid") + 1;
    const gasless = s.sky.findIndex((k) => k !== "gas" && k !== "planetX" && k !== "empty") + 1;
    const wrongSector = s.sky.findIndex((k, i) => k !== "gas" && i + 1 !== asteroid) + 1;
    s = input(s, right!.members[0]!, { type: "theory", sector: asteroid, object: "asteroid" });
    s = input(s, wrong!.members[0]!, { type: "theory", sector: wrongSector, object: "gas" });
    for (const id of s.observatories.flatMap((x) => x.members)) s = input(s, id, { type: "ready" });
    expect(gasless).toBeGreaterThan(0);
    // fino alla revisione: tre fasi teoria dopo l'invio (la prima è quella dell'invio)
    let reviews = 0;
    for (let i = 0; i < 100 && Object.keys(s.confirmed).length === 0; i++) {
      s = passUntil(s, (x) => x.phase === "theory" || x.phase === "done");
      if (s.phase === "theory") {
        reviews++;
        s = host(s, { type: "next" });
      }
    }
    expect(reviews).toBe(2);
    expect(s.confirmed[asteroid]).toBe("asteroid");
    expect(s.refuted).toEqual([{ sector: wrongSector, object: "gas" }]);
    expect(obs(s, wrong!.id).tokens.gas).toBe(1);
    expect(s.theories.filter((t) => t.ownerId === right!.id && t.faceUp)).toHaveLength(1);
    expect(s.theories.some((t) => t.ownerId === wrong!.id)).toBe(false);
    expect(s.publicLog.some((l) => l.text.includes("avanza di 1"))).toBe(true);
    for (const kind of TOKEN_KINDS) expect(obs(s, right!.id).tokens[kind]).toBeGreaterThanOrEqual(0);
  });
});

describe("pianeta-nascosto: fine partita e punti", () => {
  /** La squadra di turno localizza il Pianeta X. */
  const locate = (s: S): S => play(s, locateAction(s));

  it("localizzazione riuscita: la Terra non ruota e si annuncia solo l'esito; ultime opportunità e punti", () => {
    let s = launched({ turnSeconds: 0, theorySeconds: 0 });
    const finder = actingObs(s).id;
    const other = s.observatories.find((o) => o.id !== finder)!;
    s = locate(s);
    expect(s.phase).toBe("resolve");
    const announce = s.publicLog.at(-1)!;
    expect(announce.ok).toBe(true);
    expect(announce.text).toContain("RIUSCITO");
    expect(announce.text).not.toMatch(/\d/);
    s = tick(s, T0 + 60_000);
    expect(s.phase).toBe("lastCall");
    expect(s.earth).toBe(0);
    expect(s.lastCall).toEqual({ [other.id]: 5 });
    // l'altra squadra tenta la localizzazione giusta: 2 punti per settore di distanza
    const x = s.sky.indexOf("planetX") + 1;
    const n = s.sky.length;
    const g = { sector: x, left: s.sky[(x + n - 2) % n], right: s.sky[x % n] };
    for (const m of other.members) s = input(s, m, { type: "guess", ...g }, T0 + 61_000);
    for (const m of other.members) s = input(s, m, { type: "ready" }, T0 + 61_000);
    expect(s.phase).toBe("reveal");
    expect(s.sky).toBeDefined();
    s = host(s, { type: "next" }, T0 + 70_000);
    expect(s.phase).toBe("final");
    const scores = plugin.screenView(s) as { scores: { id: string; rank: number; breakdown: { planetX: number; total: number } }[] };
    expect(scores.scores.find((r) => r.id === finder)!.breakdown.planetX).toBe(10);
    expect(scores.scores.find((r) => r.id === other.id)!.breakdown.planetX).toBe(10);
    s = host(s, { type: "next" }, T0 + 80_000);
    expect(plugin.isFinished(s)).toBe(true);
    const points = Object.fromEntries(plugin.scores(s).map((d) => [d.playerId, d.points]));
    expect(points[finder === "ta" ? "a1" : "b1"]).toBe(100);
  });

  it("ultime opportunità: da 1 a 3 settori indietro una teoria, da 4 a 5 due; teorie giuste valgono punti", () => {
    let s = launched({ turnSeconds: 0, theorySeconds: 0 });
    s = locate(s);
    s = tick(s, T0 + 60_000);
    const late = s.observatories.find((o) => s.lastCall![o.id])!;
    const m = late.members[0]!;
    const asteroids = s.sky.flatMap((k, i) => (k === "asteroid" ? [i + 1] : []));
    for (const sector of asteroids.slice(0, 3)) s = input(s, m, { type: "theory", sector, object: "asteroid" }, T0 + 61_000);
    expect(obs(s, late.id).draft).toHaveLength(2); // lag 5 → due teorie
    for (const id of late.members) s = input(s, id, { type: "ready" }, T0 + 61_000);
    expect(s.phase).toBe("reveal");
    expect(s.theories.filter((t) => t.faceUp && t.correct)).toHaveLength(2);
    expect(obs(s, late.id).tokens.asteroid).toBe(2);
  });

  it("con maxDays superato si apre l'ipotesi finale: ogni giusta vale 5 punti", () => {
    let s = launched({ turnSeconds: 0, theorySeconds: 0, maxDays: 3 });
    s = passUntil(s, (x) => x.phase === "finalGuess");
    expect(s.phase).toBe("finalGuess");
    expect(s.fromMaxDays).toBe(true);
    const x = s.sky.indexOf("planetX") + 1;
    const n = s.sky.length;
    const g = { sector: x, left: s.sky[(x + n - 2) % n], right: s.sky[x % n] };
    const right = s.observatories[0]!;
    for (const m of right.members) s = input(s, m, { type: "guess", ...g });
    for (const o of s.observatories) for (const m of o.members) s = input(s, m, { type: "ready" });
    expect(s.phase).toBe("reveal");
    expect(obs(s, right.id).guessPoints).toBe(5);
    expect(s.observatories.filter((o) => o.guessPoints > 0)).toHaveLength(1);
  });

  it("«Termina il round» porta alla rivelazione e i punti arrivano solo in final", () => {
    let s = launched();
    expect(plugin.scores(s)).toEqual([]);
    s = host(s, { type: "end" });
    expect(s.phase).toBe("reveal");
    expect(plugin.scores(s)).toEqual([]);
    s = host(host(s, { type: "next" }), { type: "next" });
    expect(plugin.isFinished(s)).toBe(true);
    expect(plugin.result(s).ranking.map((r) => r.playerId).sort()).toEqual(["a1", "a2", "b1", "b2"]);
  });
});
