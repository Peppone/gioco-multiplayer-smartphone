import { type TempTeamsInput, hostCommandSchema } from "@gioco/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { type World, buildWorld } from "./test-world.js";

let w: World;
let songMatchId: string;
let quizMatchId: string;

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string; detail?: string }): T => {
  if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ""}`);
  return r.value;
};

beforeEach(() => {
  w = buildWorld();
  const song = (n: number, categories: string[]) => ({ audio: `${String(n).repeat(8)}-1111-4111-8111-111111111111.mp3`, answer: `Titolo ${n}`, categories });
  const songs = must(
    w.admin.library.createInstance({
      typeId: "indovina-canzone",
      title: "Canzoni",
      config: { songs: [song(1, ["Rock"]), song(2, ["Pop"])], pickCategory: true, pickSeconds: 20 },
    }),
  );
  const m = must(w.admin.createMatch(w.event.id, { name: "Musica" }));
  must(w.admin.library.addRound(m.id, songs.id));
  songMatchId = m.id;
  quizMatchId = w.match.id;
});

const start = (matchId = songMatchId) => w.engine.hostCommand({ type: "start", matchId });
const next = () => w.engine.hostCommand({ type: "engine", action: "next" });
const setTemp = (teams: TempTeamsInput | null) => w.engine.hostCommand({ type: "temp-teams", teams });
const id = (nick: string) => w.ids[nick]!;
const screen = () => (w.engine.screenState().frame?.view ?? null) as Record<string, any> | null;
const phone = (nick: string) => (w.engine.playerState(id(nick)).frame?.view ?? null) as Record<string, any> | null;

/** Verdi (ada, cleo; capitano cleo) e Gialli (bob, dan; capitano bob): incrociano le squadre della serata, Rossi e Blu. */
const crossTeams = (): TempTeamsInput => [
  { name: "Verdi", color: "#00aa00", members: [id("ada"), id("cleo")], captain: id("cleo") },
  { name: "Gialli", color: "#ddcc00", members: [id("bob"), id("dan")], captain: id("bob") },
];

describe("Engine: squadre temporanee", () => {
  it("senza squadre temporanee un round a squadre usa quelle della serata, con il capitano designato o il primo per nome", () => {
    start();
    next();
    // Blu viene prima di Rossi (ordine per nome); nessun capitano designato: il primo per nome è cleo.
    expect(screen()!.choosing.team.name).toBe("Blu");
    expect(screen()!.choosing.captain.nickname).toBe("cleo");
    expect(w.engine.adminState().tempTeams).toBeUndefined();
  });

  it("il capitano designato nella serata sceglie al posto del primo per nome", () => {
    must(w.admin.setCaptain(w.event.id, id("dan"), true));
    start();
    next();
    expect(screen()!.choosing.captain.nickname).toBe("dan");
    expect(phone("dan")!.pick).not.toBeNull();
    expect(phone("cleo")!.pick).toBeNull();
  });

  it("le squadre temporanee sostituiscono quelle della serata nel round a squadre, con i loro capitani", () => {
    start();
    expect(setTemp(crossTeams())).toEqual({ ok: true });
    expect(w.engine.adminState().tempTeams).toEqual([
      { id: "temp-1", name: "Verdi", color: "#00aa00", members: [id("ada"), id("cleo")], captain: id("cleo") },
      { id: "temp-2", name: "Gialli", color: "#ddcc00", members: [id("bob"), id("dan")], captain: id("bob") },
    ]);
    next();
    // Gialli viene prima di Verdi; il suo capitano è bob.
    expect(screen()!.choosing.team.name).toBe("Gialli");
    expect(screen()!.choosing.captain.nickname).toBe("bob");
    expect(phone("bob")!.pick.options.map((o: any) => o.name)).toEqual(["Rock", "Pop"]);
    expect(phone("cleo")!.pick).toBeNull(); // capitano della squadra di turno nella serata, ma non in quella temporanea
    // Il telefono vede la squadra temporanea per tutta la durata del round.
    expect(w.engine.playerState(id("ada")).me).toMatchObject({ teamId: "temp-1", teamName: "Verdi" });
    expect(w.engine.playerState(id("bob")).me).toMatchObject({ teamId: "temp-2", teamName: "Gialli" });
  });

  it("un minigioco che non usa le squadre le ignora: vede sempre quelle della serata", () => {
    start(quizMatchId);
    setTemp(crossTeams());
    next(); // quiz a scelta multipla
    expect(w.engine.playerState(id("ada")).me).toMatchObject({ teamId: w.red.id, teamName: "Rossi" });
  });

  it("i punti del round restano ai giocatori e alle squadre della serata", () => {
    start();
    setTemp(crossTeams());
    next();
    w.engine.input(id("bob"), { type: "pick", category: "rock" }, w.clock.t);
    w.engine.hostCommand({ type: "plugin", command: { type: "start" } });
    w.clock.t += 2_000;
    w.engine.input(id("ada"), { type: "buzz" }, w.clock.t - 10);
    w.clock.t += 500;
    w.engine.tick();
    w.engine.hostCommand({ type: "plugin", command: { type: "correct" } });
    w.engine.hostCommand({ type: "engine", action: "finish-round" });
    const boards = w.engine.screenState().leaderboards!;
    expect(boards.players.find((p) => p.id === id("ada"))!.points).toBeGreaterThan(0);
    expect(boards.teams.find((t) => t.id === w.red.id)!.points).toBeGreaterThan(0);
    expect(boards.teams.find((t) => t.id === w.blue.id)!.points).toBe(0);
    expect(boards.teams.some((t) => t.id.startsWith("temp-"))).toBe(false);
    // Finito il round il giocatore torna alla sua squadra della serata.
    expect(w.engine.playerState(id("ada")).me).toMatchObject({ teamId: w.red.id, teamName: "Rossi" });
  });

  it("restano attive per i round successivi finché la regia non le toglie", () => {
    start();
    setTemp(crossTeams());
    expect(setTemp(null)).toEqual({ ok: true });
    expect(w.engine.adminState().tempTeams).toBeUndefined();
    next();
    expect(screen()!.choosing.team.name).toBe("Blu");
  });

  it("si possono cambiare anche durante un round: valgono dal round dopo", () => {
    start();
    next();
    expect(setTemp(crossTeams())).toEqual({ ok: true });
    expect(screen()!.choosing.team.name).toBe("Blu"); // il round in corso ha le sue squadre
    expect(w.engine.playerState(id("ada")).me).toMatchObject({ teamName: "Rossi" });
  });

  it("rifiuta squadre incoerenti: giocatori fuori serata o doppi, nomi uguali, capitano estraneo", () => {
    start();
    const verdi = { name: "Verdi", color: "#00aa00", members: [id("ada")] };
    const gialli = { name: "Gialli", color: "#ddcc00", members: [id("bob")] };
    expect(setTemp([{ ...verdi, members: ["sconosciuto"] }])).toMatchObject({ ok: false, error: "Una squadra ha un giocatore che non è in serata." });
    expect(setTemp([verdi, { ...gialli, members: [id("ada")] }])).toMatchObject({ ok: false, error: "Un giocatore è in due squadre." });
    expect(setTemp([verdi, { ...gialli, name: "VERDI" }])).toMatchObject({ ok: false, error: "Due squadre si chiamano «VERDI»." });
    expect(setTemp([{ ...verdi, captain: id("bob") }])).toMatchObject({ ok: false });
    expect(w.engine.adminState().tempTeams).toBeUndefined();
  });

  it("lo schema del comando blocca già al socket le squadre vuote, senza nome o con un colore non valido", () => {
    const ok = { name: "Verdi", color: "#00aa00", members: ["a"] };
    const parse = (team: object) => hostCommandSchema.safeParse({ type: "temp-teams", teams: [{ ...ok, ...team }] }).success;
    expect(parse({})).toBe(true);
    expect(parse({ members: [] })).toBe(false);
    expect(parse({ name: "  " })).toBe(false);
    expect(parse({ color: "verde" })).toBe(false);
    expect(hostCommandSchema.safeParse({ type: "temp-teams", teams: [] }).success).toBe(false);
    expect(hostCommandSchema.safeParse({ type: "temp-teams", teams: null }).success).toBe(true);
  });

  it("una squadra temporanea i cui giocatori sono usciti dalla serata non compare tra le squadre del round", () => {
    start();
    setTemp(crossTeams());
    w.admin.removePlayer(w.event.id, id("bob"));
    w.admin.removePlayer(w.event.id, id("dan"));
    next();
    expect(screen()!.choosing.team.name).toBe("Verdi");
    expect(screen()!.choosing.options).toBeDefined();
  });

  it("senza partita in corso o a partita conclusa il comando è rifiutato", () => {
    expect(setTemp(crossTeams())).toMatchObject({ ok: false });
    start();
    w.engine.hostCommand({ type: "engine", action: "end-match" });
    expect(setTemp(crossTeams())).toEqual({ ok: false, error: "La partita è conclusa." });
  });

  it("sopravvivono a un riavvio (fotografia), anche in corso di round", () => {
    start();
    setTemp(crossTeams());
    next();
    const snap = JSON.parse(JSON.stringify(w.engine.snapshot())) as NonNullable<ReturnType<typeof w.engine.snapshot>>;
    w.engine.restore(snap);
    expect(w.engine.adminState().tempTeams).toHaveLength(2);
    expect(w.engine.playerState(id("ada")).me).toMatchObject({ teamName: "Verdi" });
    expect(screen()!.choosing.team.name).toBe("Gialli");
  });
});

describe("Engine: squadre temporanee e duello dei cavalieri", () => {
  it("gli sfidanti del duello sono le squadre temporanee", () => {
    const vf = must(
      w.admin.library.createInstance({
        typeId: "vero-falso",
        title: "Raffica",
        config: { statements: [{ text: "Il mare è salato.", answer: true }], timeSec: 5, revealSec: 1 },
      }),
    );
    const duel = must(
      w.admin.library.createInstance({
        typeId: "knight-duel",
        title: "Duello",
        config: { pool: [vf.id], hp: 10, minigamesPerBattle: 1, maxBattles: 3, draftSeconds: 5, battleSeconds: 5 },
      }),
    );
    const m = must(w.admin.createMatch(w.event.id, { name: "Duello" }));
    must(w.admin.library.addRound(m.id, duel.id));
    must(w.admin.library.addRound(m.id, duel.id));
    start(m.id);

    // Prima: le due squadre della serata, per nome (Blu e Rossi).
    next();
    const names = () => (screen()!.sides as { name: string }[]).map((s) => s.name);
    expect(names()).toEqual(["Blu", "Rossi"]);
    w.engine.hostCommand({ type: "engine", action: "finish-round" });

    // Poi le squadre temporanee, senza toccare l'istanza in libreria.
    setTemp(crossTeams());
    next();
    expect(names()).toEqual(["Gialli", "Verdi"]);
  });

  it("con una sola squadra temporanea il duello non parte e dice perché", () => {
    const vf = must(
      w.admin.library.createInstance({
        typeId: "vero-falso",
        title: "Raffica",
        config: { statements: [{ text: "Il mare è salato.", answer: true }], timeSec: 5, revealSec: 1 },
      }),
    );
    const duel = must(
      w.admin.library.createInstance({ typeId: "knight-duel", title: "Duello", config: { pool: [vf.id], hp: 10, minigamesPerBattle: 1, maxBattles: 3, draftSeconds: 5, battleSeconds: 5 } }),
    );
    const m = must(w.admin.createMatch(w.event.id, { name: "Duello" }));
    must(w.admin.library.addRound(m.id, duel.id));
    start(m.id);
    setTemp([{ name: "Tutti", color: "#123456", members: ["ada", "bob", "cleo", "dan"].map(id) }]);
    expect(next()).toEqual({ ok: false, error: "«Duello»: servono almeno due squadre della serata con dei giocatori" });
    expect(w.engine.screenState().phase).toBe("ready");
  });
});
