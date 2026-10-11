import { Countdown } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";

interface QuizQuestionView {
  phase: "question" | "reveal";
  index: number;
  total: number;
  question: string;
  options: string[];
  openedAt: number;
  deadline: number;
}
interface QuizScreenView extends QuizQuestionView {
  answered: number;
  playerCount: number;
  reveal?: { correctIndex: number; counts: number[] };
}
interface QuizPlayerView extends QuizQuestionView {
  myChoice: number | null;
  reveal?: { correctIndex: number; earned: number };
}
type Done = { phase: "done" };

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function QuizScreen({ view, clock }: ViewProps) {
  const v = view as QuizScreenView | Done;
  if (v.phase === "done") return <p className="big">Quiz concluso!</p>;
  return (
    <div className="quiz-screen">
      <p className="muted">Domanda {v.index + 1} di {v.total}</p>
      <h2 className="question">{v.question}</h2>
      {v.phase === "question" ? (
        <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />
      ) : (
        <p className="muted">Risposta rivelata</p>
      )}
      <div className="options">
        {v.options.map((o, i) => {
          const cls = v.reveal ? (i === v.reveal.correctIndex ? "right" : "dim") : "";
          return (
            <div key={i} className={`option opt-${i} ${cls}`}>
              <b>{LETTERS[i]}</b> {o}
              {v.reveal && <span className="count">{v.reveal.counts[i]}</span>}
            </div>
          );
        })}
      </div>
      <p className="muted">Hanno risposto {v.answered} / {v.playerCount}</p>
    </div>
  );
}

export function QuizController({ view, send, clock }: ControllerProps) {
  const v = view as QuizPlayerView | Done;
  if (v.phase === "done") return <p className="big">Quiz concluso!</p>;
  const locked = v.phase !== "question" || v.myChoice !== null;
  return (
    <div className="quiz-ctrl">
      <p className="muted">Domanda {v.index + 1} / {v.total}</p>
      <h2>{v.question}</h2>
      {v.phase === "question" && <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />}
      <div className="answers">
        {v.options.map((o, i) => {
          const state = v.reveal
            ? i === v.reveal.correctIndex
              ? "right"
              : i === v.myChoice
                ? "wrong"
                : "dim"
            : i === v.myChoice
              ? "chosen"
              : "";
          return (
            <button key={i} className={`answer opt-${i} ${state}`} disabled={locked} onClick={() => send({ type: "answer", choice: i })}>
              <b>{LETTERS[i]}</b> {o}
            </button>
          );
        })}
      </div>
      {v.phase === "question" && v.myChoice !== null && <p className="muted">Risposta inviata, aspetta gli altri…</p>}
      {v.reveal && (
        <p className="big">{v.reveal.earned > 0 ? `+${v.reveal.earned} punti!` : v.myChoice === null ? "Tempo scaduto" : "Risposta sbagliata"}</p>
      )}
    </div>
  );
}
