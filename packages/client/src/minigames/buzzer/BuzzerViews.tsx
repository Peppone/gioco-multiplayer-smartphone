import type { ControllerProps, ViewProps } from "../types";

interface BuzzerScreenView {
  phase: "idle" | "open" | "collecting" | "answering" | "resolved";
  index: number;
  total: number;
  question: string;
  answering: { playerId: string; nickname: string | null } | null;
  queue: { playerId: string; nickname: string | null }[];
  current: number;
  winner: { playerId: string | null; nickname: string | null; points: number } | null;
}
interface BuzzerPlayerView {
  phase: BuzzerScreenView["phase"];
  question: string;
  canBuzz: boolean;
  buzzed: boolean;
  isAnswering: boolean;
  position: number | null;
  won: boolean;
}
type Done = { phase: "done" };

export function BuzzerScreen({ view }: ViewProps) {
  const v = view as BuzzerScreenView | Done;
  if (v.phase === "done") return <p className="big">Buzzer concluso!</p>;
  return (
    <div className="buzzer-screen">
      <p className="muted">Domanda {v.index + 1} di {v.total}</p>
      <h2 className="question">{v.question}</h2>
      {v.phase === "idle" && <p className="big">Pronti…</p>}
      {(v.phase === "open" || v.phase === "collecting") && <p className="big pulse">PRENOTATEVI!</p>}
      {v.phase === "answering" && v.answering && (
        <>
          <p className="big">🔔 {v.answering.nickname} risponde!</p>
          {v.queue.length > 1 && (
            <ol className="queue">
              {v.queue.map((p, i) => (
                <li key={p.playerId} className={i === v.current ? "now" : i < v.current ? "done" : ""}>{p.nickname}</li>
              ))}
            </ol>
          )}
        </>
      )}
      {v.phase === "resolved" && (
        <p className="big">
          {v.winner?.playerId ? `${v.winner.nickname} +${v.winner.points}!` : "Nessun punto per questa domanda"}
        </p>
      )}
    </div>
  );
}

export function BuzzerController({ view, send }: ControllerProps) {
  const v = view as BuzzerPlayerView | Done;
  if (v.phase === "done") return <p className="big">Buzzer concluso!</p>;

  let label = "Aspetta…";
  if (v.phase === "open" || v.phase === "collecting") label = v.buzzed ? "Prenotato!" : "BUZZ!";
  if (v.phase === "answering") label = v.isAnswering ? "Tocca a te: rispondi a voce!" : v.buzzed ? `Sei in coda (${v.position})` : "BUZZ!";
  if (v.phase === "resolved") label = v.won ? "Hai vinto la domanda! 🎉" : "Domanda chiusa";

  return (
    <div className="buzzer-ctrl">
      <h2>{v.question}</h2>
      <button
        className={`buzz-btn ${v.isAnswering ? "answering" : ""}`}
        disabled={!v.canBuzz}
        // pointerdown e non click: niente ritardo di 300 ms su mobile.
        onPointerDown={() => v.canBuzz && send({ type: "buzz" })}
      >
        {label}
      </button>
    </div>
  );
}
