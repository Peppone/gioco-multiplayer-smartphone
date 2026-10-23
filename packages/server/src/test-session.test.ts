import { beforeEach, describe, expect, it } from "vitest";
import { minigames } from "@gioco/minigames";
import { AdminService } from "./admin-service.js";
import { eventPlayers, events, matchStateSnapshots, matches, openDb, players, teams } from "./db.js";
import { Engine } from "./engine.js";
import { PlayerService } from "./players.js";
import { ScoreService } from "./scores.js";
import { TestSession } from "./test-session.js";

function build() {
  const { db } = openDb(":memory:");
  const admin = new AdminService(db);
  const playerService = new PlayerService(db);
  const engine = new Engine({ db, registry: minigames, scores: new ScoreService(db), now: Date.now, rttOf: () => null });
  admin.onRosterChange = (eventId) => engine.syncRoster(eventId);
  const session = new TestSession(db, engine, admin, playerService, minigames);
  const must = <T>(r: { ok: true; value: T } | { ok: false; error: string; detail?: string }): T => {
    if (!r.ok) throw new Error(`${r.error} ${r.detail ?? ""}`);
    return r.value;
  };
  return { db, admin, playerService, engine, session, must };
}

let w: ReturnType<typeof build>;
beforeEach(() => {
  w = build();
});

/** Istanza pronta per ogni minigioco: l'esempio del plugin, o per il duello un'istanza che riferisce un quiz in libreria. */
function instanceFor(typeId: string): string {
  const plugin = minigames[typeId]!;
  if (typeId === "knight-duel") {
    const quiz = w.must(
      w.admin.library.createInstance({
        typeId: "vero-falso",
        title: "Raffica",
        config: { statements: [{ text: "Il mare è salato.", answer: true }], timeSec: 5, revealSec: 1 },
      }),
    );
    return w.must(w.admin.library.createInstance({ typeId, title: plugin.title, config: { pool: [quiz.id], hp: 10, minigamesPerBattle: 1, maxBattles: 3, draftSeconds: 5, battleSeconds: 5 } })).id;
  }
  return w.must(w.admin.library.createInstance({ typeId, title: plugin.title, config: plugin.sampleConfig })).id;
}

const count = (table: typeof players | typeof teams | typeof events) => w.db.select().from(table).all().length;

describe("prova rapida di un minigioco", () => {
  // Ogni minigioco si prova con un clic: stessa prova per tutti, un plugin nuovo la eredita senza scrivere nulla.
  describe.each(Object.keys(minigames))("«%s»", (typeId) => {
    it("parte da sola nel primo round con i telefoni di prova, e a fine prova non resta nulla", () => {
      const started = w.session.start({ instanceId: instanceFor(typeId) });
      expect(started.ok, started.ok ? "" : `${started.error} ${started.detail}`).toBe(true);
      if (!started.ok) return;
      const info = started.value;

      const screen = w.engine.screenState();
      expect(screen.phase).toBe("round");
      expect(screen.frame?.typeId).toBe(typeId);
      const plugin = minigames[typeId]!;
      expect(info.players.length).toBeGreaterThanOrEqual(plugin.minPlayers ?? 1);
      if (plugin.maxPlayers) expect(info.players.length).toBeLessThanOrEqual(plugin.maxPlayers);
      for (const p of info.players) {
        const state = w.engine.playerState(p.id);
        expect(state.inRoster).toBe(true);
        expect(state.frame?.typeId).toBe(typeId);
        expect(w.playerService.resume(p.token).ok).toBe(true); // il token apre il telefono di prova
      }
      // I token servono solo alla regia: nessuna vista di gioco li contiene.
      expect(JSON.stringify([screen, w.engine.adminState(), ...info.players.map((p) => w.engine.playerState(p.id))])).not.toContain(info.players[0]!.token);

      w.session.stop();
      expect(w.engine.currentMatchId).toBeNull();
      expect(w.session.get()).toBeNull();
      expect([count(players), count(teams), count(events)]).toEqual([0, 0, 0]);
      expect(w.db.select().from(matches).all()).toEqual([]);
      expect(w.db.select().from(eventPlayers).all()).toEqual([]);
    });
  });

  it("i giocatori, le squadre e la serata di prova restano nascosti agli elenchi della regia e alla lobby", () => {
    w.must(w.admin.createTeam({ name: "Vera", color: "#112233", emblem: "🌟" }));
    const real = w.playerService.create({ nickname: "Vera Ada", avatar: "🦊", color: "#112233" });
    expect(real.ok).toBe(true);
    w.admin.createEvent({ name: "Serata vera" });

    const started = w.must(w.session.start({ instanceId: instanceFor("buzzer") }));
    expect(started.players.length).toBeGreaterThan(1);
    expect(count(players)).toBeGreaterThan(1); // nel database ci sono…
    expect(w.admin.listPlayers().map((p) => p.nickname)).toEqual(["Vera Ada"]); // …ma nelle liste no
    expect(w.admin.listPlayerDetails().map((p) => p.nickname)).toEqual(["Vera Ada"]);
    expect(w.playerService.list().map((p) => p.nickname)).toEqual(["Vera Ada"]);
    expect(w.admin.listTeams().map((t) => t.name)).toEqual(["Vera"]);
    expect(w.admin.listEvents().map((e) => e.name)).toEqual(["Serata vera"]);

    w.session.stop();
    expect(w.admin.listPlayers().map((p) => p.nickname)).toEqual(["Vera Ada"]); // quelli veri non si toccano
    expect(count(events)).toBe(1);
    expect(count(teams)).toBe(1);
  });

  it("con le squadre i giocatori si dividono in due e ognuna ha un capitano; senza squadre nessuno ne ha", () => {
    const withTeams = w.must(w.session.start({ instanceId: instanceFor("buzzer"), players: 6 }));
    expect(withTeams.players).toHaveLength(6);
    const names = new Set(withTeams.players.map((p) => p.teamName));
    expect(names.size).toBe(2);
    expect(withTeams.players.filter((p) => p.teamName === [...names][0]).length).toBe(3);
    expect(w.db.select().from(eventPlayers).all().filter((r) => r.captain === 1)).toHaveLength(2);
    w.session.stop();

    const flat = w.must(w.session.start({ instanceId: instanceFor("buzzer"), players: 3, teams: false }));
    expect(flat.players.every((p) => p.teamName === null)).toBe(true);
    expect(w.db.select().from(eventPlayers).all().every((r) => r.teamId === null && r.captain === 0)).toBe(true);
    w.session.stop();
  });

  it("evita i nomi già presi da giocatori e squadre vere", () => {
    w.playerService.create({ nickname: "Prova 1", avatar: "🦊", color: "#112233" });
    w.must(w.admin.createTeam({ name: "Rossi (prova)", color: "#112233", emblem: "🌟" }));
    const started = w.must(w.session.start({ instanceId: instanceFor("buzzer"), players: 2 }));
    expect(started.players.map((p) => p.nickname)).toEqual(["Prova 1·", "Prova 2"]);
    expect(started.players[0]!.teamName).toBe("Rossi (prova)·");
  });

  it("rifiuta contenuti che non sono minigiochi, istanze inesistenti e numeri di giocatori impossibili, senza lasciare tracce", () => {
    const deck = w.must(w.admin.library.createInstance({ typeId: "word-list", title: "Parole", config: { words: Array.from({ length: 30 }, (_, i) => `parola${i}`) } }));
    const notPlayable = w.session.start({ instanceId: deck.id });
    expect(notPlayable).toMatchObject({ ok: false, error: "invalid" });
    expect(w.session.start({ instanceId: "boh" })).toMatchObject({ ok: false, error: "not_found" });

    const tooMany = w.session.start({ instanceId: instanceFor("parole-mannare"), players: 25 });
    expect(tooMany.ok).toBe(false);
    expect(w.engine.currentMatchId).toBeNull(); // l'avvio fallito non occupa l'engine
    expect([count(players), count(teams), count(events)]).toEqual([0, 0, 0]);
    expect(w.session.get()).toBeNull();
  });

  it("non si può provare mentre si gioca una partita vera", () => {
    const event = w.admin.createEvent({ name: "Serata vera" });
    const real = w.must(w.admin.createMatch(event.id, { name: "Partita" }));
    const p = w.playerService.create({ nickname: "Ada", avatar: "🦊", color: "#112233" });
    if (!p.ok) throw new Error("player");
    w.admin.assignPlayer(event.id, p.player.id, null);
    w.must(w.admin.library.addRound(real.id, instanceFor("buzzer")));
    expect(w.engine.hostCommand({ type: "start", matchId: real.id })).toEqual({ ok: true });

    const blocked = w.session.start({ instanceId: instanceFor("buzzer") });
    expect(blocked).toMatchObject({ ok: false, error: "conflict" });
    expect(w.engine.currentMatchId).toBe(real.id); // la partita vera non è stata toccata
    expect(count(players)).toBe(1);
  });

  it("una nuova prova sostituisce quella in corso", () => {
    const first = w.must(w.session.start({ instanceId: instanceFor("buzzer"), players: 2 }));
    const second = w.must(w.session.start({ instanceId: instanceFor("quiz-multipla"), players: 3 }));
    expect(second.matchId).not.toBe(first.matchId);
    expect(second.players).toHaveLength(3);
    expect(count(players)).toBe(3);
    expect(count(events)).toBe(1);
    expect(w.engine.currentMatchId).toBe(second.matchId);
  });

  it("se la regia riporta l'engine alla lobby dal pannello Live, la prova si ripulisce da sola", () => {
    w.must(w.session.start({ instanceId: instanceFor("buzzer") }));
    w.session.sweep();
    expect(w.session.get()).not.toBeNull(); // finché la partita c'è non si tocca nulla

    w.engine.hostCommand({ type: "engine", action: "end-match" });
    w.session.sweep();
    expect(w.session.get()).not.toBeNull(); // conclusa ma non chiusa: la classifica finale è ancora sullo schermo
    w.engine.hostCommand({ type: "engine", action: "close" });
    w.session.sweep();
    expect(w.session.get()).toBeNull();
    expect([count(players), count(teams), count(events)]).toEqual([0, 0, 0]);
  });

  it("al riavvio i resti di una prova sparioscono, compresa la fotografia della partita", () => {
    const info = w.must(w.session.start({ instanceId: instanceFor("buzzer") }));
    w.db.insert(matchStateSnapshots).values({ matchId: info.matchId, stateJson: "{}", ts: 1 }).run();

    const afterRestart = new TestSession(w.db, new Engine({ db: w.db, registry: minigames, scores: new ScoreService(w.db), now: Date.now, rttOf: () => null }), w.admin, w.playerService, minigames);
    afterRestart.purge();
    expect([count(players), count(teams), count(events)]).toEqual([0, 0, 0]);
    expect(w.db.select().from(matchStateSnapshots).all()).toEqual([]);
  });

  it("i punti della prova non restano: la serata sparisce con il suo registro", () => {
    const info = w.must(w.session.start({ instanceId: instanceFor("buzzer"), players: 2 }));
    w.engine.hostCommand({ type: "adjust", playerId: info.players[0]!.id, teamId: null, points: 50, reason: "prova" });
    expect(w.engine.screenState().leaderboards).toBeUndefined(); // in un round la classifica non si mostra
    w.session.stop();
    expect(w.db.$client.prepare("SELECT count(*) AS n FROM score_entries").get()).toEqual({ n: 0 });
  });
});
