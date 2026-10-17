import { useEffect } from "react";
import { useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
import { Countdown } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";
import "./scalata.css";

interface Person {
  id: string;
  nickname: string;
}
interface QuestionView {
  phase: "question" | "reveal";
  index: number;
  total: number;
  question: string;
  options: string[];
  openedAt: number;
  deadline: number;
  prize: number;
  alive: Person[];
  playerCount: number;
}
interface ScreenView extends QuestionView {
  answered: number;
  reveal?: { correctIndex: number; counts: number[]; eliminated: Person[]; top: (Person & { points: number; alive: boolean })[] };
}
interface PlayerView extends QuestionView {
  status: "alive" | "falling" | "out";
  myChoice: number | null;
  myPoints: number;
  reveal?: { correctIndex: number; earned: number };
}
interface DoneView {
  phase: "done";
  prize: number;
  byScore: boolean;
  winners: (Person & { points: number })[];
  status?: "survivor" | "out";
  eliminatedAt?: number | null;
  myPoints?: number;
  isWinner?: boolean;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function Ladder({ index, total, prize, alive }: { index: number; total: number; prize: number; alive: number }) {
  return (
    <div className="sc-head">
      <span>Livello {index + 1} di {total}</span>
      <span className="sc-prize">In palio: {prize} punti</span>
      <span>Senza errori: {alive}</span>
    </div>
  );
}

function Winners({ v }: { v: DoneView }) {
  if (v.winners.length === 0) return <p className="big">Nessuno ha preso il montepremi.</p>;
  return (
    <>
      <p className="big">
        {v.winners.length === 1 ? "Ha vinto" : "Hanno vinto"}
        {v.byScore ? " col punteggio più alto" : " senza sbagliare mai"}!
      </p>
      <ul className="sc-winners">
        {v.winners.map((w) => <li key={w.id}><b>{w.nickname}</b> +{w.points}</li>)}
      </ul>
    </>
  );
}

export function ScalataScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenView | DoneView;
  const sfx = useSfx(theme);
  const phase = v.phase;
  const index = v.phase === "done" ? -1 : v.index;
  const fallen = v.phase === "reveal" ? (v.reveal?.eliminated.length ?? 0) : 0;

  useEffect(() => {
    if (index >= 0) sfx("start");
  }, [index, sfx]);
  useEffect(() => {
    if (phase === "reveal") sfx(fallen > 0 ? "wrong" : "reveal");
    if (phase === "done") sfx("fanfare");
  }, [phase, fallen, sfx]);

  if (v.phase === "done") {
    return (
      <div className="sc-screen">
        <Winners v={v} />
      </div>
    );
  }
  return (
    <div className="quiz-screen sc-screen">
      <Sfx theme={theme} text="FUORI!" trigger={fallen > 0 ? v.index : null} />
      <Ladder index={v.index} total={v.total} prize={v.prize} alive={v.alive.length} />
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
      {v.phase === "question" && <p className="muted">Hanno risposto {v.answered} / {v.playerCount}</p>}
      {v.reveal && (
        <>
          <p className="sc-verdict">{fallen > 0 ? `Primo errore per: ${v.reveal.eliminated.map((p) => p.nickname).join(", ")}` : "Nessun nuovo eliminato!"}</p>
          <ol className="sc-top" aria-label="Classifica provvisoria">
            {v.reveal.top.map((p) => (
              <li key={p.id} className={p.alive ? "" : "out"}>{p.nickname} <b>{p.points}</b></li>
            ))}
          </ol>
        </>
      )}
      <ul className="sc-alive" aria-label="Ancora senza errori">
        {v.alive.map((p) => <li key={p.id}>{p.nickname}</li>)}
      </ul>
    </div>
  );
}

export function ScalataController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PlayerView | DoneView;
  const sfx = useSfx(theme);
  const earned = v.phase === "reveal" ? v.reveal?.earned : undefined;
  const falling = v.phase === "reveal" && v.status === "falling";
  const index = v.phase === "done" ? -1 : v.index;

  useEffect(() => {
    if (earned === undefined) return;
    if (earned > 0) sfx("correct");
    else if (falling) sfx("wrong");
  }, [earned, falling, index, sfx]);

  if (v.phase === "done") {
    return (
      <div className="quiz-ctrl sc-ctrl">
        <p className="big">
          {v.isWinner ? `Hai vinto il montepremi! Totale +${v.myPoints ?? 0}` : `Hai fatto ${v.myPoints ?? 0} punti`}
        </p>
        {!v.isWinner && v.eliminatedAt != null && <p className="muted">Primo errore al livello {v.eliminatedAt + 1}</p>}
        <Winners v={v} />
      </div>
    );
  }
  const locked = v.phase !== "question" || v.myChoice !== null;
  return (
    <div className="quiz-ctrl sc-ctrl">
      <Ladder index={v.index} total={v.total} prize={v.prize} alive={v.alive.length} />
      {v.status === "out" && <p className="sc-out">Hai già sbagliato: le risposte giuste valgono meno</p>}
      <p className="muted">I tuoi punti: {v.myPoints}</p>
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
        <p className="big">
          {v.reveal.earned > 0 ? `+${v.reveal.earned} punti!` : falling ? "Sbagliato: sei fuori dal montepremi" : "Nessun punto"}
        </p>
      )}
    </div>
  );
}
