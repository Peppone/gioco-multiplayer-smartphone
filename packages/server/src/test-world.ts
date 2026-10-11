import { minigames } from "@gioco/minigames";
import { AdminService } from "./admin-service.js";
import { openDb } from "./db.js";
import { Engine } from "./engine.js";
import { PlayerService } from "./players.js";
import { ScoreService } from "./scores.js";

/** Mondo di prova per i test: 2 squadre, 4 giocatori, una partita con Quiz + Buzzer. */
export function buildWorld() {
  const clock = { t: 1_000 };
  const now = () => clock.t;
  const { db } = openDb(":memory:");
  const admin = new AdminService(db, now);
  const playerService = new PlayerService(db, now);
  const scores = new ScoreService(db, now);
  const rtt: Record<string, number | null> = {};
  const engine = new Engine({ db, registry: minigames, scores, now, rttOf: (id) => rtt[id] ?? null });

  const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  const red = must(admin.createTeam({ name: "Rossi", color: "#ff0000", emblem: "🔥" }));
  const blue = must(admin.createTeam({ name: "Blu", color: "#0000ff", emblem: "🌊" }));
  const event = admin.createEvent({ name: "Serata" });
  admin.setEventTeams(event.id, [red.id, blue.id]);

  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  for (const [nick, team] of [["ada", red], ["bob", red], ["cleo", blue], ["dan", blue]] as const) {
    const r = playerService.create({ nickname: nick, avatar: "🦊", color: "#112233" });
    if (!r.ok) throw new Error("player");
    ids[nick] = r.player.id;
    tokens[nick] = r.token;
    must(admin.assignPlayer(event.id, r.player.id, team.id));
  }

  const quizCfg = {
    questions: [
      { text: "Q quiz", options: ["a", "b", "c"], correctIndex: 1 },
      { text: "Q due", options: ["a", "b"], correctIndex: 0 },
    ],
  };
  const buzzCfg = { questions: [{ text: "Q buzzer", answer: "SEGRETA" }] };
  const quiz = must(admin.library.createInstance({ typeId: "quiz-multipla", title: "Quiz", config: quizCfg }));
  const buzz = must(admin.library.createInstance({ typeId: "buzzer", title: "Buzzer", config: buzzCfg }));

  const match = must(admin.createMatch(event.id, { name: "Partita 1", mode: "classic" }));
  must(admin.library.addRound(match.id, quiz.id));
  must(admin.library.addRound(match.id, buzz.id));

  return { clock, db, admin, engine, scores, ids, tokens, red, blue, event, match, rtt, playerService };
}

export type World = ReturnType<typeof buildWorld>;
