import { useState } from "react";
import type { HostProps } from "../types";
import type { HostInfo, Phase } from "./types";
import "./plancia.css";

const PHASE_LABEL: Record<Phase, string> = {
  ready: "Pronti al decollo",
  sector: "Settore in corso",
  jump: "Salto di settore",
  final: "Classifica del round",
  done: "Finito",
};

/** Regia di Plancia di Comando: vede ogni equipaggio, l'ordine di ciascun membro e può mettere fuori uso un telefono. */
export function PlanciaHost({ info, run }: HostProps) {
  const h = info as HostInfo;
  const [error, setError] = useState<string | null>(null);
  const go = async (command: Record<string, unknown>) => {
    const ack = await run(command);
    setError(ack.ok ? null : ack.error);
  };
  const paused = h.pausedRemainingMs !== null;
  const playing = h.phase === "sector";
  const ask = (text: string, command: Record<string, unknown>) => {
    if (confirm(text)) void go(command);
  };

  return (
    <div className="pdc-host" data-testid="pdc-host">
      <p className="muted" data-testid="pdc-host-phase">
        {PHASE_LABEL[h.phase]}
        {(h.phase === "sector" || h.phase === "jump") && ` · settore ${h.sector}/${h.settings.sectors}`}
        {paused && " · in pausa"}
        {h.sectorEvent && playing && ` · prossimo evento: ${h.sectorEvent.fired ? "già scattato" : h.sectorEvent.kind === "alarm" ? "allarme" : "blackout"}`}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="primary" data-testid="pdc-host-launch" disabled={h.phase !== "ready"} onClick={() => void go({ type: "launch" })}>Decollo</button>
        {paused ? (
          <button className="primary" data-testid="pdc-host-resume" onClick={() => void go({ type: "resume" })}>Riprendi</button>
        ) : (
          <button data-testid="pdc-host-pause" disabled={!playing} onClick={() => void go({ type: "pause" })}>Pausa</button>
        )}
        <button data-testid="pdc-host-repair" disabled={!playing && h.phase !== "jump"} onClick={() => ask("Riparare gli equipaggi con lo scafo sotto il 50%?", { type: "repair" })}>Ripara gli scafi</button>
        <button data-testid="pdc-host-reshuffle" disabled={!playing && h.phase !== "ready"} onClick={() => ask("Rimescolare i pannelli di tutti?", { type: "reshuffle" })}>Rimescola i pannelli</button>
        <button data-testid="pdc-host-skip" disabled={!playing} onClick={() => ask("Saltare al settore successivo?", { type: "skip-sector" })}>Salta il settore</button>
        <button className="primary" data-testid="pdc-host-next" disabled={h.phase !== "final"} onClick={() => void go({ type: "next" })}>Avanti</button>
        <button className="danger" data-testid="pdc-host-end" disabled={h.phase === "final" || h.phase === "done"} onClick={() => ask("Terminare il round? Restano i punti già fatti.", { type: "end" })}>Termina il round</button>
      </div>
      <div className="pdc-host-crews">
        {h.crews.map((c) => (
          <section key={c.id} className="pdc-host-crew" data-testid="pdc-host-crew" style={{ ["--pdc-team" as string]: c.color }}>
            <h4>
              {c.name}
              <small> · passi {c.distance} · scafo {c.hull}% · ✔ {c.done} ✖ {c.missed}{c.stopped ? " · ferma" : ""}</small>
            </h4>
            <button disabled={(!playing && h.phase !== "jump") || c.hull >= 50} onClick={() => void go({ type: "repair", crewId: c.id })}>Ripara</button>
            <ul>
              {c.memberList.map((m) => (
                <li key={m.id} data-inactive={m.inactive || undefined}>
                  <span>
                    <b>{m.nickname}</b>{m.order ? `: ${m.order}` : ""}
                  </span>
                  <button title="Telefono fuori uso: niente comandi né ordini per lui, i pannelli dei compagni si rifanno" data-testid="pdc-host-inactive" disabled={!playing && h.phase !== "ready"} onClick={() => void go({ type: "reshuffle", playerId: m.id })}>
                    {m.inactive ? "📵 rimetti" : "📵"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
