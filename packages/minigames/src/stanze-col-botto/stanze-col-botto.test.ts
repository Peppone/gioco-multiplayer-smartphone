import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { MinigameContext } from "@gioco/shared";
import { GRACE_MS } from "../util.js";
import { type RoomId, type StanzeColBottoState as State, colorAllowed, dealCards, hostagesNeeded, knownBy, roundTable, stanzeColBotto as scb } from "./index.js";

const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `Nick-p${i + 1}`, teamId: null }));
const ctxOf = (n: number): MinigameContext => ({ players: make(n), teams: [], seed: 11 });
const config = scb.configSchema.parse(scb.sampleConfig);
const meta = (at: number) => ({ receivedAt: at, claimedTime: at - 10, rtt: 20 });
const input = (s: State, id: string, i: Parameters<typeof scb.onInput>[2], at: number) => scb.onInput(s, id, i, meta(at));
const cmd = (s: State, c: Parameters<typeof scb.onHostCommand>[1], at: number) => scb.onHostCommand(s, c, at);

const inRoom = (s: State, r: RoomId) => s.players.filter((p) => s.room[p] === r);
const cardOf = (s: State, character: string) => s.players.find((p) => s.cards[p]?.character === character)!;

/** Partita con `n` giocatori portata all'inizio del primo round a t=1000. */
function inRound(n = 8, cfg = config) {
  let s = scb.init(cfg, ctxOf(n), 0);
  s = cmd(s, { type: "deal" }, 10);
  s = cmd(s, { type: "start-round" }, 1000);
  return s;
}

/** Elegge il leader di una stanza con la nomina del primo giocatore (il secondo nomina il primo, che poi è leader). */
function elect(s: State, r: RoomId, at = 1100): State {
  const [a, b] = inRoom(s, r) as [string, string];
  return input(s, b, { type: "appoint", targetId: a }, at);
}

const bothLeaders = (s: State) => elect(elect(s, 0), 1);

describe("stanze-col-botto: configurazione e tabelle", () => {
  it("la configurazione di esempio è valida; i round personalizzati richiedono almeno un round", () => {
    expect(scb.configSchema.safeParse(scb.sampleConfig).success).toBe(true);
    expect(scb.configSchema.safeParse({ ...scb.sampleConfig, roundMode: "custom", customRounds: [] }).success).toBe(false);
    expect(scb.configSchema.safeParse({ ...scb.sampleConfig, roundMode: "custom", customRounds: [{ seconds: 90, hostages6to10: 1, hostages11to21: 2, hostages22plus: 3 }] }).success).toBe(true);
  });

  it("lo schema genera un form usabile dall'editor: niente tuple e solo tipi semplici", () => {
    const schema = JSON.stringify(z.toJSONSchema(scb.configSchema));
    expect(schema).not.toContain("prefixItems");
    expect(Object.keys(z.toJSONSchema(scb.configSchema).properties ?? {})).toEqual(expect.arrayContaining(["firstRoomName", "secondRoomName", "roomAssignment", "customRounds"]));
  });

  it("tabella `base`: 3 round da 3, 2 e 1 minuto con gli ostaggi del regolamento", () => {
    const rows = (n: number) => roundTable(config, n).map((r) => r.hostages);
    expect(roundTable(config, 8).map((r) => r.seconds)).toEqual([180, 120, 60]);
    for (const n of [6, 8, 10]) expect(rows(n)).toEqual([1, 1, 1]);
    for (const n of [11, 16, 21]) expect(rows(n)).toEqual([2, 1, 1]);
    for (const n of [22, 30]) expect(rows(n)).toEqual([3, 2, 1]);
  });

  it("tabella `long`: 5 round da 5 a 1 minuto; sotto gli 11 giocatori ripiega su `base`", () => {
    const long = scb.configSchema.parse({ ...scb.sampleConfig, roundMode: "long" });
    const rows = (n: number) => roundTable(long, n).map((r) => r.hostages);
    expect(roundTable(long, 12).map((r) => r.seconds)).toEqual([300, 240, 180, 120, 60]);
    expect(rows(11)).toEqual([2, 2, 1, 1, 1]);
    expect(rows(13)).toEqual([2, 2, 1, 1, 1]);
    expect(rows(14)).toEqual([3, 2, 2, 1, 1]);
    expect(rows(17)).toEqual([3, 2, 2, 1, 1]);
    expect(rows(18)).toEqual([4, 3, 2, 1, 1]);
    expect(rows(21)).toEqual([4, 3, 2, 1, 1]);
    expect(rows(22)).toEqual([5, 4, 3, 2, 1]);
    expect(rows(30)).toEqual([5, 4, 3, 2, 1]);
    expect(roundTable(long, 10)).toEqual(roundTable(config, 10));
  });

  it("round personalizzati: la fascia di giocatori sceglie gli ostaggi", () => {
    const custom = scb.configSchema.parse({ ...scb.sampleConfig, roundMode: "custom", customRounds: [{ seconds: 45, hostages6to10: 1, hostages11to21: 2, hostages22plus: 4 }] });
    expect(roundTable(custom, 8)).toEqual([{ seconds: 45, hostages: 1 }]);
    expect(roundTable(custom, 12)).toEqual([{ seconds: 45, hostages: 2 }]);
    expect(roundTable(custom, 24)).toEqual([{ seconds: 45, hostages: 4 }]);
  });

  it("gli ostaggi non superano la stanza più piccola meno il leader", () => {
    const custom = scb.configSchema.parse({ ...scb.sampleConfig, roundMode: "custom", customRounds: [{ seconds: 45, hostages6to10: 9, hostages11to21: 9, hostages22plus: 9 }] });
    expect(roundTable(custom, 6)[0]!.hostages).toBe(2);
    expect(roundTable(custom, 7)[0]!.hostages).toBe(2);
  });

  it("il colore è ammesso solo con più di 10 giocatori, salvo diversa scelta", () => {
    expect(colorAllowed({ colorShare: "auto" }, 10)).toBe(false);
    expect(colorAllowed({ colorShare: "auto" }, 11)).toBe(true);
    expect(colorAllowed({ colorShare: "always" }, 6)).toBe(true);
    expect(colorAllowed({ colorShare: "never" }, 30)).toBe(false);
  });
});

describe("stanze-col-botto: distribuzione delle carte", () => {
  it("da 6 a 30 giocatori: Presidente e Bombarolo ci sono sempre, squadre pari, Giocatore d'azzardo solo con i dispari", () => {
    for (let n = 6; n <= 30; n++) {
      const cards = Object.values(dealCards(make(n).map((p) => p.id), Math.random));
      const count = (character: string) => cards.filter((c) => c.character === character).length;
      expect(cards).toHaveLength(n);
      expect(count("president")).toBe(1);
      expect(count("bomber")).toBe(1);
      expect(count("gambler")).toBe(n % 2);
      expect(cards.filter((c) => c.team === "blue")).toHaveLength(cards.filter((c) => c.team === "red").length);
    }
  });

  it("nessuna carta prima della distribuzione; poi ognuno ne ha una, in modo deterministico", () => {
    const a = scb.init(config, ctxOf(9), 0);
    expect(a.cards).toEqual({});
    const dealt = cmd(a, { type: "deal" }, 1);
    expect(Object.keys(dealt.cards)).toHaveLength(9);
    expect(JSON.stringify(cmd(scb.init(config, ctxOf(9), 0), { type: "deal" }, 1))).toBe(JSON.stringify(dealt));
    expect(dealt.phase).toBe("deal");
  });
});

describe("stanze-col-botto: abbinamento alle stanze", () => {
  it("a caso: stanze bilanciate fin dall'inizio, la regia può rimescolare e spostare", () => {
    for (const n of [6, 7, 11, 30]) {
      const s = scb.init(config, ctxOf(n), 0);
      expect(Math.abs(inRoom(s, 0).length - inRoom(s, 1).length)).toBeLessThanOrEqual(1);
    }
    const s = scb.init(config, ctxOf(8), 0);
    const shuffled = cmd(s, { type: "shuffle-rooms" }, 1);
    expect(shuffled.room).not.toEqual(s.room);
    expect(inRoom(shuffled, 0)).toHaveLength(4);
    const moved = cmd(s, { type: "move-player", playerId: inRoom(s, 0)[0]!, room: 1 }, 1);
    expect(inRoom(moved, 1)).toHaveLength(5);
  });

  const qr = scb.configSchema.parse({ ...scb.sampleConfig, roomAssignment: "qr" });

  it("con i QR: nessuno è abbinato all'inizio, il codice giusto entra, quello sbagliato no, si può cambiare stanza", () => {
    const s = scb.init(qr, ctxOf(8), 0);
    expect(s.room).toEqual({});
    expect(s.roomCodes[0]).not.toBe(s.roomCodes[1]);
    expect(input(s, "p1", { type: "join-room", code: "XXXXX" }, 1)).toBe(s);
    const a = input(s, "p1", { type: "join-room", code: s.roomCodes[0] }, 1);
    expect(a.room.p1).toBe(0);
    expect(input(a, "p1", { type: "join-room", code: s.roomCodes[1].toLowerCase() }, 2).room.p1).toBe(1);
  });

  it("con i QR: una stanza piena rifiuta nuovi ingressi e lo segnala al giocatore", () => {
    let s = scb.init(qr, ctxOf(8), 0);
    for (const id of ["p1", "p2", "p3", "p4"]) s = input(s, id, { type: "join-room", code: s.roomCodes[0] }, 1);
    const refused = input(s, "p5", { type: "join-room", code: s.roomCodes[0] }, 2);
    expect(refused.room.p5).toBeUndefined();
    expect((scb.viewFor(refused, "p5", null) as { me: { joinRefused: number } }).me.joinRefused).toBe(0);
    const ok = input(refused, "p5", { type: "join-room", code: s.roomCodes[1] }, 3);
    expect(ok.room.p5).toBe(1);
    expect((scb.viewFor(ok, "p5", null) as { me: { joinRefused: number | null } }).me.joinRefused).toBeNull();
  });

  it("i QR valgono solo nella modalità QR e solo prima di distribuire", () => {
    const random = scb.init(config, ctxOf(8), 0);
    expect(input(random, "p1", { type: "join-room", code: random.roomCodes[0] }, 1)).toBe(random);
    let s = scb.init(qr, ctxOf(8), 0);
    s = cmd(s, { type: "deal" }, 1);
    expect(input(s, "p1", { type: "join-room", code: s.roomCodes[1] }, 2)).toBe(s);
  });

  it("i non abbinati vanno nella stanza più vuota alla distribuzione", () => {
    let s = scb.init(qr, ctxOf(7), 0);
    for (const id of ["p1", "p2", "p3", "p4"]) s = input(s, id, { type: "join-room", code: s.roomCodes[0] }, 1);
    const dealt = cmd(s, { type: "deal" }, 2);
    expect(inRoom(dealt, 0)).toHaveLength(4);
    expect(inRoom(dealt, 1)).toHaveLength(3);
  });

  it("dalla regia: le stanze sbilanciate bloccano la distribuzione", () => {
    const host = scb.configSchema.parse({ ...scb.sampleConfig, roomAssignment: "host" });
    let s = scb.init(host, ctxOf(8), 0);
    for (const p of s.players.slice(0, 6)) s = cmd(s, { type: "move-player", playerId: p, room: 0 }, 1);
    expect(cmd(s, { type: "deal" }, 2).phase).toBe("pairing");
    expect((scb.hostView(s).actions.find((a) => a.id === "deal"))!.enabled).toBe(false);
    s = cmd(s, { type: "move-player", playerId: "p1", room: 1 }, 2);
    s = cmd(s, { type: "move-player", playerId: "p2", room: 1 }, 2);
    expect(cmd(s, { type: "deal" }, 3).phase).toBe("deal");
  });
});

describe("stanze-col-botto: leader", () => {
  it("nomina: non di sé stessi, non di chi è nell'altra stanza, non se c'è già un leader", () => {
    const s = inRound();
    const [a, b] = inRoom(s, 0) as [string, string];
    expect(input(s, a, { type: "appoint", targetId: a }, 1100)).toBe(s);
    expect(input(s, a, { type: "appoint", targetId: inRoom(s, 1)[0]! }, 1100)).toBe(s);
    const n = input(s, a, { type: "appoint", targetId: b }, 1100);
    expect(n.rooms[0].leader).toBe(b);
    expect(input(n, a, { type: "appoint", targetId: a }, 1200)).toBe(n);
  });

  it("voto: serve più della metà della stanza, i voti si azzerano, un pareggio non cambia nulla", () => {
    let s = inRound(8);
    const room = inRoom(s, 0);
    const [a, b, c, d] = room as [string, string, string, string];
    s = input(s, a, { type: "vote-leader", targetId: c }, 1100);
    s = input(s, b, { type: "vote-leader", targetId: c }, 1100);
    expect(s.rooms[0].leader).toBeNull(); // 2 su 4 non basta
    s = input(s, d, { type: "vote-leader", targetId: a }, 1100);
    expect(s.rooms[0].leader).toBeNull();
    s = input(s, c, { type: "vote-leader", targetId: c }, 1100);
    expect(s.rooms[0].leader).toBe(c); // 3 su 4
    expect(s.rooms[0].leaderVotes).toEqual({});
  });

  it("voto: si cambia e si ritira, e il voto per un'altra stanza è ignorato", () => {
    let s = inRound(8);
    const [a, b] = inRoom(s, 0) as [string, string];
    s = input(s, a, { type: "vote-leader", targetId: b }, 1100);
    expect(s.rooms[0].leaderVotes).toEqual({ [a]: b });
    expect(input(s, a, { type: "vote-leader", targetId: inRoom(s, 1)[0]! }, 1100)).toBe(s);
    s = input(s, a, { type: "vote-leader", targetId: null }, 1100);
    expect(s.rooms[0].leaderVotes).toEqual({});
    expect(input(s, a, { type: "vote-leader", targetId: null }, 1100)).toBe(s);
  });

  it("usurpazione: un leader già in carica si sostituisce con la maggioranza", () => {
    let s = elect(inRound(8), 0);
    const leader = s.rooms[0].leader!;
    const others = inRoom(s, 0).filter((p) => p !== leader);
    for (const v of others.slice(0, 3)) s = input(s, v, { type: "vote-leader", targetId: others[0]! }, 1200);
    expect(s.rooms[0].leader).toBe(others[0]);
  });

  it("abdicazione: il destinatario accetta o rifiuta; chi accetta non può restituirla nello stesso round", () => {
    let s = elect(inRound(8), 0);
    const leader = s.rooms[0].leader!;
    const target = inRoom(s, 0).find((p) => p !== leader)!;
    s = input(s, leader, { type: "abdicate", targetId: target }, 1200);
    expect(s.rooms[0].abdicateOffer).toMatchObject({ to: target });
    expect(input(s, leader, { type: "abdicate-answer", accept: true }, 1300)).toBe(s); // non è il destinatario
    const declined = input(s, target, { type: "abdicate-answer", accept: false }, 1300);
    expect(declined.rooms[0].leader).toBe(leader);
    expect(declined.rooms[0].abdicateOffer).toBeNull();
    s = input(s, target, { type: "abdicate-answer", accept: true }, 1300);
    expect(s.rooms[0].leader).toBe(target);
    expect(input(s, target, { type: "abdicate", targetId: leader }, 1400)).toBe(s);
  });

  it("solo il leader può abdicare; l'offerta scade", () => {
    let s = elect(inRound(8), 0);
    const [leader, other, third] = [s.rooms[0].leader!, ...inRoom(s, 0).filter((p) => p !== s.rooms[0].leader)] as [string, string, string];
    expect(input(s, other, { type: "abdicate", targetId: third }, 1200)).toBe(s);
    s = input(s, leader, { type: "abdicate", targetId: other }, 1200);
    expect(scb.onTick(s, 1200 + 19_000).rooms[0].abdicateOffer).not.toBeNull();
    expect(scb.onTick(s, 1200 + 21_000).rooms[0].abdicateOffer).toBeNull();
  });

  it("la regia può nominare un leader in qualsiasi momento, ma solo tra chi è nella stanza", () => {
    const s = inRound(8);
    const p = inRoom(s, 1)[0]!;
    expect(cmd(s, { type: "set-leader", room: 1, playerId: p }, 1100).rooms[1].leader).toBe(p);
    expect(cmd(s, { type: "set-leader", room: 0, playerId: p }, 1100)).toBe(s);
  });
});

describe("stanze-col-botto: fine del round, blocco e ostaggi", () => {
  it("allo scadere del round, con entrambi i leader, si blocca e si rivelano subito", () => {
    const s = bothLeaders(inRound(8));
    expect(s.revealedLeaders).toEqual([null, null]);
    const end = scb.onTick(s, 1000 + 180_000);
    expect(end.phase).toBe("hostages");
    expect(end.rooms.every((r) => r.leaderLocked)).toBe(true);
    expect(end.revealedLeaders).toEqual([s.rooms[0].leader, s.rooms[1].leader]);
    expect(end.revealedRound).toBe(0);
  });

  it("una stanza senza leader ha il tempo di eleggerlo, poi lo estrae il server", () => {
    let s = elect(inRound(8), 0);
    s = scb.onTick(s, 1000 + 180_000);
    expect(s.phase).toBe("lock");
    expect(s.revealedLeaders).toEqual([null, null]);
    expect(s.rooms[0].leaderLocked).toBe(true);
    expect(scb.onTick(s, s.phaseEndsAt! - 1)).toBe(s);
    const drawn = scb.onTick(s, s.phaseEndsAt!);
    expect(drawn.phase).toBe("hostages");
    expect(inRoom(drawn, 1)).toContain(drawn.rooms[1].leader);
  });

  it("nel tempo di elezione la stanza senza leader può votare o nominare, quella con leader no", () => {
    let s = elect(inRound(8), 0);
    s = scb.onTick(s, 1000 + 180_000);
    const [x, y] = inRoom(s, 1) as [string, string];
    const [m, n] = inRoom(s, 0).filter((p) => p !== s.rooms[0].leader) as [string, string];
    expect(input(s, m, { type: "appoint", targetId: n }, s.phaseStartedAt + 10)).toBe(s);
    const done = input(s, x, { type: "appoint", targetId: y }, s.phaseStartedAt + 10);
    expect(done.phase).toBe("hostages");
    expect(done.revealedLeaders).toEqual([s.rooms[0].leader, y]);
  });

  it("il leader non può essere ostaggio e le scelte rispettano il numero di ostaggi", () => {
    let s = scb.onTick(bothLeaders(inRound(12)), 1000 + 180_000);
    expect(hostagesNeeded(s)).toBe(2);
    const leader = s.rooms[0].leader!;
    const mates = inRoom(s, 0).filter((p) => p !== leader);
    expect(input(s, leader, { type: "pick-hostages", playerIds: [leader] }, 200_000)).toBe(s);
    expect(input(s, leader, { type: "pick-hostages", playerIds: mates.slice(0, 3) }, 200_000)).toBe(s);
    expect(input(s, leader, { type: "pick-hostages", playerIds: [inRoom(s, 1)[1]!] }, 200_000)).toBe(s);
    expect(input(s, mates[0]!, { type: "pick-hostages", playerIds: [mates[1]!] }, 200_000)).toBe(s);
    s = input(s, leader, { type: "pick-hostages", playerIds: mates.slice(0, 2) }, 200_000);
    expect(s.rooms[0].hostagePicks).toEqual(mates.slice(0, 2));
    expect(input(s, leader, { type: "confirm-hostages" }, 200_000).rooms[0].hostagesConfirmed).toBe(true);
  });

  it("non si conferma con meno ostaggi del dovuto", () => {
    const s = scb.onTick(bothLeaders(inRound(12)), 1000 + 180_000);
    const leader = s.rooms[0].leader!;
    const one = input(s, leader, { type: "pick-hostages", playerIds: [inRoom(s, 0).find((p) => p !== leader)!] }, 200_000);
    expect(input(one, leader, { type: "confirm-hostages" }, 200_000)).toBe(one);
  });

  /** Entrambi i leader scelgono e confermano; lo scambio avviene subito. */
  function exchanged(n = 8): State {
    let s = scb.onTick(bothLeaders(inRound(n)), 1000 + 180_000);
    for (const r of [0, 1] as RoomId[]) {
      const leader = s.rooms[r].leader!;
      const picks = inRoom(s, r).filter((p) => p !== leader).slice(0, hostagesNeeded(s));
      s = input(s, leader, { type: "pick-hostages", playerIds: picks }, 200_000);
      s = input(s, leader, { type: "confirm-hostages" }, 200_000);
    }
    return s;
  }

  it("quando entrambi confermano, lo scambio avviene e le stanze restano bilanciate", () => {
    const before = bothLeaders(inRound(8));
    const s = exchanged(8);
    expect(s.phase).toBe("exchange");
    expect(s.exchanges).toHaveLength(1);
    expect(s.exchanges[0]!.moved).toHaveLength(2);
    expect(inRoom(s, 0)).toHaveLength(4);
    for (const m of s.exchanges[0]!.moved) {
      expect(before.room[m.playerId]).toBe(m.from);
      expect(s.room[m.playerId]).toBe(m.to);
    }
  });

  it("allo scadere di `hostageSeconds` il server completa le scelte mancanti a caso", () => {
    const s = scb.onTick(bothLeaders(inRound(8)), 1000 + 180_000);
    const done = scb.onTick(s, s.phaseEndsAt!);
    expect(done.phase).toBe("exchange");
    expect(done.exchanges[0]!.moved).toHaveLength(2);
    expect(done.exchanges[0]!.moved.some((m) => m.playerId === s.rooms[m.from].leader)).toBe(false);
  });

  it("le scelte del leader a metà (non confermate) vengono tenute e completate", () => {
    let s = scb.onTick(bothLeaders(inRound(12)), 1000 + 180_000);
    const leader = s.rooms[0].leader!;
    const mate = inRoom(s, 0).find((p) => p !== leader)!;
    s = input(s, leader, { type: "pick-hostages", playerIds: [mate] }, 200_000);
    const done = scb.onTick(s, s.phaseEndsAt!);
    expect(done.exchanges[0]!.moved.filter((m) => m.from === 0).map((m) => m.playerId)).toContain(mate);
    expect(done.exchanges[0]!.moved.filter((m) => m.from === 0)).toHaveLength(2);
  });

  it("scelte arrivate entro GRACE_MS dallo scadere del round sono accettate, dopo no", () => {
    const s = bothLeaders(inRound(12));
    const leader = s.rooms[0].leader!;
    const mates = inRoom(s, 0).filter((p) => p !== leader);
    const end = 1000 + 180_000;
    expect(input(s, leader, { type: "pick-hostages", playerIds: [mates[0]!] }, end + GRACE_MS - 1).rooms[0].hostagePicks).toEqual([mates[0]]);
    expect(input(s, leader, { type: "pick-hostages", playerIds: [mates[0]!] }, end + GRACE_MS + 1)).toBe(s);
    expect(input(s, mates[0]!, { type: "vote-leader", targetId: mates[1]! }, end + GRACE_MS + 1)).toBe(s);
  });
});

describe("stanze-col-botto: avvio del round successivo", () => {
  function atExchange() {
    let s = scb.onTick(bothLeaders(inRound(8)), 1000 + 180_000);
    s = scb.onTick(s, s.phaseEndsAt!);
    return s;
  }

  it("parte quando entrambi i leader hanno premuto", () => {
    let s = atExchange();
    const t = s.phaseStartedAt;
    s = input(s, s.rooms[0].leader!, { type: "start-round" }, t + 1000);
    expect(s.phase).toBe("exchange");
    s = input(s, s.rooms[1].leader!, { type: "start-round" }, t + 2000);
    expect(s.phase).toBe("round");
    expect(s.round).toBe(1);
    expect(s.phaseEndsAt).toBe(t + 2000 + 120_000);
  });

  it("parte 5 secondi dopo il primo che ha premuto, e la stessa pressione non si ripete", () => {
    let s = atExchange();
    const t = s.phaseStartedAt;
    s = input(s, s.rooms[0].leader!, { type: "start-round" }, t + 1000);
    expect(s.phaseEndsAt).toBe(t + 6000);
    expect(input(s, s.rooms[0].leader!, { type: "start-round" }, t + 2000)).toBe(s);
    expect(scb.onTick(s, t + 5999).phase).toBe("exchange");
    expect(scb.onTick(s, t + 6000).phase).toBe("round");
  });

  it("parte comunque 15 secondi dopo lo scambio; una pressione tardiva non lo ritarda né lo anticipa", () => {
    const s = atExchange();
    const t = s.phaseStartedAt;
    expect(s.phaseEndsAt).toBe(t + 15_000);
    expect(scb.onTick(s, t + 15_000).phase).toBe("round");
    expect(input(s, s.rooms[0].leader!, { type: "start-round" }, t + 15_000)).toBe(s);
  });

  it("parte con l'ok della regia; i giocatori che non sono leader non possono premere", () => {
    const s = atExchange();
    const other = s.players.find((p) => p !== s.rooms[0].leader && p !== s.rooms[1].leader)!;
    expect(input(s, other, { type: "start-round" }, s.phaseStartedAt + 10)).toBe(s);
    expect(cmd(s, { type: "start-round" }, s.phaseStartedAt + 10).phase).toBe("round");
  });

  it("il leader resta in carica e torna sbloccato; i voti ripartono da zero", () => {
    let s = atExchange();
    const lead = s.rooms[0].leader!;
    s = cmd(s, { type: "start-round" }, s.phaseStartedAt + 10);
    expect(s.rooms[0].leader).toBe(lead);
    expect(s.rooms[0].leaderLocked).toBe(false);
    expect(s.rooms[0].hostagePicks).toEqual([]);
  });

  it("un cambio di leader nel round successivo resta nascosto all'altra stanza e allo schermo fino al blocco", () => {
    let s = atExchange();
    const oldLeader = s.rooms[0].leader!;
    s = cmd(s, { type: "start-round" }, s.phaseStartedAt + 10);
    const newLeader = inRoom(s, 0).find((p) => p !== oldLeader)!;
    s = cmd(s, { type: "set-leader", room: 0, playerId: newLeader }, s.phaseStartedAt + 100);
    const screen = scb.screenView(s) as { leaders: ({ id: string } | null)[]; leadersFresh: boolean };
    expect(screen.leaders[0]?.id).toBe(oldLeader);
    expect(screen.leadersFresh).toBe(false);
    const other = inRoom(s, 1)[0]!;
    expect((scb.viewFor(s, other, null) as { leaders: ({ id: string } | null)[] }).leaders[0]?.id).toBe(oldLeader);
    expect((scb.viewFor(s, inRoom(s, 0)[0]!, null) as { me: { leader: { id: string } } }).me.leader.id).toBe(newLeader);
    const blocked = scb.onTick(s, s.phaseEndsAt!);
    expect((scb.screenView(blocked) as { leaders: ({ id: string } | null)[] }).leaders[0]?.id).toBe(newLeader);
  });
});

describe("stanze-col-botto: fine partita", () => {
  /** Porta la partita all'ultimo scambio lasciando fare tutto al tempo. */
  function toGamble(n: number) {
    let s = inRound(n);
    let t = 1000;
    for (let i = 0; i < 40 && s.phase !== "gamble" && s.phase !== "reveal"; i++) {
      t = (s.phaseEndsAt ?? t) + 1;
      s = scb.onTick(s, t);
    }
    return s;
  }

  it("senza regia né leader la partita arriva comunque alla fine e il vincitore dipende dalle stanze", () => {
    for (const n of [6, 8, 9]) {
      const s = toGamble(n);
      expect(s.exchanges).toHaveLength(3);
      expect(["gamble", "reveal"]).toContain(s.phase);
      expect(s.round).toBe(2);
    }
  });

  it("con un numero dispari c'è la previsione del Giocatore d'azzardo; con un numero pari si rivela subito", () => {
    expect(toGamble(9).phase).toBe("gamble");
    expect(toGamble(8).phase).toBe("reveal");
  });

  /** Sistema Presidente e Bombarolo nella stanza voluta, saltando i round. */
  function reveal(sameRoom: boolean, n = 8) {
    const s = toGamble(n);
    const president = cardOf(s, "president");
    const bomber = cardOf(s, "bomber");
    const room = { ...s.room, [bomber]: sameRoom ? s.room[president]! : (((s.room[president]! + 1) % 2) as RoomId) };
    return { s: scb.onTick({ ...s, room, phase: "gamble" as const, phaseEndsAt: 0, gamblerGuess: null }, 1), president, bomber };
  }

  it("stesso locale: vince la Rossa; locali diversi: vince la Blu", () => {
    expect(reveal(true).s.outcome).toMatchObject({ winner: "red", sameRoom: true });
    expect(reveal(false).s.outcome).toMatchObject({ winner: "blue", sameRoom: false });
  });

  it("punti: ogni membro della squadra vincitrice riceve gli stessi punti", () => {
    const { s } = reveal(true);
    const scored = scb.scores(s);
    const winners = s.players.filter((p) => s.cards[p]!.team === "red");
    expect(scored.map((d) => d.playerId).sort()).toEqual(winners.sort());
    expect(new Set(scored.map((d) => d.points))).toEqual(new Set([100]));
    expect(scb.result(s).ranking[0]!.points).toBe(100);
  });

  it("Giocatore d'azzardo: vince se indovina, solo lui può dichiarare e solo nella sua fase", () => {
    let s = toGamble(9);
    expect(s.phase).toBe("gamble");
    const gambler = cardOf(s, "gambler");
    const other = s.players.find((p) => p !== gambler)!;
    expect(input(s, other, { type: "gamble", team: "blue" }, s.phaseStartedAt + 1)).toBe(s);
    const sameRoom = s.room[cardOf(s, "president")] === s.room[cardOf(s, "bomber")];
    const right = input(s, gambler, { type: "gamble", team: sameRoom ? "red" : "blue" }, s.phaseStartedAt + 1);
    expect(right.phase).toBe("reveal");
    expect(scb.scores(right).find((d) => d.playerId === gambler)?.points).toBe(100);
    const wrong = input(s, gambler, { type: "gamble", team: sameRoom ? "blue" : "red" }, s.phaseStartedAt + 1);
    expect(scb.scores(wrong).find((d) => d.playerId === gambler)).toBeUndefined();
    s = scb.onTick(s, s.phaseEndsAt!);
    expect(s.phase).toBe("reveal");
    expect(s.gamblerGuess).toBeNull();
  });

  it("`next` nella rivelazione chiude il round; prima non fa nulla", () => {
    const { s } = reveal(false);
    expect(cmd(s, { type: "next" }, 5).phase).toBe("done");
    expect(scb.isFinished(cmd(s, { type: "next" }, 5))).toBe(true);
    expect(scb.isFinished(s)).toBe(false);
  });
});

describe("stanze-col-botto: tempo e regia", () => {
  it("pausa e ripresa fermano e riprendono il timer; un round in pausa non scade", () => {
    const s = inRound(8);
    const p = cmd(s, { type: "pause" }, 5000);
    expect(p.pausedRemainingMs).toBe(1000 + 180_000 - 5000);
    expect(scb.onTick(p, 10_000_000)).toBe(p);
    const r = cmd(p, { type: "resume" }, 9000);
    expect(r.phaseEndsAt).toBe(9000 + p.pausedRemainingMs!);
  });

  it("`end-round` chiude il round prima del tempo", () => {
    expect(cmd(bothLeaders(inRound(8)), { type: "end-round" }, 5000).phase).toBe("hostages");
    expect(cmd(inRound(8), { type: "start-round" }, 5000)).toEqual(inRound(8));
  });

  it("spostare un giocatore leader lo toglie dalla carica; le sue offerte pendenti decadono", () => {
    let s = bothLeaders(inRound(8));
    const leader = s.rooms[0].leader!;
    const mate = inRoom(s, 0).find((p) => p !== leader)!;
    s = input(s, mate, { type: "share-offer", kind: "card", targetId: leader }, 1500);
    s = cmd(s, { type: "move-player", playerId: leader, room: 1 }, 1600);
    expect(s.rooms[0].leader).toBeNull();
    expect(s.room[leader]).toBe(1);
    expect(s.shares[0]!.status).toBe("expired");
  });

  it("il contratto della partita è il minimo di 6 e il massimo di 30 giocatori", () => {
    expect(scb.minPlayers).toBe(6);
    expect(scb.maxPlayers).toBe(30);
  });
});

describe("stanze-col-botto: Mostra e Scambia", () => {
  const colorCfg = scb.configSchema.parse({ ...scb.sampleConfig, colorShare: "always" });

  it("«Mostra» è a senso unico: chi guarda sa la carta, chi mostra non sa nulla in cambio", () => {
    let s = inRound(8);
    const [a, b] = inRoom(s, 0) as [string, string];
    s = input(s, a, { type: "reveal", kind: "card", targetId: b }, 1100);
    expect(knownBy(s, b)).toEqual([{ playerId: a, level: "card", seq: 1 }]);
    expect(knownBy(s, a)).toEqual([]);
  });

  it("«Mostra» a tutta la stanza raggiunge tutti i presenti ma non l'altra stanza", () => {
    let s = inRound(8);
    const [a, ...rest] = inRoom(s, 0);
    s = input(s, a!, { type: "reveal", kind: "card", targetId: null }, 1100);
    for (const p of rest) expect(knownBy(s, p).map((k) => k.playerId)).toEqual([a]);
    for (const p of inRoom(s, 1)) expect(knownBy(s, p)).toEqual([]);
    expect(s.shares[0]!.kind).toBe("public-card");
  });

  it("solo nella stessa stanza e mai a sé stessi", () => {
    const s = inRound(8);
    const [a] = inRoom(s, 0) as [string];
    expect(input(s, a, { type: "reveal", kind: "card", targetId: inRoom(s, 1)[0]! }, 1100)).toBe(s);
    expect(input(s, a, { type: "reveal", kind: "card", targetId: a }, 1100)).toBe(s);
    expect(input(s, a, { type: "share-offer", kind: "card", targetId: inRoom(s, 1)[0]! }, 1100)).toBe(s);
  });

  it("il colore con 8 giocatori è vietato (auto), ammesso con `always`", () => {
    const s = inRound(8);
    const [a, b] = inRoom(s, 0) as [string, string];
    expect(input(s, a, { type: "reveal", kind: "color", targetId: b }, 1100)).toBe(s);
    expect(input(s, a, { type: "share-offer", kind: "color", targetId: b }, 1100)).toBe(s);
    const c = inRound(8, colorCfg);
    const shown = input(c, a, { type: "reveal", kind: "color", targetId: b }, 1100);
    expect(knownBy(shown, b)).toEqual([{ playerId: a, level: "color", seq: 1 }]);
  });

  it("«Scambia» richiede consenso e dà la carta a entrambi nello stesso istante", () => {
    let s = inRound(8);
    const [a, b] = inRoom(s, 0) as [string, string];
    s = input(s, a, { type: "share-offer", kind: "card", targetId: b }, 1100);
    expect(knownBy(s, a)).toEqual([]);
    expect(knownBy(s, b)).toEqual([]);
    expect(input(s, a, { type: "share-answer", seq: 1, accept: true }, 1200)).toBe(s); // non è il destinatario
    s = input(s, b, { type: "share-answer", seq: 1, accept: true }, 1200);
    expect(knownBy(s, a)).toEqual([{ playerId: b, level: "card", seq: 1 }]);
    expect(knownBy(s, b)).toEqual([{ playerId: a, level: "card", seq: 1 }]);
  });

  it("«Scambia» rifiutato non rivela nulla; una sola offerta in attesa per giocatore; scade dopo 20 secondi", () => {
    let s = inRound(8);
    const [a, b, c] = inRoom(s, 0) as [string, string, string];
    s = input(s, a, { type: "share-offer", kind: "card", targetId: b }, 1100);
    expect(input(s, a, { type: "share-offer", kind: "card", targetId: c }, 1100)).toBe(s);
    expect(input(s, c, { type: "share-offer", kind: "card", targetId: b }, 1100)).toBe(s);
    const declined = input(s, b, { type: "share-answer", seq: 1, accept: false }, 1200);
    expect(declined.shares[0]!.status).toBe("declined");
    expect(knownBy(declined, a)).toEqual([]);
    expect(scb.onTick(s, 1100 + 20_000).shares[0]!.status).toBe("expired");
    expect(scb.onTick(s, 1100 + 19_000)).toBe(s);
  });

  it("il livello «carta» prevale su «colore» e la lista è ordinata dal più recente", () => {
    let s = inRound(8, colorCfg);
    const [a, b, c] = inRoom(s, 0) as [string, string, string];
    s = input(s, a, { type: "reveal", kind: "card", targetId: c }, 1100);
    s = input(s, a, { type: "reveal", kind: "color", targetId: c }, 1200);
    s = input(s, b, { type: "reveal", kind: "color", targetId: c }, 1300);
    expect(knownBy(s, c).map((k) => [k.playerId, k.level])).toEqual([[b, "color"], [a, "card"]]);
  });

  it("nulla si può fare fuori dal round", () => {
    const s = cmd(scb.init(config, ctxOf(8), 0), { type: "deal" }, 1);
    const [a, b] = inRoom(s, 0) as [string, string];
    expect(input(s, a, { type: "reveal", kind: "card", targetId: b }, 2)).toBe(s);
    expect(input(s, a, { type: "share-offer", kind: "card", targetId: b }, 2)).toBe(s);
  });
});

describe("stanze-col-botto: scambio di persona con i QR", () => {
  const qrCfg = scb.configSchema.parse({ ...scb.sampleConfig, shareMethod: "qr" });
  const bothCfg = scb.configSchema.parse({ ...scb.sampleConfig, shareMethod: "both" });
  const colorQr = scb.configSchema.parse({ ...scb.sampleConfig, shareMethod: "qr", colorShare: "always" });
  const scan = (s: State, who: string, whose: string, at: number, kind: "card" | "color" = "card") => input(s, who, { type: "scan-peer", code: s.qrCodes[whose]!, kind }, at);
  type Me = { qrSwap: boolean; qrCode: string | null; appSwap: boolean; scanOut: { to: { id: string } } | null; scanIn: { id: string }[] };
  const meOf = (s: State, p: string) => (scb.viewFor(s, p, null) as { me: Me }).me;

  it("di default si scambia dall'app: nessun codice nelle viste e le scansioni sono ignorate", () => {
    expect(config.shareMethod).toBe("app");
    const s = inRound(8);
    const a = inRoom(s, 0)[0]!;
    expect(s.qrCodes).toEqual({});
    expect(meOf(s, a)).toMatchObject({ qrSwap: false, qrCode: null, appSwap: true });
    expect(input(s, a, { type: "scan-peer", code: "ABCDEF", kind: "card" }, 1100)).toBe(s);
  });

  it("ogni giocatore ha un codice diverso, deterministico dal seme", () => {
    const s = scb.init(qrCfg, ctxOf(30), 0);
    const codes = Object.values(s.qrCodes);
    expect(codes).toHaveLength(30);
    expect(new Set(codes).size).toBe(30);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(scb.init(qrCfg, ctxOf(30), 0).qrCodes).toEqual(s.qrCodes);
  });

  it("solo QR: «Scambia» dall'app è rifiutato, «Mostra» resta; con «both» valgono entrambi", () => {
    const s = inRound(8, qrCfg);
    const [a, b] = inRoom(s, 0) as [string, string];
    expect(input(s, a, { type: "share-offer", kind: "card", targetId: b }, 1100)).toBe(s);
    expect(knownBy(input(s, a, { type: "reveal", kind: "card", targetId: b }, 1100), b)).toHaveLength(1);
    expect(meOf(s, a)).toMatchObject({ appSwap: false, qrSwap: true });
    const both = inRound(8, bothCfg);
    expect(input(both, a, { type: "share-offer", kind: "card", targetId: b }, 1100).shares).toHaveLength(1);
    expect(meOf(both, a)).toMatchObject({ appSwap: true, qrSwap: true });
  });

  it("una sola scansione non rivela nulla: la vede solo chi è stato inquadrato, come richiesta di ricambiare", () => {
    let s = inRound(8, qrCfg);
    const [a, b, c] = inRoom(s, 0) as [string, string, string];
    s = scan(s, a, b, 1100);
    expect(s.shares).toEqual([]);
    expect(knownBy(s, a)).toEqual([]);
    expect(knownBy(s, b)).toEqual([]);
    expect(meOf(s, a).scanOut?.to.id).toBe(b);
    expect(meOf(s, b).scanIn.map((p) => p.id)).toEqual([a]);
    expect(meOf(s, c)).toMatchObject({ scanOut: null, scanIn: [] });
  });

  it("la scansione reciproca, in qualunque ordine, dà la carta a entrambi nello stesso istante", () => {
    for (const [first, second] of [[0, 1], [1, 0]] as const) {
      let s = inRound(8, qrCfg);
      const pair = inRoom(s, 0) as [string, string];
      s = scan(s, pair[first]!, pair[second]!, 1100);
      s = scan(s, pair[second]!, pair[first]!, 1200);
      expect(knownBy(s, pair[0]).map((k) => [k.playerId, k.level])).toEqual([[pair[1], "card"]]);
      expect(knownBy(s, pair[1]).map((k) => [k.playerId, k.level])).toEqual([[pair[0], "card"]]);
      expect(s.scans).toEqual([]);
      expect(s.shares[0]).toMatchObject({ kind: "card-share", status: "accepted" });
      expect(meOf(s, pair[0])).toMatchObject({ scanOut: null, scanIn: [] });
    }
  });

  it("le scansioni a un terzo non completano lo scambio e chi riscansiona sostituisce la propria", () => {
    let s = inRound(8, qrCfg);
    const [a, b, c] = inRoom(s, 0) as [string, string, string];
    s = scan(s, a, b, 1100);
    s = scan(s, c, a, 1150);
    expect(s.shares).toEqual([]);
    s = scan(s, a, c, 1200); // a ha cambiato idea: ora inquadra c, che lo aveva già inquadrato
    expect(knownBy(s, a).map((k) => k.playerId)).toEqual([c]);
    expect(knownBy(s, b)).toEqual([]);
  });

  it("codice sbagliato, proprio, di un'altra stanza o con la stanza cambiata: ignorato", () => {
    const s = inRound(8, qrCfg);
    const [a, b] = inRoom(s, 0) as [string, string];
    const far = inRoom(s, 1)[0]!;
    expect(input(s, a, { type: "scan-peer", code: "ZZZZZZ", kind: "card" }, 1100)).toBe(s);
    expect(scan(s, a, a, 1100)).toBe(s);
    expect(scan(s, a, far, 1100)).toBe(s);
    expect(input(s, a, { type: "scan-peer", code: s.qrCodes[b]!.toLowerCase(), kind: "card" }, 1100).scans).toHaveLength(1);
    const moved = cmd(scan(s, a, b, 1100), { type: "move-player", playerId: b, room: 1 }, 1150);
    expect(moved.scans).toEqual([]);
  });

  it("se uno dei due sceglie il solo colore, si scambia il colore; con 8 giocatori il colore è vietato", () => {
    const [a, b] = inRoom(inRound(8, colorQr), 0) as [string, string];
    let s = inRound(8, colorQr);
    s = scan(s, a, b, 1100, "color");
    s = scan(s, b, a, 1200, "card");
    expect(knownBy(s, a).map((k) => k.level)).toEqual(["color"]);
    expect(knownBy(s, b).map((k) => k.level)).toEqual(["color"]);
    const plain = inRound(8, qrCfg);
    expect(scan(plain, a, b, 1100, "color")).toBe(plain);
  });

  it("l'altro ha 30 secondi per ricambiare; poi la scansione decade", () => {
    let s = inRound(8, qrCfg);
    const [a, b] = inRoom(s, 0) as [string, string];
    s = scan(s, a, b, 1100);
    expect(scb.onTick(s, 1100 + 29_000).scans).toHaveLength(1);
    expect(scb.onTick(s, 1100 + 30_000).scans).toEqual([]);
    const late = scan(s, b, a, 1100 + 30_000);
    expect(late.shares).toEqual([]);
    expect(late.scans).toHaveLength(1); // ora è b ad aspettare
  });

  it("i QR ruotano ogni 20 secondi; il codice appena scaduto vale ancora, quello di due giri fa no", () => {
    let s = inRound(8, qrCfg);
    const [a, b] = inRoom(s, 0) as [string, string];
    const first = s.qrCodes[b]!;
    expect(scb.onTick(s, s.qrAt + 19_000)).toBe(s);
    s = scb.onTick(s, s.qrAt + 20_000);
    expect(s.qrCodes[b]).not.toBe(first);
    expect(s.qrPrev[b]).toBe(first);
    expect(input(s, a, { type: "scan-peer", code: first, kind: "card" }, s.qrAt + 1).scans).toHaveLength(1);
    const again = scb.onTick(s, s.qrAt + 20_000);
    expect(input(again, a, { type: "scan-peer", code: first, kind: "card" }, again.qrAt + 1)).toBe(again);
    expect(meOf(s, b).qrCode).toBe(s.qrCodes[b]);
  });

  it("niente scambi fuori dal round, in pausa o a round chiuso; le scansioni non passano al round dopo", () => {
    let s = inRound(8, qrCfg);
    const [a, b] = inRoom(s, 0) as [string, string];
    const paused = cmd(s, { type: "pause" }, 1100);
    expect(scan(paused, a, b, 1200)).toBe(paused);
    expect(meOf(paused, a)).toMatchObject({ qrSwap: false, qrCode: null });
    s = scan(s, a, b, 1100);
    s = scb.onTick(s, s.phaseEndsAt! + 1);
    expect(s.phase).not.toBe("round");
    expect(s.scans).toEqual([]);
    expect(meOf(s, a).qrCode).toBeNull();
    expect(scan(s, b, a, s.phaseEndsAt ?? 5_000_000)).toBe(s);
  });

  it("anti-leak: il QR è solo nella vista del proprietario; schermo, regia e altri non lo ricevono", () => {
    const base = inRound(8, qrCfg);
    const [a, b] = inRoom(base, 0) as [string, string];
    for (const s of [base, scan(base, a, b, 1100), scan(scan(base, a, b, 1100), b, a, 1200)]) {
      for (const p of s.players) {
        const json = JSON.stringify(scb.viewFor(s, p, null));
        for (const q of s.players) {
          if (q !== p) expect(json, `${p} non deve vedere il codice di ${q}`).not.toContain(s.qrCodes[q]!);
        }
        expect(json).toContain(s.qrCodes[p]!);
      }
      for (const view of [scb.screenView(s), scb.hostView!(s), scb.hostView!({ ...s, blind: true })]) {
        const json = JSON.stringify(view);
        for (const code of Object.values(s.qrCodes)) expect(json).not.toContain(code);
        expect(json).not.toContain("qrCodes");
      }
    }
  });

  it("anti-leak: dopo una scansione sola nessuna carta è nelle viste, né di chi scansiona né di chi è inquadrato", () => {
    const start = inRound(8, qrCfg);
    const [a, b] = inRoom(start, 0) as [string, string];
    const s = scan(start, a, b, 1100);
    const secrets = ["president", "bomber", "blue-member", "red-member", "gambler"];
    for (const p of [a, b]) {
      const me = meOf(s, p) as unknown as { known: unknown[] };
      expect(me.known).toEqual([]);
      const view = scb.viewFor(s, p, null) as { me: { card: { character: string } } };
      const json = JSON.stringify({ ...view, me: { ...view.me, card: null } });
      for (const secret of secrets) expect(json, `${p} vede ${secret}`).not.toContain(secret);
    }
  });
});

describe("stanze-col-botto: anti-leak", () => {
  const mustNot =(v: unknown, ...secrets: string[]) => {
    const json = JSON.stringify(v);
    for (const secret of secrets) expect(json, secret).not.toContain(secret);
  };

  /** Scorre tutta la partita guardando le viste a ogni passo. */
  function walk(n: number, check: (s: State, t: number) => void) {
    let s = scb.init(config, ctxOf(n), 0);
    check(s, 0);
    s = cmd(s, { type: "deal" }, 10);
    check(s, 10);
    s = cmd(s, { type: "start-round" }, 1000);
    check(s, 1000);
    let t = 1000;
    for (let i = 0; i < 40 && s.phase !== "reveal"; i++) {
      if (s.phase === "round" && i < 3) s = bothLeaders(s);
      check(s, t);
      t = (s.phaseEndsAt ?? t) + 1;
      s = scb.onTick(s, t);
      check(s, t);
    }
    return s;
  }

  it("lo schermo non mostra mai le carte né i personaggi prima della rivelazione", () => {
    walk(9, (s) => {
      const view = scb.screenView(s);
      if (s.phase !== "reveal" && s.phase !== "done") {
        mustNot(view, '"cards"', "president", "bomber", "blue-member", "red-member", "gambler", '"team"');
        mustNot(view, "outcome");
      }
    });
  });

  it("nessuno vede le carte altrui prima della rivelazione senza una condivisione", () => {
    walk(9, (s) => {
      if (s.phase === "reveal" || s.phase === "done") return;
      for (const p of s.players) {
        const view = scb.viewFor(s, p, null) as { me: { card: { character: string } | null } };
        const mine = s.cards[p];
        const json = JSON.stringify(view);
        for (const q of s.players) {
          if (q === p || !s.cards[q]) continue;
          // La carta di q non deve comparire: né il suo personaggio in forma di campo `card` altrui.
          expect(json.includes(`"playerId":"${q}","nickname":"Nick-${q}","seq"`)).toBe(false);
        }
        expect(view.me.card?.character).toBe(mine?.character);
        mustNot(view, '"cards"', '"outcome"');
      }
    });
  });

  it("una condivisione di colore non manda mai il personaggio", () => {
    const colorCfg = scb.configSchema.parse({ ...scb.sampleConfig, colorShare: "always" });
    let s = inRound(8, colorCfg);
    const [a, b, c] = inRoom(s, 0) as [string, string, string];
    s = input(s, a, { type: "reveal", kind: "color", targetId: b }, 1100);
    s = input(s, c, { type: "share-offer", kind: "color", targetId: b }, 1100);
    s = input(s, b, { type: "share-answer", seq: 2, accept: true }, 1200);
    const view = scb.viewFor(s, b, null) as { me: { known: { card: object }[] } };
    expect(view.me.known).toHaveLength(2);
    for (const k of view.me.known) expect(Object.keys(k.card)).toEqual(["team"]);
    mustNot(view.me.known, "president", "bomber", "member", "gambler");
  });

  it("nel viewFor c'è solo ciò che si è visto: il Mostra arriva al destinatario e non agli altri", () => {
    let s = inRound(8);
    const [a, b, c] = inRoom(s, 0) as [string, string, string];
    s = input(s, a, { type: "reveal", kind: "card", targetId: b }, 1100);
    const known = (p: string) => (scb.viewFor(s, p, null) as { me: { known: { playerId: string }[] } }).me.known.map((k) => k.playerId);
    expect(known(b)).toEqual([a]);
    expect(known(a)).toEqual([]);
    expect(known(c)).toEqual([]);
  });

  it("leader e voti di una stanza non arrivano all'altra né allo schermo prima del blocco", () => {
    let s = inRound(8);
    const [a, b] = inRoom(s, 0) as [string, string];
    s = input(s, a, { type: "vote-leader", targetId: b }, 1100);
    s = elect(s, 0);
    const lead = s.rooms[0].leader!;
    for (const p of inRoom(s, 1)) {
      const v = scb.viewFor(s, p, null) as { leaders: unknown[]; me: { leader: unknown; votes: object } };
      expect(v.leaders).toEqual([null, null]);
      expect(v.me.leader).toBeNull();
      expect(v.me.votes).toEqual({});
    }
    const screen = scb.screenView(s) as { leaders: unknown[] };
    expect(screen.leaders).toEqual([null, null]);
    expect((scb.viewFor(s, a, null) as { me: { leader: { id: string } } }).me.leader.id).toBe(lead);
    mustNot(scb.screenView(s), "leaderVotes");
  });

  it("gli ostaggi in preparazione li vede la stanza ma non l'altra stanza né lo schermo", () => {
    let s = scb.onTick(bothLeaders(inRound(12)), 1000 + 180_000);
    const leader = s.rooms[0].leader!;
    const picks = inRoom(s, 0).filter((p) => p !== leader).slice(0, 2);
    s = input(s, leader, { type: "pick-hostages", playerIds: picks }, 200_000);
    const mate = inRoom(s, 0).find((p) => p !== leader)!;
    expect((scb.viewFor(s, mate, null) as { me: { hostagePicks: string[] } }).me.hostagePicks).toEqual(picks);
    expect((scb.viewFor(s, inRoom(s, 1)[0]!, null) as { me: { hostagePicks: string[] } }).me.hostagePicks).toEqual([]);
    mustNot(scb.screenView(s), "hostagePicks", "picks");
    mustNot(scb.viewFor(s, inRoom(s, 1)[0]!, null), `"hostagePicks":["${picks[0]}`);
  });

  it("la previsione del Giocatore d'azzardo si vede solo alla rivelazione", () => {
    let s = inRound(9);
    s = bothLeaders(s);
    while (s.phase !== "gamble") s = scb.onTick(s, (s.phaseEndsAt ?? 0) + 1);
    const gambler = cardOf(s, "gambler");
    s = input(s, gambler, { type: "gamble", team: "blue" }, s.phaseStartedAt + 1);
    expect(s.phase).toBe("reveal");
    expect(scb.screenView(s)).toMatchObject({ gamblerGuess: "blue" });
  });

  it("alla rivelazione lo schermo mostra tutte le carte e l'esito", () => {
    const s = walk(8, () => {});
    expect(s.phase).toBe("reveal");
    const view = scb.screenView(s) as { cards: { card: { character: string } }[]; outcome: { winner: string } };
    expect(view.cards).toHaveLength(8);
    expect(["red", "blue"]).toContain(view.outcome.winner);
  });

  it("`hostView` normale vede tutto; in modalità cieca niente carte, condivisioni, voti e scelte", () => {
    let s = inRound(8);
    const [a, b] = inRoom(s, 0) as [string, string];
    s = input(s, a, { type: "reveal", kind: "card", targetId: b }, 1100);
    s = input(s, b, { type: "vote-leader", targetId: a }, 1100);
    const open = JSON.stringify(scb.hostView(s).info);
    expect(open).toContain("president");
    expect(open).toContain("shares");

    const blind = cmd(s, { type: "set-blind", blind: true }, 1200);
    const info = JSON.stringify(scb.hostView(blind).info);
    for (const secret of ["president", "bomber", "member", "gambler", "shares", "leaderVotes", "votes", "picks", "cards", "audience"]) expect(info, secret).not.toContain(secret);
    expect((scb.hostView(blind).info as { blind: boolean }).blind).toBe(true);
  });

  it("in modalità cieca la regia non può scegliere gli ostaggi; disattivarla dopo la distribuzione avvisa lo schermo", () => {
    let s = cmd(scb.onTick(bothLeaders(inRound(12)), 1000 + 180_000), { type: "set-blind", blind: true }, 200_000);
    const leader = s.rooms[0].leader!;
    const mate = inRoom(s, 0).find((p) => p !== leader)!;
    expect(cmd(s, { type: "set-hostages", room: 0, playerIds: [mate] }, 200_001)).toBe(s);
    expect((scb.screenView(s) as { hostSeesCards: boolean }).hostSeesCards).toBe(false);
    s = cmd(s, { type: "set-blind", blind: false }, 200_002);
    expect((scb.screenView(s) as { hostSeesCards: boolean }).hostSeesCards).toBe(true);
    expect(cmd(s, { type: "set-hostages", room: 0, playerIds: [mate] }, 200_003).rooms[0].hostagePicks).toEqual([mate]);
  });

  it("la regia cieca può comunque condurre: avviare, chiudere, mettere in pausa, nominare e spostare", () => {
    let s = cmd(scb.init(config, ctxOf(8), 0), { type: "set-blind", blind: true }, 1);
    s = cmd(s, { type: "deal" }, 2);
    s = cmd(s, { type: "start-round" }, 1000);
    expect(s.phase).toBe("round");
    const p = inRoom(s, 1)[0]!;
    expect(cmd(s, { type: "set-leader", room: 1, playerId: p }, 1100).rooms[1].leader).toBe(p);
    expect(cmd(s, { type: "pause" }, 1100).pausedRemainingMs).not.toBeNull();
  });

  it("nella fase di abbinamento nessuna carta è nelle viste", () => {
    const s = scb.init(config, ctxOf(8), 0);
    mustNot(scb.screenView(s), "president", '"card"');
    mustNot(scb.viewFor(s, "p1", null), "president", "bomber");
    mustNot(scb.hostView(s).info, "president");
  });

  it("i codici dei QR sono sullo schermo solo nella modalità QR e solo durante l'abbinamento", () => {
    const qr = scb.configSchema.parse({ ...scb.sampleConfig, roomAssignment: "qr" });
    const s = scb.init(qr, ctxOf(8), 0);
    expect((scb.screenView(s) as { pairing: { codes: string[] } }).pairing.codes).toEqual(s.roomCodes);
    const dealt = cmd(s, { type: "deal" }, 1);
    mustNot(scb.screenView(dealt), s.roomCodes[0], s.roomCodes[1]);
    const random = scb.init(config, ctxOf(8), 0);
    expect((scb.screenView(random) as { pairing: { codes: unknown } }).pairing.codes).toBeNull();
  });
});
