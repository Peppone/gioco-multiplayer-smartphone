import { useEffect, useState } from "react";
import { useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
import { Countdown } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";

interface QuestionView {
  phase: "question" | "reveal";
  index: number;
  total: number;
  question: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  openedAt: number;
  deadline: number;
}
interface ScreenView extends QuestionView {
  answered: number;
  playerCount: number;
  reveal?: { answer: number; results: { nickname: string; value: number; distance: number; rank: number; points: number }[] };
}
interface PlayerView extends QuestionView {
  myGuess: number | null;
  reveal?: { answer: number; distance: number | null; rank: number | null; points: number };
}
type Done = { phase: "done" };

const fmt = (n: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(n);

export function StimaScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenView | Done;
  const sfx = useSfx(theme);
  const index = v.phase === "done" ? -1 : v.index;
  const phase = v.phase;

  useEffect(() => {
    if (index >= 0) sfx("start", 0.4);
  }, [index, sfx]);
  useEffect(() => {
    if (phase === "reveal") sfx("reveal");
  }, [phase, index, sfx]);

  if (v.phase === "done") return <p className="big">Stime concluse!</p>;
  const unit = v.unit ? ` ${v.unit}` : "";
  return (
    <div className="stima-screen">
      <Sfx theme={theme} text="DON!" trigger={v.reveal ? v.index : null} />
      <p className="muted">Domanda {v.index + 1} di {v.total}</p>
      <h2 className="question">{v.question}</h2>
      {v.phase === "question" ? (
        <>
          <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} onTick={() => sfx("tick", 0.4)} />
          <p className="big">Inviate la vostra stima dal telefono!</p>
          <p className="muted">Hanno risposto {v.answered} / {v.playerCount}</p>
        </>
      ) : (
        v.reveal && (
          <>
            <p className="big">Risposta: {fmt(v.reveal.answer)}{unit}</p>
            <ol className="results">
              {v.reveal.results.map((r, i) => (
                <li key={i} className={r.rank === 1 ? "top" : ""}>
                  <span className="rank">{r.rank}</span>
                  <span className="who">{r.nickname}</span>
                  <span className="val">{fmt(r.value)}{unit}</span>
                  <span className="dist">{r.distance === 0 ? "esatto!" : `± ${fmt(r.distance)}`}</span>
                  <span className="pts">+{r.points}</span>
                </li>
              ))}
              {v.reveal.results.length === 0 && <li className="muted">Nessuna stima inviata.</li>}
            </ol>
          </>
        )
      )}
    </div>
  );
}

/** Campo di stima: cursore se la domanda ha minimo e massimo, altrimenti numero libero. Si può cambiare idea. */
function GuessForm({ v, send }: { v: PlayerView; send: ControllerProps["send"] }) {
  const hasRange = v.min !== null && v.max !== null;
  const [text, setText] = useState(v.myGuess !== null ? String(v.myGuess) : hasRange ? String(Math.round((v.min! + v.max!) / 2)) : "");
  const value = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && Number.isFinite(value) && (!hasRange || (value >= v.min! && value <= v.max!));

  return (
    <form
      className="guess-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) send({ type: "guess", value });
      }}
    >
      {hasRange && (
        <input
          type="range"
          aria-label="Cursore della stima"
          min={v.min!}
          max={v.max!}
          step={(v.max! - v.min!) / 200}
          value={valid ? value : v.min!}
          onChange={(e) => setText(String(Number(Number(e.target.value).toPrecision(6))))}
        />
      )}
      <input
        inputMode="decimal"
        aria-label="La tua stima"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`La tua stima${v.unit ? ` (${v.unit})` : ""}`}
      />
      <button className="primary" type="submit" disabled={!valid}>
        {v.myGuess === null ? "Invia" : "Aggiorna"}
      </button>
      {v.myGuess !== null && <p className="muted">Tua stima: {fmt(v.myGuess)}{v.unit ? ` ${v.unit}` : ""} (puoi cambiarla finché c'è tempo)</p>}
    </form>
  );
}

export function StimaController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PlayerView | Done;
  const sfx = useSfx(theme);
  const reveal = v.phase === "reveal" ? v.reveal : undefined;
  const index = v.phase === "done" ? -1 : v.index;

  useEffect(() => {
    if (!reveal) return;
    if (reveal.rank === 1) sfx("correct");
    else if (reveal.rank === null) sfx("wrong", 0.3);
  }, [reveal, index, sfx]);

  if (v.phase === "done") return <p className="big">Stime concluse!</p>;
  return (
    <div className="stima-ctrl">
      <p className="muted">Domanda {v.index + 1} / {v.total}</p>
      <h2>{v.question}</h2>
      {v.phase === "question" ? (
        <>
          <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />
          {/* key: ad ogni domanda il modulo riparte pulito */}
          <GuessForm key={v.index} v={v} send={send} />
        </>
      ) : (
        v.reveal && (
          <>
            <p className="big">Risposta: {fmt(v.reveal.answer)}{v.unit ? ` ${v.unit}` : ""}</p>
            {v.reveal.rank === null ? (
              <p className="muted">Non hai inviato la stima.</p>
            ) : (
              <p className="big">
                {v.reveal.rank}° posto · {v.reveal.distance === 0 ? "esatto!" : `± ${fmt(v.reveal.distance!)}`} · +{v.reveal.points}
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}
