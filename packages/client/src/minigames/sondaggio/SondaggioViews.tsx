import { useEffect } from "react";
import { useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
import { Countdown } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";

interface PollView {
  phase: "voting" | "reveal";
  index: number;
  total: number;
  question: string;
  kind: "options" | "players";
  options: string[];
  openedAt: number;
  deadline: number;
}
interface ScreenView extends PollView {
  voted: number;
  playerCount: number;
  reveal?: { bars: { label: string; count: number; top: boolean }[] };
}
interface PlayerView extends PollView {
  candidates: { id: string; nickname: string }[];
  /** Indice dell'opzione o id del giocatore votato; mai il voto di qualcun altro. */
  myVote: number | string | null;
  reveal?: { earned: number };
}
type Done = { phase: "done" };

export function SondaggioScreen({ view, clock, theme }: ViewProps) {
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

  if (v.phase === "done") return <p className="big">Sondaggio concluso!</p>;
  const total = v.reveal ? Math.max(1, v.reveal.bars.reduce((s, b) => s + b.count, 0)) : 1;
  return (
    <div className="poll-screen">
      <Sfx theme={theme} text="DON!" trigger={v.reveal ? v.index : null} />
      <p className="muted">Domanda {v.index + 1} di {v.total}</p>
      <h2 className="question">{v.question}</h2>
      {v.phase === "voting" ? (
        <>
          <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} onTick={() => sfx("tick", 0.4)} />
          {v.kind === "options" ? (
            <div className="options">
              {v.options.map((o, i) => <div key={i} className={`option opt-${i}`}>{o}</div>)}
            </div>
          ) : (
            <p className="big">Votate un giocatore dal telefono!</p>
          )}
          <p className="muted">Hanno votato {v.voted} / {v.playerCount} (voto anonimo)</p>
        </>
      ) : (
        v.reveal && (
          <ul className="bars">
            {v.reveal.bars.map((b, i) => (
              <li key={i} className={b.top ? "top" : ""}>
                <span className="label">{b.label}</span>
                <span className="track">
                  <span className={`fill opt-${i % 6}`} style={{ width: `${(b.count / total) * 100}%` }} />
                </span>
                <span className="n">{b.count}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

export function SondaggioController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PlayerView | Done;
  const sfx = useSfx(theme);
  const earned = v.phase === "reveal" ? (v.reveal?.earned ?? 0) : 0;
  const revealed = v.phase === "reveal";
  const index = v.phase === "done" ? -1 : v.index;

  useEffect(() => {
    if (revealed && earned > 0) sfx("correct");
  }, [revealed, earned, index, sfx]);

  if (v.phase === "done") return <p className="big">Sondaggio concluso!</p>;
  const voting = v.phase === "voting";
  return (
    <div className="poll-ctrl">
      <p className="muted">Domanda {v.index + 1} / {v.total}</p>
      <h2>{v.question}</h2>
      {voting && <Countdown openedAt={v.openedAt} deadline={v.deadline} clock={clock} />}
      <div className="answers">
        {v.kind === "options"
          ? v.options.map((o, i) => (
              <button key={i} className={`answer opt-${i} ${v.myVote === i ? "chosen" : ""}`} disabled={!voting} onClick={() => send({ type: "vote", option: i })}>
                {o}
              </button>
            ))
          : v.candidates.map((c, i) => (
              <button key={c.id} className={`answer opt-${i % 6} ${v.myVote === c.id ? "chosen" : ""}`} disabled={!voting} onClick={() => send({ type: "vote", target: c.id })}>
                {c.nickname}
              </button>
            ))}
      </div>
      {voting && <p className="muted">{v.myVote === null ? "Il tuo voto è anonimo." : "Voto inviato: puoi cambiarlo finché c'è tempo."}</p>}
      {revealed && <p className="big">{earned > 0 ? `+${earned} punti!` : "Risultati sullo schermo"}</p>}
    </div>
  );
}
