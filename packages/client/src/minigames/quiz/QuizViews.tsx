import { useEffect } from "react";
import { useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
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

export function QuizScreen({ view, clock, theme }: ViewProps) {
  const v = view as QuizScreenView | Done;
  const sfx = useSfx(theme);
  const phase = v.phase;
  const index = v.phase === "done" ? -1 : v.index;

  // Nuova domanda: jingle di partenza; rivelazione: colpo. (Una volta per cambio.)
  useEffect(() => {
    if (index >= 0) sfx("start");
  }, [index, sfx]);
  useEffect(() => {
    if (phase === "reveal") sfx("reveal");
  }, [phase, sfx]);

  if (v.phase === "done") return <p className="big">Quiz concluso!</p>;
  return (
    <div className="quiz-screen">
      <Sfx theme={theme} text="DON!" trigger={v.phase === "reveal" ? v.index : null} />
      <p className="muted">Domanda {v.index + 1} di {v.total}</p>
      <h2 className="question">{v.question}</h2>
      {v.phase === "question" ? (
        <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} onTick={() => sfx("tick", 0.4)} />
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

export function QuizController({ view, send, clock, theme }: ControllerProps) {
  const v = view as QuizPlayerView | Done;
  const sfx = useSfx(theme);
  const reveal = v.phase === "reveal" ? v.reveal : undefined;
  const answered = v.phase !== "done" && v.myChoice !== null;
  const earned = reveal?.earned ?? 0;

  // Esito personale a fine domanda: chime se ha preso punti, tono basso se ha sbagliato.
  useEffect(() => {
    if (!reveal) return;
    if (earned > 0) sfx("correct");
    else if (answered) sfx("wrong");
  }, [reveal, earned, answered, sfx]);

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
