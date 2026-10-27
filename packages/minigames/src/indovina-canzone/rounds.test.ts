import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type IndovinaCanzoneState, indovinaCanzone as game } from "./index.js";

describe("indovina la canzone: round per categoria", () => {
  const players = [
    { id: "a", nickname: "Ada", teamId: "t1" },
    { id: "b", nickname: "Bob", teamId: "t1", captain: true as const },
    { id: "c", nickname: "Cleo", teamId: "t2" },
    { id: "d", nickname: "Dan", teamId: "t3" },
  ];
  const teamCtx: MinigameContext = {
    players,
    teams: [
      { id: "t1", name: "Rossi" },
      { id: "t2", name: "Blu" },
      { id: "t3", name: "Verdi" },
    ],
    seed: 11,
  };
  const FILES = Array.from({ length: 8 }, (_, i) => {
    const d = String(i + 1);
    return `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${d.repeat(12)}.mp3`;
  });
  const song = (n: number, categories: string[]) => ({ audio: FILES[n - 1], answer: `SEGRETO-${n}`, categories });
  // 3 rock (il terzo è anche pop), 3 pop, 1 anni 80, 1 senza categoria
  const songs = [song(1, ["Rock"]), song(2, ["Rock"]), song(3, ["Rock", "Pop"]), song(4, ["Pop"]), song(5, ["Pop"]), song(6, ["Anni 80"]), song(7, [])];
  const make = (rounds: unknown[], extra: object = {}) => game.configSchema.parse({ songs, rounds, pickSeconds: 20, ...extra });
  const init = (c: ReturnType<typeof make>) => game.init(c, teamCtx, 10_000);
  const view = (s: IndovinaCanzoneState) => game.screenView(s) as any;
  const phone = (s: IndovinaCanzoneState, id: string) => game.viewFor(s, id, null) as any;
  const pick = (s: IndovinaCanzoneState, id: string, category: string) => game.onInput(s, id, { type: "pick", category }, { receivedAt: 0, claimedTime: 0, rtt: null });
  const host = (s: IndovinaCanzoneState, type: string, now = 0) => game.onHostCommand(s, { type } as never, now);
  /** Gioca il brano corrente: parte, nessuno risponde, si chiude e si passa oltre. */
  const skipSong = (s: IndovinaCanzoneState) => host(host(host(s, "start", 20_000), "skip", 21_000), "next", 22_000);
  const answerOf = (s: IndovinaCanzoneState) => (game.hostView(s).info as any).answer as string;
  /** Gioca tutto con la regia che sceglie la prima categoria offerta; restituisce i titoli nell'ordine in cui sono usciti. */
  const playAll = (s: IndovinaCanzoneState) => {
    const seen: string[] = [];
    for (let guard = 0; s.phase !== "done" && guard < 40; guard++) {
      if (s.phase === "choosing") {
        s = host(s, `pick:${view(s).choosing.options[0].key}`, 11_000);
        continue;
      }
      seen.push(answerOf(s));
      s = skipSong(s);
    }
    return { seen, state: s };
  };

  it("senza round il quiz va come prima: nessuna informazione di round nelle viste", () => {
    const s = game.init(game.configSchema.parse({ songs }), teamCtx, 0);
    expect(s.phase).toBe("idle");
    expect(view(s).round).toBeNull();
    expect(game.hostView(s).info).toMatchObject({ round: null });
  });

  it("round con categoria fissa: parte da solo, mostra round e categoria e ne suona solo i brani", () => {
    const s = init(make([{ selection: "fixed", category: "Pop", songs: 2 }]));
    expect(s.phase).toBe("idle");
    expect(view(s)).toMatchObject({ category: "Pop", round: { number: 1, total: 1, song: 1, songs: 2, category: "Pop" } });
    expect(game.hostView(s).info).toMatchObject({ round: "Round 1 di 1 · Pop · brano 1 di 2" });
    const second = skipSong(s);
    const seen = [answerOf(s), answerOf(second)];
    expect(seen.every((a) => ["SEGRETO-3", "SEGRETO-4", "SEGRETO-5"].includes(a))).toBe(true);
    expect(new Set(seen).size).toBe(2);
    expect(skipSong(second).phase).toBe("done");
  });

  it("la stessa categoria in due round non ripete mai un brano", () => {
    const { seen, state } = playAll(init(make([{ selection: "fixed", category: "Rock", songs: 2 }, { selection: "fixed", category: "Rock", songs: 1 }])));
    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(3);
    expect(state.phase).toBe("done");
  });

  it("un brano in due categorie, suonato in un round, non torna nel round dell'altra categoria", () => {
    const { seen } = playAll(init(make([{ selection: "fixed", category: "Rock", songs: 3 }, { selection: "fixed", category: "Pop", songs: 3 }])));
    expect(new Set(seen).size).toBe(seen.length);
    // Rock ha 3 brani e Pop 3, ma SEGRETO-3 è in entrambe: in tutto 5 brani diversi.
    expect(seen).toHaveLength(5);
  });

  it("tra un round e l'altro sceglie il capitano della squadra di turno, poi la squadra seguente", () => {
    let s = init(make([{ selection: "teams", songs: 1 }, { selection: "teams", songs: 1 }, { selection: "teams", songs: 1 }]));
    expect(s.phase).toBe("choosing");
    // Blu, Rossi, Verdi per nome; il capitano di Blu è il primo per nome (Cleo), quello di Rossi è Bob (designato).
    expect(view(s).choosing).toMatchObject({ by: "teams", team: { name: "Blu" }, captain: { nickname: "Cleo" }, deadline: 30_000 });
    expect(view(s).round).toMatchObject({ number: 1, total: 3, song: 0, category: null });
    expect(pick(s, "a", "rock")).toBe(s);
    s = pick(s, "c", "rock");
    expect(s.phase).toBe("idle");
    expect(view(s)).toMatchObject({ category: "Rock", round: { number: 1, song: 1, songs: 1 } });
    s = skipSong(s);
    expect(s.phase).toBe("choosing");
    expect(view(s).choosing).toMatchObject({ team: { name: "Rossi" }, captain: { nickname: "Bob" } });
    expect(view(s).round).toMatchObject({ number: 2 });
    s = skipSong(pick(s, "b", "pop"));
    expect(view(s).choosing).toMatchObject({ team: { name: "Verdi" } });
  });

  it("un round con più brani non chiede altre scelte finché non finisce", () => {
    let s = pick(init(make([{ selection: "teams", songs: 2 }])), "c", "rock");
    s = skipSong(s);
    expect(s.phase).toBe("idle");
    expect(view(s)).toMatchObject({ category: "Rock", round: { song: 2, songs: 2 } });
  });

  it("le categorie offerte contano solo i brani non ancora suonati", () => {
    const s = skipSong(pick(init(make([{ selection: "teams", songs: 1 }, { selection: "teams", songs: 1 }])), "c", "anni 80"));
    const names = view(s).choosing.options.map((o: { name: string }) => o.name);
    expect(names).not.toContain("Anni 80");
    expect(names).toEqual(expect.arrayContaining(["Rock", "Pop", "Altri brani"]));
  });

  it("scaduto il tempo la categoria è estratta a sorte (sempre la stessa) e il turno passa comunque alla squadra seguente", () => {
    const start = init(make([{ selection: "teams", songs: 1 }, { selection: "teams", songs: 1 }]));
    expect(game.onTick(start, 29_999)).toBe(start);
    const s = game.onTick(start, 30_000);
    expect(s.phase).toBe("idle");
    expect(game.onTick(start, 31_000).category).toBe(s.category);
    expect(view(skipSong(s)).choosing).toMatchObject({ team: { name: "Rossi" } });
  });

  it("round scelto dalla regia: nessun capitano e nessun tempo, la regia sceglie con le azioni", () => {
    let s = init(make([{ selection: "host", songs: 1 }, { selection: "teams", songs: 1 }]));
    expect(s.phase).toBe("choosing");
    expect(view(s).choosing).toMatchObject({ by: "host", team: null, captain: null, deadline: null });
    for (const id of ["a", "b", "c", "d"]) expect(phone(s, id).pick).toBeNull();
    expect(game.onTick(s, 999_999)).toBe(s);
    expect(pick(s, "c", "rock")).toBe(s);
    expect(game.hostView(s).info).toMatchObject({ chooser: expect.stringContaining("regia") });
    expect(game.hostView(s).actions.filter((a) => a.id.startsWith("pick:")).length).toBeGreaterThan(1);
    s = host(s, "pick:pop", 11_000);
    expect(view(s)).toMatchObject({ category: "Pop", round: { number: 1 } });
    // La scelta della regia non consuma il turno delle squadre: nel round seguente tocca alla prima (Blu).
    expect(view(skipSong(s)).choosing).toMatchObject({ by: "teams", team: { name: "Blu" } });
  });

  it("la regia può scegliere al posto del capitano anche in un round a squadre", () => {
    const s = host(init(make([{ selection: "teams", songs: 1 }])), "pick:rock", 11_000);
    expect(s.phase).toBe("idle");
    expect(view(s).category).toBe("Rock");
  });

  it("con una sola categoria non si sceglie; il round senza più brani si salta; il quiz finisce", () => {
    const only = game.configSchema.parse({
      songs: [song(1, ["Rock"]), song(2, ["Rock"])],
      rounds: [{ selection: "teams", songs: 1 }, { selection: "fixed", category: "Rock", songs: 1 }, { selection: "teams", songs: 1 }],
    });
    let s = game.init(only, teamCtx, 0);
    expect(view(s).category).toBe("Rock");
    s = skipSong(s);
    expect(view(s).round).toMatchObject({ number: 2 });
    expect(skipSong(s).phase).toBe("done");
  });

  it("finché la categoria del round non è scelta nessuna vista mostra file, titolo o brani", () => {
    const s = init(make([{ selection: "teams", songs: 2 }]));
    for (const v of [view(s), phone(s, "a"), phone(s, "b"), phone(s, "c"), phone(s, "d"), game.hostView(s).info]) {
      expect(JSON.stringify(v)).not.toMatch(/SEGRETO|\.mp3|"audio"/);
    }
    expect(view(s).music).toBeNull();
    // Solo chi tocca riceve l'elenco delle categorie.
    expect(phone(s, "c").pick.options.length).toBeGreaterThan(1);
    expect(phone(s, "c").pick.round).toBe(1);
    for (const id of ["a", "b", "d"]) expect(phone(s, id).pick).toBeNull();
  });

  it("l'ultimo brano dell'ultimo round dice «Concludi»", () => {
    const s = init(make([{ selection: "fixed", category: "Anni 80", songs: 1 }, { selection: "fixed", category: "Pop", songs: 1 }]));
    const first = host(host(s, "start", 20_000), "skip", 21_000);
    expect(game.hostView(first).actions.find((a) => a.id === "next")?.label).toBe("Prossimo brano");
    const last = host(host(skipSong(s), "start", 20_000), "skip", 21_000);
    expect(game.hostView(last).actions.find((a) => a.id === "next")?.label).toBe("Concludi");
  });

  describe("controlli al salvataggio", () => {
    const issues = (rounds: unknown[]) => {
      const r = game.configSchema.safeParse({ songs, rounds });
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };

    it("un round con la categoria fissa ha bisogno della categoria e dei brani per giocarlo", () => {
      expect(issues([{ selection: "fixed", category: "Pop", songs: 3 }])).toEqual([]);
      expect(issues([{ selection: "fixed", songs: 1 }])[0]).toMatch(/Round 1: scegli la categoria/);
      expect(issues([{ selection: "fixed", category: "Jazz", songs: 1 }])[0]).toMatch(/nessun brano ha la categoria «Jazz»/);
      expect(issues([{ selection: "fixed", category: "Anni 80", songs: 2 }])[0]).toMatch(/chiedono 2 brani in tutto, ma ce ne sono 1/);
    });

    it("somma i round che ripetono la categoria", () => {
      expect(issues([{ selection: "fixed", category: "Pop", songs: 2 }, { selection: "fixed", category: "pop", songs: 2 }])[0]).toMatch(/Round 2: .*chiedono 4 brani in tutto, ma ce ne sono 3/);
    });

    it("i round con la categoria da scegliere non hanno vincoli", () => {
      expect(issues([{ selection: "teams", songs: 40 }, { selection: "host", songs: 1 }])).toEqual([]);
    });

    it("i brani senza categoria si fissano come «Altri brani»", () => {
      expect(issues([{ selection: "fixed", category: "Altri brani", songs: 1 }])).toEqual([]);
    });
  });

  it("l'istanza di prima, senza round né catalogo, si completa con i predefiniti", () => {
    expect(game.configSchema.parse({ songs })).toMatchObject({ rounds: [], categories: [] });
  });
});
