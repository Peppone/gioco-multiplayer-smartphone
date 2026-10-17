import { useEffect, useRef } from "react";
import type { ClockSync } from "@gioco/shared";
import { useSfx } from "../../audio/useAudio";
import { useRemaining } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";
import "./reazione.css";
import type { DoneView, GameEvent, PlayerTurnView, TurnSummary, TurnView } from "./types";

/** Secondi rimasti: scorrono solo mentre il tempo corre, altrimenti restano fermi sul valore del server. */
export function useTurnRemaining(v: Pick<TurnView, "running" | "deadline" | "timeLeftMs">, clock: ClockSync): number {
  const live = useRemaining(v.deadline ?? 0, clock);
  return v.running ? live : (v.timeLeftMs ?? 0);
}

export function Timer({ view, clock }: { view: Pick<TurnView, "running" | "deadline" | "timeLeftMs" | "totalMs">; clock: ClockSync }) {
  const ms = useTurnRemaining(view, clock);
  const seconds = Math.ceil(ms / 1000);
  return (
    <>
      <div className={`rc-timer ${view.running ? "" : "frozen"} ${seconds <= 10 ? "low" : ""}`} role="timer" aria-label="Tempo rimasto">
        {seconds}
      </div>
      <div className="rc-bar"><div style={{ width: `${Math.min(100, (ms / Math.max(1, view.totalMs)) * 100)}%` }} /></div>
    </>
  );
}

export function Stats({ v }: { v: Pick<TurnView, "correct" | "wrong" | "passesLeft" | "points"> }) {
  return (
    <div className="rc-stats">
      <span className="ok">✔ {v.correct}</span>
      <span className="ko">✘ {v.wrong}</span>
      <span>↷ {v.passesLeft}</span>
      <span>{v.points >= 0 ? "+" : ""}{v.points} pt</span>
    </div>
  );
}

/** Frase di stato: cosa sta succedendo e che cosa si aspetta. */
export function statusText(v: Pick<TurnView, "phase" | "pauseReason" | "wordShown">): string {
  if (v.phase === "setup") return "La regia sta scegliendo i giocatori…";
  if (v.phase === "turn-over") return "Turno finito!";
  if (v.phase === "playing") return "Via!";
  switch (v.pauseReason) {
    case "answer": return "Risposta! Il tempo è fermo";
    case "pass": return "Passata. Si aspetta il via del master";
    case "ready": return "Tempo fermo: si aspetta il via del master";
    default: return v.wordShown ? "Tempo fermo dal master" : "Si aspetta il via del master";
  }
}

/** Suoni sugli eventi del turno (l'evento ha un contatore `n`, così non si ripetono). */
function useEventSfx(event: GameEvent | null, theme: ViewProps["theme"], enabled: boolean) {
  const sfx = useSfx(theme);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!event) return;
    if (last.current === null) {
      last.current = event.n; // al primo caricamento non si rifà il suono di un evento vecchio
      return;
    }
    if (last.current === event.n) return;
    last.current = event.n;
    if (!enabled) return;
    const map: Partial<Record<GameEvent["kind"], Parameters<typeof sfx>[0]>> = {
      begin: "start", buzz: "buzz", correct: "correct", wrong: "wrong", pass: "reveal", time: "fanfare",
    };
    const name = map[event.kind];
    if (name) sfx(name);
  }, [event, enabled, sfx]);
}

function Trio({ trio }: { trio: TurnView["trio"] }) {
  return (
    <div className="rc-trio">
      {[trio.giverA, trio.giverB].map((p, i) => p && <div key={p.id} className="rc-person">{p.nickname}<small>indizio {i + 1}</small></div>)}
      {trio.guesser && <div className="rc-person guesser">{trio.guesser.nickname}<small>indovina</small></div>}
    </div>
  );
}

function History({ history }: { history: TurnSummary[] }) {
  if (history.length === 0) return null;
  return (
    <table className="rc-table">
      <tbody>
        {history.map((h) => (
          <tr key={h.turn}>
            <th>Turno {h.turn}</th>
            <td>{h.players.join(", ")}</td>
            <td>✔ {h.correct} · ✘ {h.wrong}</td>
            <td><b>{h.points > 0 ? "+" : ""}{h.points}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Flash({ event }: { event: GameEvent | null }) {
  if (!event?.word || (event.kind !== "correct" && event.kind !== "wrong")) return null;
  return <p className="rc-flash">{event.kind === "correct" ? `✔ Giusta: ${event.word}` : `✘ Sbagliata: ${event.word}`}</p>;
}

export function ReazioneScreen({ view, clock, theme }: ViewProps) {
  const v = view as TurnView | DoneView;
  const sfx = useSfx(theme);
  const event = v.phase === "done" ? null : v.event;
  useEventSfx(event, theme, true);
  const running = v.phase !== "done" && v.running;
  const seconds = useTurnRemaining(v.phase === "done" ? { running: false, deadline: null, timeLeftMs: 0 } : v, clock) / 1000;
  const tick = Math.ceil(seconds);
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (running && tick > 0 && tick <= 5 && lastTick.current !== tick) sfx("tick", 0.3);
    lastTick.current = tick;
  }, [tick, running, sfx]);

  if (v.phase === "done") {
    return (
      <div className="rc-screen">
        <p className="big">Fine di Reazione a catena!</p>
        <History history={v.history} />
      </div>
    );
  }
  return (
    <div className="rc-screen">
      <p className="muted">Turno {v.turn} di {v.turns}</p>
      <Trio trio={v.trio} />
      {v.phase === "setup" ? (
        <p className="rc-status">{statusText(v)}</p>
      ) : v.phase === "turn-over" ? (
        <>
          <p className="big">Turno finito!</p>
          <Stats v={v} />
          <History history={v.history} />
        </>
      ) : (
        <>
          <Timer view={v} clock={clock} />
          {v.word ? <h2 className="rc-word">{v.word}</h2> : <p className={`rc-status ${v.pauseReason === "answer" ? "answer" : ""}`}>{v.wordShown ? "…" : statusText(v)}</p>}
          {v.word && v.phase === "paused" && <p className={`rc-status ${v.pauseReason === "answer" ? "answer" : ""}`}>{statusText(v)}</p>}
          <Flash event={v.event} />
          <Stats v={v} />
        </>
      )}
    </div>
  );
}

export function ReazioneController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PlayerTurnView | DoneView;
  useEventSfx(v.phase === "done" ? null : v.event, theme, v.phase !== "done" && v.role !== "spectator");

  if (v.phase === "done") return <p className="big">Fine di Reazione a catena!</p>;
  const playing = v.phase === "playing";
  return (
    <div className="rc-ctrl">
      {v.phase === "setup" || v.phase === "turn-over" ? (
        <>
          <p className="muted">Turno {v.turn} di {v.turns}</p>
          <p className="rc-status">{statusText(v)}</p>
          {v.phase === "setup" && <Trio trio={v.trio} />}
          {v.phase === "turn-over" && <Stats v={v} />}
        </>
      ) : (
        <>
          <Timer view={v} clock={clock} />
          {v.role === "giver" && (
            <>
              {v.word ? <h2 className="rc-word">{v.word}</h2> : <p className="rc-status">{statusText(v)}</p>}
              <button className="rc-pass-btn" disabled={!playing || v.passesLeft <= 0} onClick={() => send({ type: "pass" })}>
                Passa ({v.passesLeft} rimaste)
              </button>
            </>
          )}
          {v.role === "guesser" && (
            <>
              <button className="rc-big-btn" disabled={!playing} onPointerDown={() => playing && send({ type: "buzz" })}>
                {playing ? "HO LA RISPOSTA!" : v.pauseReason === "answer" ? "Rispondi a voce!" : "Aspetta…"}
              </button>
              {!playing && <p className="rc-status">{statusText(v)}</p>}
            </>
          )}
          {v.role === "spectator" && (
            <>
              <Trio trio={v.trio} />
              <p className="rc-status">{statusText(v)}</p>
            </>
          )}
          <Stats v={v} />
        </>
      )}
      <History history={v.history} />
    </div>
  );
}
