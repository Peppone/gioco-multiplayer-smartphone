import { useEffect, useRef } from "react";
import { useSfx } from "../../audio/useAudio";
import { Sfx } from "../../ui/Sfx";
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

export function BuzzerScreen({ view, theme }: ViewProps) {
  const v = view as BuzzerScreenView | Done;
  const sfx = useSfx(theme);
  const phase = v.phase;
  const answeringId = v.phase === "answering" ? v.answering?.playerId : undefined;
  const hasWinner = v.phase === "resolved" && v.winner?.playerId != null;

  // Il buzzer si apre: via; qualcuno risponde (anche il successivo in coda): campanello; esito: ok/ko.
  useEffect(() => {
    if (phase === "open") sfx("start");
  }, [phase, sfx]);
  useEffect(() => {
    if (answeringId) sfx("buzz");
  }, [answeringId, sfx]);
  useEffect(() => {
    if (phase === "resolved") sfx(hasWinner ? "correct" : "wrong");
  }, [phase, hasWinner, sfx]);

  if (v.phase === "done") return <p className="big">Buzzer concluso!</p>;
  return (
    <div className="buzzer-screen">
      <Sfx theme={theme} text="BZZT!" trigger={answeringId ?? null} />
      <Sfx theme={theme} text="BAM!" trigger={hasWinner ? v.index : null} />
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

export function BuzzerController({ view, send, theme }: ControllerProps) {
  const v = view as BuzzerPlayerView | Done;
  const sfx = useSfx(theme);
  const answering = v.phase !== "done" && v.isAnswering;
  const wasAnswering = useRef(false);

  // Tocca a te: avviso sonoro (la pressione stessa dà feedback immediato, vedi sotto).
  useEffect(() => {
    if (answering && !wasAnswering.current) sfx("start");
    wasAnswering.current = answering;
  }, [answering, sfx]);

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
        onPointerDown={() => {
          if (!v.canBuzz) return;
          send({ type: "buzz" });
          navigator.vibrate?.(30); // Android; iOS la ignora
          sfx("buzz", 0.5);
        }}
      >
        {label}
      </button>
    </div>
  );
}
