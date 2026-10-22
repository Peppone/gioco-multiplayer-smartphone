import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { COLLECT_WINDOW_MS, LOOP_LEAD_MS, type IndovinaCanzoneState, indovinaCanzone as game } from "./index.js";

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

describe("indovina la canzone: ascolto a spezzoni crescenti", () => {
  const loops = game.configSchema.parse({
    songs: [{ audio: FILE_1, answer: "TITOLO-SEGRETO-1", startSeconds: 5 }],
    playback: "loops",
    loopSeconds: [0.5, 1, 2],
    loopPauseSeconds: 1,
    clipSeconds: 30,
    minPoints: 20,
  });
  /** Istante in cui l'ascolto comincia davvero: un po' dopo il comando della regia (a 1000 ms). */
  const T0 = 1_000 + LOOP_LEAD_MS;
  const started = (now = 1_000) => cmd(game.init(loops, ctx, 0), "start", now);

  it("la durata dell'ascolto è la somma di spezzoni e pause, non i secondi del modo continuo", () => {
    const view = game.screenView(started()) as { music: { clipMs: number; stopAt: number; loop: unknown } };
    expect(view.music.clipMs).toBe(500 + 1_000 + 2_000 + 3 * 1_000);
    expect(view.music.stopAt).toBe(T0 + 6_500);
    expect(view.music.loop).toEqual({ snippetsMs: [500, 1_000, 2_000], pauseMs: 1_000 });
  });

  it("l'ascolto parte e riparte poco dopo il comando, così il primo spezzone non è accorciato dalla latenza; nel modo continuo no", () => {
    expect(game.screenView(started())).toMatchObject({ music: { segmentStart: 1_000 + LOOP_LEAD_MS, offsetMs: 0 } });
    expect(game.screenView(playing())).toMatchObject({ music: { segmentStart: 1_000 } });
    // Una prenotazione nell'anticipo non ha ascoltato nulla.
    const early = press(started(), "a", 1_100);
    expect(early.queue[0]!.heardMs).toBe(0);
  });

  it("nel modo continuo lo schermo non riceve spezzoni", () => {
    expect(game.screenView(playing())).toMatchObject({ music: { loop: null, clipMs: 30_000 } });
  });

  it("ci si può prenotare anche durante una pausa; il tempo ascoltato è quello trascorso, pause comprese", () => {
    let s = started();
    s = press(s, "a", T0 + 1_000); // 1 s dopo il via: il primo spezzone (0,5 s) è finito e siamo nella pausa
    s = game.onTick(s, T0 + 1_000 + 20 + COLLECT_WINDOW_MS + 100);
    expect(s.phase).toBe("answering");
    expect(s.queue[0]!.heardMs).toBe(1_000);
    expect(s.pausedMs).toBe(1_000);
  });

  it("dopo una risposta sbagliata la musica riprende dallo stesso punto dell'ascolto", () => {
    let s = started();
    s = press(s, "a", T0 + 1_800);
    s = game.onTick(s, T0 + 1_800 + 20 + COLLECT_WINDOW_MS + 100);
    s = cmd(s, "wrong");
    expect(s.phase).toBe("paused");
    s = cmd(s, "resume", 20_000);
    expect(game.screenView(s)).toMatchObject({ music: { playing: true, offsetMs: 1_800, segmentStart: 20_000 + LOOP_LEAD_MS, stopAt: 20_000 + LOOP_LEAD_MS + 6_500 - 1_800 } });
  });

  it("senza prenotazioni l'ascolto finisce dopo l'ultima pausa", () => {
    const s = started();
    expect(game.onTick(s, T0 + 6_500)).toBe(s);
    expect(game.onTick(s, T0 + 6_500 + 600).phase).toBe("resolved");
  });

  it("i punti scendono lungo tutta la durata degli spezzoni", () => {
    const early = cmd(game.onTick(press(started(), "a", T0 + 100), 3_000), "correct");
    const late = cmd(game.onTick(press(started(), "a", T0 + 6_400), 9_000), "correct");
    expect(early.totals.a!).toBeGreaterThan(95);
    expect(late.totals.a!).toBeLessThan(25);
    expect(late.totals.a!).toBeGreaterThanOrEqual(20);
  });

  it("rifiuta spezzoni fuori misura e un elenco vuoto", () => {
    const parse = (extra: object) => game.configSchema.safeParse({ songs: [{ audio: FILE_1, answer: "x" }], ...extra }).success;
    expect(parse({ playback: "loops", loopSeconds: [0.5, 1] })).toBe(true);
    expect(parse({ loopSeconds: [] })).toBe(false);
    expect(parse({ loopSeconds: [0.01] })).toBe(false);
    expect(parse({ loopSeconds: [61] })).toBe(false);
    expect(parse({ loopPauseSeconds: 0 })).toBe(false);
    expect(parse({ playback: "a caso" })).toBe(false);
  });

  it("per impostazione predefinita l'ascolto è continuo, con spezzoni 0,5 · 1 · 2 · 4 · 8 s pronti da usare", () => {
    const cfg = game.configSchema.parse({ songs: [{ audio: FILE_1, answer: "x" }] });
    expect(cfg).toMatchObject({ playback: "continuous", loopSeconds: [0.5, 1, 2, 4, 8], loopPauseSeconds: 1.5, progressive: false, clearAtPercent: 100 });
  });
});

describe("indovina la canzone: suono che si svela", () => {
  const parse = (extra: object, song: object = {}) => game.configSchema.safeParse({ songs: [{ audio: FILE_1, answer: "x", ...song }], ...extra });

  it("lo schermo sa se l'effetto si attenua e a che punto dell'ascolto il suono è nitido", () => {
    const cfg = game.configSchema.parse({ songs: [{ audio: FILE_1, answer: "x", effect: "heavy_blur" }], progressive: true, clearAtPercent: 80 });
    const s = cmd(game.init(cfg, ctx, 0), "start", 1_000);
    expect(game.screenView(s)).toMatchObject({ music: { effect: "heavy_blur", clearAtPercent: 80 } });
    expect(game.screenView(playing())).toMatchObject({ music: { clearAtPercent: null } });
  });

  it("serve almeno un brano con un effetto, altrimenti non c'è nulla da svelare", () => {
    expect(parse({ progressive: true }).success).toBe(false);
    expect(parse({ progressive: true }, { effect: "blur" }).success).toBe(true);
    expect(parse({ progressive: false }).success).toBe(true);
    const r = parse({ progressive: true });
    expect(!r.success && r.error.issues[0]!.message).toMatch(/Svela gradualmente/);
  });

  it("la percentuale di nitidezza sta tra 20 e 100", () => {
    expect(parse({ clearAtPercent: 19 }).success).toBe(false);
    expect(parse({ clearAtPercent: 101 }).success).toBe(false);
    expect(parse({ clearAtPercent: 20 }).success).toBe(true);
  });
});

describe("indovina la canzone: categorie e capisquadra", () => {
  const players = [
    { id: "a", nickname: "Ada", teamId: "t1" },
    { id: "b", nickname: "Bob", teamId: "t1", captain: true as const },
    { id: "c", nickname: "Cleo", teamId: "t2" },
    { id: "d", nickname: "Dan", teamId: "t2" },
    { id: "e", nickname: "Eli", teamId: null },
  ];
  const teamCtx: MinigameContext = { players, teams: [{ id: "t1", name: "Rossi" }, { id: "t2", name: "Blu", color: "#0000ff" }], seed: 7 };
  const FILES = [1, 2, 3, 4].map((n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}.mp3`);
  const song = (n: number, categories: string[]) => ({ audio: FILES[n - 1], answer: `SEGRETO-${n}`, categories });
  const catConfig = game.configSchema.parse({
    songs: [song(1, ["Rock"]), song(2, ["Rock", "Anni 80"]), song(3, ["Anni 80"]), song(4, [])],
    pickCategory: true,
    pickSeconds: 20,
  });
  const init = (c = catConfig, context = teamCtx) => game.init(c, context, 10_000);
  const pick = (s: IndovinaCanzoneState, id: string, category: string) => game.onInput(s, id, { type: "pick", category }, { receivedAt: 0, claimedTime: 0, rtt: null });
  const view = (s: IndovinaCanzoneState) => game.screenView(s) as any;
  const phone = (s: IndovinaCanzoneState, id: string) => game.viewFor(s, id, null) as any;

  it("parte scegliendo la categoria: tocca alla prima squadra per nome, al suo capitano designato", () => {
    const s = init();
    expect(s.phase).toBe("choosing");
    // Blu viene prima di Rossi; Blu non ha un capitano designato: il primo per nome (Cleo).
    expect(view(s).choosing).toMatchObject({ team: { id: "t2", name: "Blu" }, captain: { playerId: "c", nickname: "Cleo" }, deadline: 30_000 });
    expect(view(s).choosing.options).toEqual([
      { key: "rock", name: "Rock", left: 2 },
      { key: "anni 80", name: "Anni 80", left: 2 },
      { key: "\u0000altri", name: "Altri brani", left: 1 },
    ]);
  });

  it("finché la categoria non è scelta nessuna vista mostra il file o il titolo di un brano", () => {
    const s = init();
    expect(view(s).music).toBeNull();
    for (const v of [view(s), phone(s, "a"), phone(s, "c"), game.hostView(s).info]) {
      const text = JSON.stringify(v);
      expect(text).not.toMatch(/SEGRETO/);
      for (const f of FILES) expect(text).not.toContain(f);
    }
  });

  it("solo il capitano di turno riceve le categorie e può sceglierle", () => {
    const s = init();
    expect(phone(s, "c").pick.options).toHaveLength(3);
    for (const id of ["a", "b", "d", "e"]) expect(phone(s, id).pick).toBeNull();
    expect(phone(s, "a")).toMatchObject({ chooserName: "Blu", canBuzz: false });
    for (const id of ["a", "b", "d", "e"]) expect(pick(s, id, "rock")).toBe(s);
    expect(pick(s, "c", "inesistente")).toBe(s);
    expect(pick(s, "c", "rock").phase).toBe("idle");
  });

  it("la categoria scelta assegna un suo brano non ancora suonato e lo mostra a tutti", () => {
    const s = pick(init(), "c", "anni 80");
    expect(s.phase).toBe("idle");
    expect([1, 2]).toContain(s.index); // brani 2 e 3 sono «Anni 80»
    expect(view(s)).toMatchObject({ category: "Anni 80", index: 0, total: 4 });
    expect(view(s).music.file).toBe(FILES[s.index]);
    expect(phone(s, "a").category).toBe("Anni 80");
  });

  it("un brano in due categorie, una volta suonato, non si ripresenta nell'altra", () => {
    let s = pick(init(), "c", "rock");
    const first = s.index; // brano 1 o 2
    s = cmd(cmd(s, "skip"), "next", 5_000);
    expect(s.phase).toBe("choosing");
    const counts = Object.fromEntries(view(s).choosing.options.map((o: any) => [o.key, o.left]));
    // Rock ha ancora un brano; Anni 80 ne ha 2 (se il suonato era il 2) o 1 (se era il 1: non è Anni 80)
    expect(counts.rock).toBe(1);
    expect(counts["anni 80"]).toBe(first === 1 ? 1 : 2);
    expect(counts["\u0000altri"]).toBe(1);
  });

  it("a ogni brano tocca a una squadra diversa, a turno", () => {
    let s = pick(init(), "c", "rock");
    s = cmd(cmd(s, "skip"), "next", 5_000);
    expect(view(s).choosing).toMatchObject({ team: { id: "t1", name: "Rossi" }, captain: { playerId: "b", nickname: "Bob" } }); // Bob è il capitano designato
    expect(pick(s, "c", "rock")).toBe(s);
    s = pick(s, "b", "\u0000altri");
    expect(s.index).toBe(3);
    s = cmd(cmd(s, "skip"), "next", 6_000);
    expect(view(s).choosing.team.name).toBe("Blu");
  });

  it("scaduto il tempo la categoria è estratta a sorte, sempre la stessa con lo stesso seme", () => {
    const s = init();
    expect(game.onTick(s, 29_999)).toBe(s);
    const a = game.onTick(s, 30_000);
    expect(a.phase).toBe("idle");
    expect(a.category).not.toBeNull();
    expect(game.onTick(init(), 31_000).category).toBe(a.category);
    expect(game.onTick(init(catConfig, { ...teamCtx, seed: 99 }), 31_000).phase).toBe("idle");
  });

  it("la regia può scegliere la categoria al posto del capitano, con un'azione per categoria", () => {
    const s = init();
    expect(game.hostView(s).actions.filter((a) => a.id.startsWith("pick:")).map((a) => a.label)).toEqual(["Scegli «Rock» (2)", "Scegli «Anni 80» (2)", "Scegli «Altri brani» (1)"]);
    expect(game.commandSchema.safeParse({ type: "pick:rock" }).success).toBe(true);
    expect(game.commandSchema.safeParse({ type: "boh" }).success).toBe(false);
    const done = cmd(s, "pick:rock" as never, 11_000);
    expect(done.phase).toBe("idle");
    expect(cmd(done, "pick:anni 80" as never)).toBe(done); // non si sceglie fuori dalla fase di scelta
    expect(game.hostView(done).actions.some((a) => a.id.startsWith("pick:"))).toBe(false);
    expect(game.hostView(s).actions.find((a) => a.id === "skip")!.enabled).toBe(false);
  });

  it("senza squadre sceglie la regia o la sorte; i telefoni non hanno nulla da scegliere", () => {
    const s = init(catConfig, { players, teams: [], seed: 7 });
    expect(s.phase).toBe("choosing");
    expect(view(s).choosing).toMatchObject({ team: null, captain: null });
    for (const p of players) expect(phone(s, p.id).pick).toBeNull();
    expect(game.hostView(s).info).toMatchObject({ chooser: expect.stringContaining("regia") });
  });

  it("con una sola categoria rimasta non si sceglie: il brano parte da solo", () => {
    const one = game.configSchema.parse({ songs: [song(1, ["Rock"]), song(2, ["Rock"])], pickCategory: true });
    const s = init(one);
    expect(s.phase).toBe("idle");
    expect(view(s).category).toBe("Rock");
  });

  it("senza categorie scelte dai capisquadra i brani vanno in ordine e la categoria non compare", () => {
    const plain = game.configSchema.parse({ songs: [song(1, ["Rock"]), song(2, [])], pickCategory: false });
    let s = init(plain);
    expect(s.phase).toBe("idle");
    expect(view(s)).toMatchObject({ category: null, index: 0 });
    s = cmd(cmd(s, "skip"), "next", 5_000);
    expect(s.index).toBe(1);
    expect(view(s).index).toBe(1);
  });

  it("si suonano tutti i brani, ciascuno una volta sola, e poi finisce", () => {
    let s = init();
    const order: number[] = [];
    while (s.phase !== "done") {
      if (s.phase === "choosing") s = game.onTick(s, s.pickDeadline); // l'ultimo brano rimasto parte da solo
      order.push(s.index);
      s = cmd(cmd(s, "skip"), "next", 50_000);
    }
    expect(order.sort()).toEqual([0, 1, 2, 3]);
    expect(game.isFinished(s)).toBe(true);
  });

  it("il numero del brano e il testo del pulsante finale seguono i brani già suonati", () => {
    let s = init();
    expect(view(s).index).toBe(0);
    s = pick(s, "c", "rock");
    expect(game.hostView(s).actions.find((a) => a.id === "next")!.label).toBe("Prossimo brano");
    for (let i = 1; i < 4; i++) {
      s = cmd(cmd(s, "skip"), "next", 50_000);
      if (s.phase === "choosing") s = game.onTick(s, s.pickDeadline);
      expect(view(s).index).toBe(i);
    }
    expect(game.hostView(s).actions.find((a) => a.id === "next")!.label).toBe("Concludi");
  });

  it("un brano con più categorie ripetute o con maiuscole diverse conta una volta sola", () => {
    const dup = game.configSchema.parse({ songs: [song(1, ["Rock", "rock", " ROCK "]), song(2, ["Pop"])], pickCategory: true });
    expect(view(init(dup)).choosing.options).toEqual([
      { key: "rock", name: "Rock", left: 1 },
      { key: "pop", name: "Pop", left: 1 },
    ]);
  });

  it("rifiuta di far scegliere la categoria se nessun brano ne ha una, e categorie vuote o troppe", () => {
    const parse = (extra: object, categories: string[] = []) =>
      game.configSchema.safeParse({ songs: [{ audio: FILE_1, answer: "x", categories }], ...extra });
    expect(parse({ pickCategory: true }).success).toBe(false);
    expect(parse({ pickCategory: true }, ["Rock"]).success).toBe(true);
    expect(parse({}, ["a", "b", "c", "d", "e", "f"]).success).toBe(false);
    expect(parse({}, [""]).success).toBe(false);
    expect(parse({ pickSeconds: 4 }).success).toBe(false);
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

  const messages = (song: object) => {
    const r = game.configSchema.safeParse({ songs: [{ answer: "x", ...song }] });
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("spiega perché un brano non va: due sorgenti, nessuna o link non riconosciuto", () => {
    expect(messages({ audio: FILE_1, youtube: "https://youtu.be/_9HHju9_hMM" })[0]).toMatch(/sia un file audio sia un link/);
    expect(messages({})[0]).toMatch(/né un file audio né un link/);
    expect(messages({ youtube: "https://example.com/video" })[0]).toMatch(/Link YouTube non riconosciuto/);
    expect(messages({ youtube: "https://youtu.be/_9HHju9_hMM?si=vpOJanYjVXv3DSET" })).toEqual([]);
  });

  it("un'istanza salvata prima di categorie e spezzoni (senza i campi nuovi) si gioca come prima", () => {
    const old = { songs: [{ audio: FILE_1, answer: "TITOLO-SEGRETO-1", startSeconds: 0, effect: "none" }], clipSeconds: 30, maxPoints: 100, minPoints: 30, wrongPenalty: 50 };
    const s = game.init(old as never, ctx, 0);
    expect(s.phase).toBe("idle");
    const playingOld = cmd(s, "start", 1_000);
    expect(game.screenView(playingOld)).toMatchObject({ music: { loop: null, clearAtPercent: null, clipMs: 30_000 }, category: null });
    expect(game.viewFor(playingOld, "a", null)).toMatchObject({ canBuzz: true, pick: null });
  });

  it("il punto di partenza dell'editor ha un brano senza sorgente, mentre l'esempio è valido", () => {
    expect(game.configSchema.safeParse(game.sampleConfig).success).toBe(true);
    const draft = game.draftConfig as { songs: { audio?: string; youtube?: string }[] };
    expect(draft.songs[0]).not.toHaveProperty("audio");
    expect(draft.songs[0]).not.toHaveProperty("youtube");
  });
});
