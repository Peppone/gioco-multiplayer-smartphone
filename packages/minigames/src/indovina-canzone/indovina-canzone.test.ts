import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { COLLECT_WINDOW_MS, type IndovinaCanzoneState, indovinaCanzone as game } from "./index.js";

const ctx: MinigameContext = {
  players: ["a", "b", "c"].map((id) => ({ id, nickname: id.toUpperCase(), teamId: null })),
  teams: [],
  seed: 1,
};

const FILE_1 = "11111111-1111-4111-8111-111111111111.mp3";
const FILE_2 = "22222222-2222-4222-8222-222222222222.mp3";

const config = game.configSchema.parse({
  songs: [
    { audio: FILE_1, answer: "TITOLO-SEGRETO-1", startSeconds: 5 },
    { audio: FILE_2, answer: "TITOLO-SEGRETO-2", points: 200 },
  ],
  clipSeconds: 30,
  maxPoints: 100,
  minPoints: 20,
  wrongPenalty: 50,
});

const cmd = (s: IndovinaCanzoneState, type: "start" | "correct" | "wrong" | "resume" | "skip" | "next", now = 0) =>
  game.onHostCommand(s, { type }, now);
const press = (s: IndovinaCanzoneState, id: string, at: number, latency = 20) =>
  game.onInput(s, id, { type: "buzz" }, { receivedAt: at + latency, claimedTime: at, rtt: latency * 2 });

/** Brano 1 in riproduzione dall'istante 1000. */
const playing = () => cmd(game.init(config, ctx, 0), "start", 1_000);
/** Prenotazioni a tempo `at` (ms reali) e chiusura della finestra di raccolta. */
function answeringAfter(...who: [string, number][]): IndovinaCanzoneState {
  let s = playing();
  for (const [id, at] of who) s = press(s, id, at);
  return game.onTick(s, Math.max(...who.map(([, at]) => at)) + 20 + COLLECT_WINDOW_MS + 100);
}

describe("indovina la canzone", () => {
  it("la musica parte solo su comando e si ferma alla prima prenotazione", () => {
    const s0 = game.init(config, ctx, 0);
    expect(game.screenView(s0)).toMatchObject({ phase: "idle", music: { playing: false } });
    expect(press(s0, "a", 500)).toBe(s0);
    const s1 = playing();
    expect(game.screenView(s1)).toMatchObject({ music: { playing: true, offsetMs: 0, segmentStart: 1_000, stopAt: 31_000, startSeconds: 5 } });
    const s2 = press(s1, "a", 4_000);
    expect(game.screenView(s2)).toMatchObject({ phase: "collecting", music: { playing: false } });
  });

  it("chi prenota per primo (ora equa) risponde, anche se il suo messaggio arriva dopo", () => {
    let t = playing();
    t = press(t, "b", 5_100, 10);
    t = press(t, "a", 5_000, 200);
    t = game.onTick(t, 6_000);
    expect(t.queue.map((p) => p.playerId)).toEqual(["a", "b"]);
    expect(t.pausedMs).toBe(4_000);
  });

  it("i punti scendono con il tempo di ascolto (minimo a fine ascolto)", () => {
    const early = cmd(answeringAfter(["a", 1_000]), "correct");
    const late = cmd(answeringAfter(["a", 30_900]), "correct");
    expect(early.totals.a).toBeGreaterThan(95);
    expect(late.totals.a).toBeLessThanOrEqual(25);
    expect(late.totals.a).toBeGreaterThanOrEqual(20);
  });

  it("usa i punti del brano come massimo", () => {
    let s = cmd(answeringAfter(["a", 1_000]), "correct");
    s = cmd(s, "next");
    s = cmd(s, "start", 50_000);
    s = press(s, "b", 50_000);
    s = game.onTick(s, 51_000);
    s = cmd(s, "correct");
    expect(s.totals.b).toBeGreaterThan(190);
  });

  it("risposta sbagliata: penalità, poi tocca al successivo; coda finita = pausa e poi si riprende dallo stesso punto", () => {
    let s = answeringAfter(["a", 5_000], ["b", 5_100]);
    s = cmd(s, "wrong");
    expect(s.totals.a).toBe(-50);
    expect(s.phase).toBe("answering");
    expect(game.screenView(s)).toMatchObject({ answering: { nickname: "B" } });
    s = cmd(s, "wrong");
    expect(s.phase).toBe("paused");
    expect(game.screenView(s)).toMatchObject({ music: { playing: false, offsetMs: 4_000 } });
    // chi ha già sbagliato non può ripremere; gli altri sì
    s = cmd(s, "resume", 20_000);
    expect(game.screenView(s)).toMatchObject({ music: { playing: true, offsetMs: 4_000, segmentStart: 20_000, stopAt: 20_000 + 26_000 } });
    expect(press(s, "a", 21_000)).toBe(s);
    const s2 = press(s, "c", 21_000);
    expect(s2.phase).toBe("collecting");
    expect(s2.queue[0]!.heardMs).toBe(5_000);
  });

  it("se tutti hanno sbagliato il brano si chiude senza vincitore", () => {
    let s = answeringAfter(["a", 1_000], ["b", 1_050], ["c", 1_100]);
    s = cmd(cmd(cmd(s, "wrong"), "wrong"), "wrong");
    expect(s.phase).toBe("resolved");
    expect(s.outcome).toEqual({ playerId: null, points: 0 });
  });

  it("senza prenotazioni la musica si ferma a fine ascolto", () => {
    const s = playing();
    expect(game.onTick(s, 31_000)).toBe(s);
    const end = game.onTick(s, 31_600);
    expect(end.phase).toBe("resolved");
    expect(game.screenView(end)).toMatchObject({ reveal: "TITOLO-SEGRETO-1", winner: { playerId: null } });
  });

  it("si può concludere e i punteggi finiscono nel registro", () => {
    let s = cmd(answeringAfter(["a", 1_000]), "correct");
    s = cmd(s, "next");
    s = cmd(cmd(s, "skip"), "next");
    expect(game.isFinished(s)).toBe(true);
    expect(game.scores(s)).toEqual([expect.objectContaining({ playerId: "a" })]);
    expect(game.result(s).ranking[0]!.playerId).toBe("a");
  });

  it("non perde dati: una prenotazione arrivata a ridosso della fine ascolto conta", () => {
    let s = playing();
    s = press(s, "a", 30_900, 50); // arriva dopo lo stop teorico ma entro la tolleranza
    s = game.onTick(s, 31_100);
    expect(s.phase).toBe("collecting");
  });
});

describe("indovina la canzone: anti-leak", () => {
  const phases = () => {
    const out: IndovinaCanzoneState[] = [game.init(config, ctx, 0), playing(), answeringAfter(["a", 3_000], ["b", 3_100])];
    out.push(cmd(out[2]!, "wrong"));
    out.push(cmd(cmd(out[2]!, "wrong"), "wrong"));
    return out;
  };

  it("titolo e risposta non compaiono in nessuna vista pubblica prima della chiusura", () => {
    for (const s of phases()) {
      const all = JSON.stringify([game.screenView(s), game.viewFor(s, "a", null), game.viewFor(s, "c", null)]);
      expect(all).not.toContain("SEGRETO");
    }
    expect(JSON.stringify(game.hostView(playing()))).toContain("TITOLO-SEGRETO-1");
  });

  it("il telefono non riceve mai il file audio", () => {
    for (const s of phases()) {
      for (const id of ["a", "b", "c"]) expect(JSON.stringify(game.viewFor(s, id, null))).not.toContain(FILE_1);
    }
    expect(JSON.stringify(game.screenView(playing()))).toContain(FILE_1);
  });

  it("a brano chiuso lo schermo rivela il titolo", () => {
    const s = cmd(answeringAfter(["a", 1_000]), "correct");
    expect(game.screenView(s)).toMatchObject({ reveal: "TITOLO-SEGRETO-1", winner: { nickname: "A" } });
  });
});

describe("indovina la canzone: configurazione", () => {
  it("accetta un link YouTube al posto del file, ma una sola sorgente per brano", () => {
    const ok = (song: object) => game.configSchema.safeParse({ songs: [{ answer: "x", ...song }] }).success;
    expect(ok({ youtube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).toBe(true);
    expect(ok({ youtube: "https://youtu.be/dQw4w9WgXcQ?t=10" })).toBe(true);
    expect(ok({ youtube: "https://example.com/watch?v=dQw4w9WgXcQ" })).toBe(false);
    expect(ok({})).toBe(false);
    expect(ok({ audio: FILE_1, youtube: "dQw4w9WgXcQ" })).toBe(false);
    expect(ok({ audio: FILE_1, youtube: "" })).toBe(true);
  });

  it("lo schermo riceve l'id del video YouTube, il telefono no", () => {
    const yt = game.configSchema.parse({ songs: [{ youtube: "https://youtu.be/dQw4w9WgXcQ", answer: "TITOLO-SEGRETO" }] });
    const s = cmd(game.init(yt, ctx, 0), "start", 1_000);
    expect(game.screenView(s)).toMatchObject({ music: { file: null, youtubeId: "dQw4w9WgXcQ" } });
    expect(JSON.stringify(game.viewFor(s, "a", null))).not.toContain("dQw4w9WgXcQ");
  });

  it("l'effetto audio è facoltativo (predefinito: nessuno) e non vale per i link YouTube", () => {
    const parse = (song: object) => game.configSchema.safeParse({ songs: [{ answer: "x", ...song }] });
    const plain = parse({ audio: FILE_1 });
    expect(plain.success && plain.data.songs[0]!.effect).toBe("none");
    for (const effect of ["blur", "heavy_blur", "no_voice"]) expect(parse({ audio: FILE_1, effect }).success).toBe(true);
    expect(parse({ audio: FILE_1, effect: "eco" }).success).toBe(false);
    expect(parse({ youtube: "dQw4w9WgXcQ", effect: "blur" }).success).toBe(false);
    expect(parse({ youtube: "dQw4w9WgXcQ", effect: "none" }).success).toBe(true);
  });

  it("lo schermo riceve l'effetto del brano corrente", () => {
    const cfg = game.configSchema.parse({ songs: [{ audio: FILE_1, answer: "x", effect: "no_voice" }, { audio: FILE_2, answer: "y" }] });
    let s = cmd(game.init(cfg, ctx, 0), "start", 1_000);
    expect(game.screenView(s)).toMatchObject({ music: { effect: "no_voice" } });
    s = cmd(cmd(s, "skip"), "next");
    expect(game.screenView(s)).toMatchObject({ music: { effect: "none" } });
  });

  it("rifiuta nomi di file che non vengono dalla mediateca (path traversal, URL esterni)", () => {
    for (const audio of ["../../etc/passwd", "http://sito.example/brano.mp3", "brano.mp3", ""]) {
      expect(game.configSchema.safeParse({ songs: [{ audio, answer: "x" }] }).success).toBe(false);
    }
    expect(game.configSchema.safeParse({ songs: [{ audio: FILE_1, answer: "x" }] }).success).toBe(true);
  });
});
