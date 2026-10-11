import { useEffect } from "react";
import { useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
import { Countdown } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";

interface StatementView {
  phase: "statement" | "reveal";
  index: number;
  total: number;
  text: string;
  openedAt: number;
  deadline: number;
}
interface ScreenView extends StatementView {
  answered: number;
  playerCount: number;
  reveal?: { answer: boolean; counts: { true: number; false: number } };
}
interface PlayerView extends StatementView {
  myAnswer: boolean | null;
  reveal?: { answer: boolean; correct: boolean | null; earned: number; streak: number };
}
type Done = { phase: "done" };

export function VeroFalsoScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenView | Done;
  const sfx = useSfx(theme);
  const index = v.phase === "done" ? -1 : v.index;
  const phase = v.phase;

  useEffect(() => {
    if (index >= 0) sfx("start", 0.35);
  }, [index, sfx]);
  useEffect(() => {
    if (phase === "reveal") sfx("reveal");
  }, [phase, index, sfx]);

  if (v.phase === "done") return <p className="big">Fine della raffica!</p>;
  const r = v.reveal;
  return (
    <div className="tf-screen">
      <Sfx theme={theme} text="BAM!" trigger={r ? v.index : null} />
      <p className="muted">Affermazione {v.index + 1} di {v.total}</p>
      <h2 className="question">{v.text}</h2>
      {v.phase === "statement" ? (
        <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} onTick={() => sfx("tick", 0.3)} />
      ) : (
        <p className="muted">Risposta rivelata</p>
      )}
      <div className="tf-row">
        <div className={`tf-tile tf-true ${r ? (r.answer ? "right" : "dim") : ""}`}>
          VERO {r && <span className="count">{r.counts.true}</span>}
        </div>
        <div className={`tf-tile tf-false ${r ? (!r.answer ? "right" : "dim") : ""}`}>
          FALSO {r && <span className="count">{r.counts.false}</span>}
        </div>
      </div>
      <p className="muted">Hanno risposto {v.answered} / {v.playerCount}</p>
    </div>
  );
}

export function VeroFalsoController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PlayerView | Done;
  const sfx = useSfx(theme);
  const reveal = v.phase === "reveal" ? v.reveal : undefined;
  const index = v.phase === "done" ? -1 : v.index;

  // Esito personale: chime se giusta, tono basso se sbagliata (niente suono se non ha risposto).
  useEffect(() => {
    if (!reveal) return;
    if (reveal.correct === true) sfx("correct");
    else if (reveal.correct === false) sfx("wrong");
  }, [reveal, index, sfx]);

  if (v.phase === "done") return <p className="big">Fine della raffica!</p>;
  const locked = v.phase !== "statement" || v.myAnswer !== null;
  const state = (value: boolean) => {
    if (v.reveal) return value === v.reveal.answer ? "right" : value === v.myAnswer ? "wrong" : "dim";
    return value === v.myAnswer ? "chosen" : "";
  };
  return (
    <div className="tf-ctrl">
      <p className="muted">Affermazione {v.index + 1} / {v.total}</p>
      <h2>{v.text}</h2>
      {v.phase === "statement" && <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />}
      <div className="tf-buttons">
        <button className={`tf-btn tf-true ${state(true)}`} disabled={locked} onClick={() => send({ type: "answer", value: true })}>
          VERO
        </button>
        <button className={`tf-btn tf-false ${state(false)}`} disabled={locked} onClick={() => send({ type: "answer", value: false })}>
          FALSO
        </button>
      </div>
      {v.phase === "statement" && v.myAnswer !== null && <p className="muted">Risposta inviata!</p>}
      {v.reveal && (
        <p className="big">
          {v.reveal.correct === null ? "Tempo scaduto" : v.reveal.correct ? `Giusto! +${v.reveal.earned}` : `Sbagliato${v.reveal.earned < 0 ? ` ${v.reveal.earned}` : ""}`}
          {v.reveal.streak >= 2 ? ` 🔥 x${v.reveal.streak}` : ""}
        </p>
      )}
    </div>
  );
}
