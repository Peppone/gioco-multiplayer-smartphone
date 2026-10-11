import { useMemo, useState } from "react";
import { ClockSync, type Leaderboards, REACTIONS, type ThemeId } from "@gioco/shared";
import { type SoundName, audio } from "../audio/audio";
import { minigameViews } from "../minigames/registry";
import { Leaderboard } from "../ui/Leaderboard";
import { MuteButton } from "../ui/MuteButton";
import { Stage } from "../ui/Stage";

const THEMES: { id: ThemeId; label: string }[] = [
  { id: "gameshow", label: "Game show" },
  { id: "pixel", label: "Pixel" },
  { id: "manga", label: "Manga" },
  { id: "retro80", label: "Retro 80" },
];

const SOUNDS: SoundName[] = ["start", "tick", "buzz", "correct", "wrong", "reveal", "fanfare"];

const BOARDS: Leaderboards = {
  teams: [
    { id: "t1", name: "Rossi", avatar: "🔥", color: "#ef4444", points: 2350, rank: 1 },
    { id: "t2", name: "Blu", avatar: "🌊", color: "#3b82f6", points: 1980, rank: 2 },
  ],
  players: [
    { id: "p1", name: "Gina", avatar: "🦊", color: "#ef4444", points: 1200, rank: 1 },
    { id: "p2", name: "Marco", avatar: "🐻", color: "#3b82f6", points: 1120, rank: 2 },
    { id: "p3", name: "Sofia", avatar: "🐼", color: "#3b82f6", points: 860, rank: 3 },
    { id: "p4", name: "Luca", avatar: "🐸", color: "#ef4444", points: 860, rank: 3 },
  ],
};
const BOARDS_BEFORE: Leaderboards = {
  teams: [
    { ...BOARDS.teams[1]!, points: 1500, rank: 1 },
    { ...BOARDS.teams[0]!, points: 1350, rank: 2 },
  ],
  players: BOARDS.players.map((p, i) => ({ ...p, points: p.points - 300 + i * 40 })),
};

type Scene = "quiz-question" | "quiz-reveal" | "buzzer-open" | "buzzer-answering" | "results";

const SCENES: { id: Scene; label: string }[] = [
  { id: "quiz-question", label: "Quiz: domanda" },
  { id: "quiz-reveal", label: "Quiz: rivelazione" },
  { id: "buzzer-open", label: "Buzzer: aperto" },
  { id: "buzzer-answering", label: "Buzzer: risponde" },
  { id: "results", label: "Classifica" },
];

function sceneViews(scene: Scene, now: number) {
  const q = {
    index: 2,
    total: 10,
    question: "Quale pianeta è chiamato «il pianeta rosso»?",
    options: ["Venere", "Marte", "Giove", "Saturno"],
    openedAt: now,
    deadline: now + 15_000,
  };
  switch (scene) {
    case "quiz-question":
      return {
        typeId: "quiz-multipla",
        screen: { phase: "question", ...q, answered: 7, playerCount: 12 },
        phone: { phase: "question", ...q, myChoice: null },
      };
    case "quiz-reveal":
      return {
        typeId: "quiz-multipla",
        screen: { phase: "reveal", ...q, answered: 12, playerCount: 12, reveal: { correctIndex: 1, counts: [1, 8, 2, 1] } },
        phone: { phase: "reveal", ...q, myChoice: 1, reveal: { correctIndex: 1, earned: 820 } },
      };
    case "buzzer-open":
      return {
        typeId: "buzzer",
        screen: { phase: "open", index: 1, total: 8, question: "Chi ha dipinto la Gioconda?", answering: null, queue: [], current: 0, winner: null },
        phone: { phase: "open", question: "Chi ha dipinto la Gioconda?", canBuzz: true, buzzed: false, isAnswering: false, position: null, won: false },
      };
    case "buzzer-answering":
      return {
        typeId: "buzzer",
        screen: {
          phase: "answering",
          index: 1,
          total: 8,
          question: "Chi ha dipinto la Gioconda?",
          answering: { playerId: "p1", nickname: "Gina" },
          queue: [
            { playerId: "p1", nickname: "Gina" },
            { playerId: "p2", nickname: "Marco" },
            { playerId: "p3", nickname: "Sofia" },
          ],
          current: 0,
          winner: null,
        },
        phone: { phase: "answering", question: "Chi ha dipinto la Gioconda?", canBuzz: false, buzzed: true, isAnswering: true, position: 0, won: false },
      };
    case "results":
      return { typeId: null, screen: null, phone: null };
  }
}

/** Anteprima dei theme pack con viste d'esempio: per scegliere il look senza giocare una partita. */
export function Preview() {
  // Si può aprire direttamente su un tema/scena: /preview?theme=manga&scene=quiz-reveal
  const params = new URLSearchParams(window.location.search);
  const [theme, setTheme] = useState<ThemeId>(THEMES.find((t) => t.id === params.get("theme"))?.id ?? "gameshow");
  const [scene, setScene] = useState<Scene>(SCENES.find((x) => x.id === params.get("scene"))?.id ?? "quiz-question");
  const [run, setRun] = useState(0); // cambia per riavviare countdown e animazioni
  const clock = useMemo(() => new ClockSync(), []);
  const now = useMemo(() => Date.now(), [run, scene]);
  const data = sceneViews(scene, now);
  const views = data.typeId ? minigameViews[data.typeId] : undefined;

  return (
    <div className="preview">
      <header className="preview-bar">
        <h1>Anteprima temi</h1>
        <div className="row">
          {THEMES.map((t) => (
            <button key={t.id} className={t.id === theme ? "primary" : ""} onClick={() => setTheme(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="row">
          {SCENES.map((s) => (
            <button key={s.id} className={s.id === scene ? "primary" : ""} onClick={() => { setScene(s.id); setRun((r) => r + 1); }}>{s.label}</button>
          ))}
          <button onClick={() => setRun((r) => r + 1)}>↻ Riavvia</button>
        </div>
        <div className="row">
          <span className="muted">Suoni:</span>
          {SOUNDS.map((s) => <button key={s} onClick={() => audio.play(theme, s)}>{s}</button>)}
          <MuteButton />
        </div>
      </header>

      <div className="preview-grid">
        <section>
          <h3>Schermo condiviso</h3>
          <div className="preview-frame screen-frame">
            <main className="screen" data-theme={theme}>
              <Stage theme={theme} id={`${scene}-${run}-${theme}`}>
                {views && data.screen ? (
                  <views.Screen view={data.screen} clock={clock} theme={theme} title="Anteprima" />
                ) : (
                  <>
                    <h2>Classifica dopo il round 3</h2>
                    <Leaderboard key={run} data={BOARDS} previous={BOARDS_BEFORE} />
                  </>
                )}
              </Stage>
            </main>
          </div>
        </section>

        <section>
          <h3>Telefono</h3>
          <div className="preview-frame phone-frame">
            <main className="controller" data-theme={theme}>
              <Stage theme={theme} id={`${scene}-${run}-${theme}`}>
                {views && data.phone ? (
                  <views.Controller view={data.phone} clock={clock} theme={theme} title="Anteprima" send={() => undefined} />
                ) : (
                  <p className="big">1200 punti · 1° posto</p>
                )}
              </Stage>
              <div className="reaction-bar static">
                {REACTIONS.map((e) => <button key={e} type="button">{e}</button>)}
              </div>
            </main>
          </div>
        </section>
      </div>
    </div>
  );
}
