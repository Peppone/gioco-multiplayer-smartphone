import { useState } from "react";
import type { HostProps } from "../types";
import { KIND_ICON, KIND_NAME } from "./names";
import type { Difficulty, HostInfo, Phase } from "./types";
import "./pianeta.css";

const PHASE_LABEL: Record<Phase, string> = {
  briefing: "Si comincia",
  turn: "Turno in corso",
  resolve: "Azioni scelte",
  conference: "Conferenza",
  theory: "Fase teoria",
  review: "Revisione delle teorie",
  lastCall: "Ultima opportunità",
  finalGuess: "Ipotesi finale",
  reveal: "Rivelazione",
  final: "Punteggio",
  done: "Finito",
};

const LEVELS: [Difficulty, string][] = [["youth", "Ragazzi (12 fatti)"], ["beginner", "Principiante (8)"], ["experienced", "Esperto (4)"], ["genius", "Genio (0)"]];

/** Regia del Pianeta Nascosto: vede dove sono gli osservatori e chi ha deciso. Il sistema solare e i risultati solo dopo lo sblocco. */
export function PianetaHost({ info, run }: HostProps) {
  const h = info as HostInfo;
  const [error, setError] = useState<string | null>(null);
  const go = async (command: Record<string, unknown>) => {
    const ack = await run(command);
    setError(ack.ok ? null : ack.error);
  };
  const ask = (text: string, command: Record<string, unknown>) => {
    if (confirm(text)) void go(command);
  };
  const paused = h.pausedRemainingMs !== null;
  const collecting = h.phase === "theory" || h.phase === "lastCall" || h.phase === "finalGuess";
  const timed = ["turn", "resolve", "conference", "review", "theory", "lastCall", "finalGuess"].includes(h.phase);
  const day = Math.min(...h.observatories.map((o) => o.time));

  return (
    <div className="px-host" data-testid="px-host">
      <p className="muted" data-testid="px-host-phase">
        {PHASE_LABEL[h.phase]} · giorno {day}{h.settings.maxDays > 0 ? `/${h.settings.maxDays}` : ""}{paused && " · in pausa"}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="primary" data-testid="px-host-start" disabled={h.phase !== "briefing"} onClick={() => void go({ type: "start" })}>Inizia</button>
        <button className="primary" data-testid="px-host-next" disabled={!["conference", "review", "resolve", "theory", "lastCall", "finalGuess", "reveal", "final"].includes(h.phase)} onClick={() => void go({ type: "next" })}>{collecting ? "Chiudi la fase" : "Avanti"}</button>
        {paused ? (
          <button className="primary" data-testid="px-host-resume" onClick={() => void go({ type: "resume" })}>Riprendi</button>
        ) : (
          <button data-testid="px-host-pause" disabled={!timed} onClick={() => void go({ type: "pause" })}>Pausa</button>
        )}
        <button data-testid="px-host-force" disabled={h.phase !== "turn"} onClick={() => void go({ type: "force-decide" })}>Applica la proposta più votata</button>
        <button data-testid="px-host-skip" disabled={h.phase !== "turn"} onClick={() => ask("Far passare la squadra di turno? Avanza di 1 giorno.", { type: "skip" })}>Passa il turno</button>
        <button data-testid="px-host-unlock" className="danger" disabled={h.unlocked || !h.blind} onClick={() => ask("Mostrare il sistema solare e i risultati alla regia? Se i giocatori guardano lo schermo della regia potrebbero vederli.", { type: "unlock-solution" })}>Mostra la soluzione</button>
        <button className="danger" data-testid="px-host-end" disabled={h.phase === "reveal" || h.phase === "final" || h.phase === "done"} onClick={() => ask("Terminare il round? Si passa alla rivelazione.", { type: "end" })}>Termina il round</button>
      </div>
      <div className="px-host-teams">
        {h.observatories.map((o) => {
          const d = h.details.find((x) => x.id === o.id);
          if (!d) return null;
          return (
            <section key={o.id} className="px-host-team" data-testid="px-host-team" data-acting={d.acting || undefined} style={{ ["--px-team" as string]: o.color }}>
              <h4>
                {o.name}{o.bot ? " 🤖" : ""}
                <small> · giorno {o.time} (settore {o.sector}){d.acting ? " · di turno" : ""}</small>
              </h4>
              {h.phase === "turn" && d.acting && !d.bot && <p>{d.decided ? "Ha deciso" : `${d.proposals} ${d.proposals === 1 ? "proposta" : "proposte"}`}</p>}
              {collecting && h.actingIds.includes(o.id) && <p>{d.ready > 0 ? "Pronta" : "Sta scegliendo"}</p>}
              <p className="muted">Gettoni: {(["asteroid", "comet", "gas", "dwarf"] as const).map((k) => `${KIND_ICON[k]} ${d.tokens[k]}`).join(" · ")} · puntamenti {d.targetsLeft}</p>
              {!d.bot && <p className="muted">{d.members.map((m) => m.nickname + (m.id === d.captainId ? " (capitano)" : "")).join(", ")}</p>}
              <label>
                Informazioni iniziali{" "}
                <select data-testid="px-host-level" value={d.difficulty} disabled={h.phase !== "briefing" || d.bot} onChange={(e) => void go({ type: "set-difficulty", teamId: o.id, difficulty: e.target.value })}>
                  {LEVELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              {d.log && (
                <ol className="px-logbook" data-testid="px-host-log">
                  {d.log.map((l, i) => <li key={i}>{l.text}</li>)}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      {h.solution && (
        <section className="px-host-solution" data-testid="px-host-solution">
          <h4>Il sistema solare</h4>
          <ol className="px-solution">
            {h.solution.sky.map((k, i) => <li key={i} data-kind={k}>{i + 1}: {KIND_ICON[k]} {KIND_NAME[k]}</li>)}
          </ol>
          <ul>
            {h.solution.topics.map((t) => <li key={t.id}><b>{t.id}</b> {t.text}</li>)}
            {h.solution.conferences.map((c) => <li key={c.id}><b>{c.id}</b> {c.text}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
