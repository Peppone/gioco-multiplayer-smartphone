import { useState } from "react";
import type { HostProps } from "../types";
import { LAYER_NAME } from "./rulesText";
import type { HostInfo, Phase } from "./types";
import "./pilota.css";

const PHASE_LABEL: Record<Phase, string> = {
  ready: "Presentazione del livello",
  run: "Gara in corso",
  "level-end": "Fine gara",
  final: "Classifica del round",
  done: "Finito",
};

/** Regia di Pilota alla cieca: vede tutti gli strati di ogni corsia e chi li ha, per aiutare e correggere. */
export function PilotaHost({ info, run }: HostProps) {
  const h = info as HostInfo;
  const [error, setError] = useState<string | null>(null);
  const go = async (command: Record<string, unknown>) => {
    const ack = await run(command);
    setError(ack.ok ? null : ack.error);
  };
  const paused = h.pausedRemainingMs !== null;
  const timed = h.phase === "ready" || h.phase === "run";
  const ask = (text: string, command: Record<string, unknown>) => {
    if (confirm(text)) void go(command);
  };
  const name = (id: string) => h.teams.find((t) => t.id === id)?.name ?? id;

  return (
    <div className="pc-host" data-testid="pc-host">
      <p className="muted" data-testid="pc-host-phase">
        {PHASE_LABEL[h.phase]}
        {h.phase !== "final" && h.phase !== "done" && ` · livello ${h.level}/${h.settings.levels}${h.units > 1 ? ` · gara ${h.unit + 1}/${h.units}` : ""}`}
        {paused && " · in pausa"}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="primary" data-testid="pc-host-go" disabled={h.phase !== "ready"} onClick={() => void go({ type: "go" })}>Via</button>
        {paused ? (
          <button className="primary" data-testid="pc-host-resume" onClick={() => void go({ type: "resume" })}>Riprendi</button>
        ) : (
          <button data-testid="pc-host-pause" disabled={!timed || h.phaseEndsAt === null} onClick={() => void go({ type: "pause" })}>Pausa</button>
        )}
        <button className="primary" data-testid="pc-host-next" disabled={h.phase !== "level-end" && h.phase !== "final"} onClick={() => void go({ type: "next" })}>Avanti</button>
        <button data-testid="pc-host-skip-pilot" disabled={h.phase !== "ready"} onClick={() => void go({ type: "skip-pilot" })}>Cambia pilota</button>
        <button className="danger" data-testid="pc-host-finish" disabled={h.phase !== "run"} onClick={() => ask("Chiudere la gara adesso?", { type: "finish-level" })}>Chiudi la gara</button>
        <button className="danger" data-testid="pc-host-end" disabled={h.phase === "final" || h.phase === "done"} onClick={() => ask("Terminare il round? Restano i punti già fatti.", { type: "end" })}>Termina il round</button>
      </div>
      <p data-testid="pc-host-board">
        Classifica: {h.teams.map((t) => `${t.name} ${h.board[t.id] ?? 0}`).join(" · ")}
      </p>
      <div className="pc-host-lanes">
        {h.secrets.map((s) => {
          const lane = h.lanes.find((l) => l.teamId === s.teamId);
          return (
            <section key={s.teamId} className="pc-host-lane" data-testid="pc-host-lane" style={{ ["--pc-team" as string]: lane?.teamColor ?? "var(--accent)" }}>
              <h4>
                {name(s.teamId)} · pilota {lane?.pilot.nickname}
                {lane && <small> · ✖ {lane.strikes} · 🔑 {lane.keys.taken}/{lane.keys.total}</small>}
              </h4>
              <ul>
                {s.layers.map((p) => (
                  <li key={p.id}>
                    <b>{p.nickname}</b>: {p.layers.length > 0 ? p.layers.map((l) => LAYER_NAME[l]).join(", ") : "nessuno strato"}
                  </li>
                ))}
              </ul>
              <p className="muted">
                {s.mines.length} mine · {s.doors.length} porte · {s.keys.length} chiavi · {s.patrols.length} pattuglie
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
