import { useState } from "react";
import type { HostProps } from "../types";
import { ManualPageView } from "./Manual";
import { BombTimer, EdgeworkBar, MODULE_TITLE } from "./parts";
import type { HostInfo, Phase } from "./types";
import "./artificieri.css";

const PHASE_LABEL: Record<Phase, string> = {
  bet: "Scommesse",
  briefing: "Briefing: esperti di spalle",
  defuse: "Disinnesco in corso",
  outcome: "Esito del turno",
  final: "Classifica del round",
  done: "Finito",
};

/**
 * Regia di Artificieri: vede tutto (bordo, moduli con la soluzione, pagine del manuale di ciascun esperto,
 * scommesse) per aiutare le squadre in difficoltà e correggere i casi strani.
 */
export function ArtificieriHost({ info, run, clock }: HostProps) {
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
  const playing = h.phase === "bet" || h.phase === "briefing" || h.phase === "defuse";
  const b = h.bomb;
  const t = h.turn;

  return (
    <div className="art-host" data-testid="art-host">
      <p className="muted" data-testid="art-host-phase">
        {PHASE_LABEL[h.phase]}
        {t && ` · bomba ${t.position + 1} di ${t.total} · squadra ${t.teamName} · artificiere ${t.defuser.nickname}`}
        {paused && " · in pausa"}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {h.status && (
        <p>
          <BombTimer status={h.status} clock={clock} /> · errori {h.status.strikes}/{h.status.maxStrikes} · moduli {h.status.solved}/{h.status.moduleCount}
        </p>
      )}

      <div className="row">
        <button className="primary" data-testid="art-host-start" disabled={h.phase !== "briefing"} onClick={() => void go({ type: "start" })}>Inizia</button>
        {paused ? (
          <button className="primary" data-testid="art-host-resume" onClick={() => void go({ type: "resume" })}>Riprendi</button>
        ) : (
          <button data-testid="art-host-pause" disabled={!((h.phase === "bet" && h.phaseEndsAt !== null) || h.phase === "defuse")} onClick={() => void go({ type: "pause" })}>Pausa</button>
        )}
        <button className="primary" data-testid="art-host-next" disabled={h.phase !== "outcome" && h.phase !== "final"} onClick={() => void go({ type: "next" })}>Avanti</button>
        <button data-testid="art-host-swap" disabled={h.phase !== "bet" && h.phase !== "briefing"} onClick={() => void go({ type: "swap-defuser" })}>Cambia artificiere</button>
        <button className="danger" data-testid="art-host-undo" disabled={!h.canUndoStrike} onClick={() => void go({ type: "strike-undo" })}>Annulla l'ultimo errore</button>
        <button className="danger" data-testid="art-host-explode" disabled={h.phase !== "defuse"} onClick={() => ask("Far esplodere la bomba?", { type: "explode" })}>Esplodi</button>
        <button className="danger" data-testid="art-host-defuse" disabled={h.phase !== "defuse"} onClick={() => ask("Dare la bomba per disinnescata?", { type: "defuse" })}>Disinnesca</button>
        <button className="danger" data-testid="art-host-skip" disabled={!playing} onClick={() => ask("Saltare questa squadra? Non prende punti.", { type: "skip-team" })}>Salta la squadra</button>
        <button className="danger" data-testid="art-host-end" disabled={!playing && h.phase !== "outcome"} onClick={() => ask("Terminare il round? Restano i punti già fatti.", { type: "end" })}>Termina il round</button>
      </div>

      {h.bets.length > 0 && (
        <p data-testid="art-host-bets">
          Scommesse: {h.bets.map((x) => `${x.nickname} → ${x.bet === "defused" ? "disinnescata" : "esplode"}`).join(" · ")}
        </p>
      )}

      {b && (
        <>
          <EdgeworkBar e={b.edgework} />
          <div className="art-host-mods" data-testid="art-host-mods">
            {b.modules.map((m) => (
              <section key={m.id} className="art-host-mod" data-solved={m.solved || undefined} data-testid="art-host-mod">
                <b>
                  {m.id + 1}. {MODULE_TITLE[m.kind]}
                </b>{" "}
                {m.solved ? "✔ disinnescato" : ""}
                <p data-testid="art-host-solution">{m.solved ? "—" : m.solution}</p>
              </section>
            ))}
          </div>
          <div className="art-host-pages" data-testid="art-host-pages">
            <h4>Pagine del manuale</h4>
            <ul>
              {b.pages.map((p) => (
                <li key={p.id}>
                  <b>{p.nickname}</b>: {p.pages.map((id) => b.manual.find((m) => m.id === id)?.title).join(", ")}
                </li>
              ))}
              {b.pages.length === 0 && <li>Nessun esperto in questa squadra.</li>}
            </ul>
          </div>
          <details>
            <summary>Manuale completo di questa bomba</summary>
            {b.manual.map((p) => (
              <ManualPageView key={p.id} page={p} />
            ))}
          </details>
        </>
      )}
    </div>
  );
}
