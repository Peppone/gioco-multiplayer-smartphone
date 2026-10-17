import { useState } from "react";
import { Timer, Stats, statusText } from "./ReazioneViews";
import type { HostProps } from "../types";
import "./reazione.css";
import type { HostInfo } from "./types";

type Slot = "giverA" | "giverB" | "guesser";
const SLOTS: { slot: Slot; label: string }[] = [
  { slot: "giverA", label: "Primo che dà gli indizi" },
  { slot: "giverB", label: "Secondo che dà gli indizi" },
  { slot: "guesser", label: "Chi indovina" },
];

export function ReazioneHost({ info: raw, run, clock }: HostProps) {
  const info = raw as HostInfo;
  const [error, setError] = useState<string | null>(null);
  const go = async (command: Record<string, unknown>) => {
    setError(null);
    const ack = await run(command);
    if (!ack.ok) setError(ack.error);
  };

  /** Assegna un giocatore a un ruolo; se faceva già un altro ruolo, i due si scambiano. */
  const assign = (slot: Slot, id: string) => {
    const next = { ...info.trioIds };
    const previous = next[slot];
    for (const other of ["giverA", "giverB", "guesser"] as const) if (other !== slot && next[other] === id) next[other] = previous;
    next[slot] = id || null;
    if (!next.giverA || !next.guesser) return;
    void go({ type: "pick", ...next });
  };

  const active = info.phase === "playing" || info.phase === "paused";
  const judge = active && info.wordShown;
  const label = (id: string | null) => info.participants.find((p) => p.id === id)?.nickname;

  return (
    <div className="sh">
      {error && <p className="error" role="alert">{error}</p>}
      <section className="sh-sec">
        <h3>Turno {info.turn} di {info.turns}</h3>

        {info.phase === "setup" && (
          <>
            <div className="rc-pick">
              {SLOTS.map(({ slot, label: text }) => (
                <label key={slot}>
                  {text}
                  <select value={info.trioIds[slot] ?? ""} onChange={(e) => assign(slot, e.target.value)}>
                    {slot === "giverB" && <option value="">— nessuno —</option>}
                    {info.participants.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="rc-host-grid">
              <button onClick={() => void go({ type: "shuffle" })}>Sorteggia ancora</button>
              <button onClick={() => void go({ type: "next" })}>Salta il turno</button>
              <button className="primary wide" disabled={!info.trioIds.giverA || !info.trioIds.guesser} onClick={() => void go({ type: "begin" })}>
                Via! {label(info.trioIds.guesser) ? `(${label(info.trioIds.guesser)} indovina)` : ""}
              </button>
            </div>
          </>
        )}

        {active && (
          <>
            <Timer view={info} clock={clock} />
            <p className={`rc-host-word ${info.wordShown ? "" : "hidden"}`}>
              {info.wordShown ? info.word : `Prossima parola (nascosta): ${info.word}`}
            </p>
            <p className="muted" style={{ textAlign: "center" }}>
              {info.trio.giverA?.nickname}{info.trio.giverB ? ` e ${info.trio.giverB.nickname}` : ""} danno gli indizi · {info.trio.guesser?.nickname} indovina
            </p>
            <p className={`rc-status ${info.pauseReason === "answer" ? "answer" : ""}`} style={{ textAlign: "center" }}>{statusText(info)}</p>
            <Stats v={info} />
            <div className="rc-host-grid">
              {info.phase === "paused" ? (
                <button className="rc-host-ok wide" onClick={() => void go({ type: "resume" })}>
                  {info.wordShown ? "▶ Riprendi il tempo" : "▶ Via alla parola"}
                </button>
              ) : (
                <button className="wide" onClick={() => void go({ type: "pause" })}>⏸ Ferma il tempo</button>
              )}
              <button className="rc-host-ok" disabled={!judge} onClick={() => void go({ type: "correct" })}>✔ Giusta</button>
              <button className="rc-host-ko" disabled={!judge} onClick={() => void go({ type: "wrong" })}>✘ Sbagliata</button>
              <button onClick={() => void go({ type: "skip" })}>⏭ Parola successiva</button>
              <button onClick={() => void go({ type: "addTime" })}>+ {info.extraTimeSec} s</button>
              <button onClick={() => void go({ type: "addTime", seconds: 30 })}>+ 30 s</button>
              <button
                className="danger"
                onClick={() => {
                  if (confirm("Chiudere il turno adesso?")) void go({ type: "endTurn" });
                }}
              >
                Chiudi il turno
              </button>
            </div>
          </>
        )}

        {info.phase === "turn-over" && (
          <>
            <p className="big">Turno finito: {info.points >= 0 ? "+" : ""}{info.points} punti a testa</p>
            <Stats v={info} />
            <button className="primary" onClick={() => void go({ type: "next" })}>
              {info.turn >= info.turns ? "Concludi il round" : "Prossimo turno"}
            </button>
          </>
        )}
      </section>

      {info.history.length > 0 && (
        <section className="sh-sec">
          <h3>Turni giocati</h3>
          <ul className="sh-log">
            {info.history.map((h) => (
              <li key={h.turn}>
                Turno {h.turn} · {h.players.join(", ")} · ✔ {h.correct} ✘ {h.wrong} ↷ {h.passes} → <b>{h.points > 0 ? "+" : ""}{h.points}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
