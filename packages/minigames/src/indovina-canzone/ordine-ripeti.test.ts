import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { COLLECT_WINDOW_MS, type IndovinaCanzoneState, indovinaCanzone as game } from "./index.js";

const ctx: MinigameContext = {
  players: ["a", "b", "c"].map((id) => ({ id, nickname: id.toUpperCase(), teamId: null })),
  teams: [],
  seed: 7,
};

const songs = (n: number) => Array.from({ length: n }, (_, i) => ({ audio: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111.mp3`, answer: `T${i}` }));
const make = (extra: Record<string, unknown> = {}, n = 12) => game.configSchema.parse({ songs: songs(n), ...extra });
const cmd = (s: IndovinaCanzoneState, type: string, now = 0) => game.onHostCommand(s, { type }, now);
const press = (s: IndovinaCanzoneState, id: string, at: number) => game.onInput(s, id, { type: "buzz" }, { receivedAt: at + 20, claimedTime: at, rtt: 40 });
const available = (s: IndovinaCanzoneState, id: string) => game.hostView!(s).actions.find((a: { id: string }) => a.id === id)!.enabled;

/** Gioca tutto il quiz senza risposte e restituisce l'ordine dei brani. */
function playAll(cfg: ReturnType<typeof make>): number[] {
  let s = game.init(cfg, ctx, 0);
  for (let guard = 0; guard < 2_000 && s.phase !== "done"; guard++) {
    if (s.phase === "choosing") s = game.onTick(s, s.pickDeadline + 1);
    else if (s.phase === "idle") s = cmd(s, "skip");
    else if (s.phase === "resolved") s = cmd(s, "next");
  }
  return s.used;
}

describe("indovina la canzone: più brani", () => {
  it("accetta fino a 1000 brani (e 1000 per round), non di più", () => {
    expect(game.configSchema.safeParse({ songs: songs(1000) }).success).toBe(true);
    expect(game.configSchema.safeParse({ songs: songs(1001) }).success).toBe(false);
    expect(game.configSchema.safeParse({ songs: songs(2), rounds: [{ selection: "host", songs: 1000 }] }).success).toBe(true);
  });
});

describe("indovina la canzone: ordine dei brani", () => {
  it("automatico e «in ordine»: senza categorie i brani escono come nell'elenco", () => {
    const order = Array.from({ length: 12 }, (_, i) => i);
    expect(playAll(make())).toEqual(order);
    expect(playAll(make({ songOrder: "listed" }))).toEqual(order);
  });

  it("«a caso»: tutti i brani una volta sola, in ordine diverso e ripetibile con lo stesso seme", () => {
    const a = playAll(make({ songOrder: "random" }));
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(a).not.toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(playAll(make({ songOrder: "random" }))).toEqual(a);
  });

  it("dentro un round per categoria «in ordine» prende i brani dell'elenco, uno dopo l'altro", () => {
    const list = songs(6).map((s, i) => ({ ...s, categories: [i % 2 === 0 ? "Pop" : "Rock"] }));
    const cfg = game.configSchema.parse({ songs: list, songOrder: "listed", rounds: [{ selection: "fixed", category: "Pop", songs: 3 }] });
    expect(playAll(cfg)).toEqual([0, 2, 4]);
  });
});

describe("indovina la canzone: ripeti il brano", () => {
  it("durante l'ascolto riparte dall'inizio e riapre le prenotazioni", () => {
    let s = cmd(game.init(make(), ctx, 0), "start", 1_000);
    s = press(s, "a", 4_000);
    s = game.onTick(s, 4_000 + COLLECT_WINDOW_MS + 100);
    expect(s.phase).toBe("answering");
    const r = cmd(s, "replay", 9_000);
    expect(r).toMatchObject({ phase: "playing", segmentStart: 9_000, offsetMs: 0, queue: [], locked: [], index: s.index });
    expect(game.screenView(r)).toMatchObject({ music: { playing: true, offsetMs: 0, segmentStart: 9_000 } });
    expect(game.viewFor(r, "a", null)).toMatchObject({ canBuzz: true });
  });

  it("a brano chiuso ritira i punti assegnati e il brano si può rifare prima di andare al successivo", () => {
    let s = cmd(game.init(make(), ctx, 0), "start", 0);
    s = press(s, "a", 1_000);
    s = game.onTick(s, 2_000);
    s = cmd(s, "correct", 2_000);
    expect(s.phase).toBe("resolved");
    expect(s.totals.a).toBeGreaterThan(0);
    const r = cmd(s, "replay", 3_000);
    expect(r.phase).toBe("playing");
    expect(r.totals.a ?? 0).toBe(0);
    expect(r.used).toEqual(s.used);
  });

  it("non vale prima di far partire la musica né in scelta categoria", () => {
    const s = game.init(make(), ctx, 0);
    expect(cmd(s, "replay", 5)).toBe(s);
    expect(available(s, "replay")).toBe(false);
    expect(available(cmd(s, "start", 1), "replay")).toBe(true);
  });
});

describe("indovina la canzone: numero di round fisso e round al volo", () => {
  const cfg = () => make({ roundCount: 2, roundSongs: 3, roundSelection: "host" }, 10);

  it("roundCount × roundSongs genera i round; il quiz finisce dopo l'ultimo", () => {
    expect(game.init(cfg(), ctx, 0).cfg.rounds).toHaveLength(2);
    expect(playAll(cfg())).toHaveLength(6);
  });

  it("alla fine la regia può aggiungere un round, e il quiz continua", () => {
    let s = game.init(cfg(), ctx, 0);
    // la regia sceglie la categoria di ogni round: una sola categoria («Altri brani») parte da sola
    for (let n = 0; n < 6; n++) {
      s = cmd(s, "skip");
      if (n < 5) s = cmd(s, "next");
    }
    expect(s.phase).toBe("resolved");
    expect(available(s, "addround")).toBe(true);
    s = cmd(s, "addround");
    expect(s.cfg.rounds).toHaveLength(3);
    s = cmd(s, "next");
    expect(s.phase).not.toBe("done");
    expect(s.round).toBe(2);
  });

  it("senza round, o senza brani da suonare, non si aggiunge nulla", () => {
    const plain = game.init(make(), ctx, 0);
    expect(available(plain, "addround")).toBe(false);
    expect(cmd(plain, "addround")).toBe(plain);
  });
});
