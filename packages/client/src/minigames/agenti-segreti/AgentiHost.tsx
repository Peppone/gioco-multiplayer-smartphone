import { type CSSProperties, useState } from "react";
import type { HostProps } from "../types";
import type { HostInfo, Side } from "./types";
import "./agenti.css";

const PHASE_LABEL: Record<HostInfo["phase"], string> = {
  setup: "Squadre e Capi-spia",
  clue: "Il Capo-spia scrive l'indizio",
  guess: "La squadra vota",
  reveal: "Fine partita",
  done: "Finita",
};
const SIDES: Side[] = ["red", "blue"];
const countText = (c: number | "inf") => (c === "inf" ? "∞" : String(c));

/** Regia di Agenti Segreti: squadre e Capi-spia prima di distribuire, poi turni, voti e correzioni. In modalità cieca niente mappa. */
export function AgentiHost({ info, run }: HostProps) {
  const h = info as HostInfo;
  const [error, setError] = useState<string | null>(null);
  const go = async (command: Record<string, unknown>) => {
    const ack = await run(command);
    setError(ack.ok ? null : ack.error);
  };
  const phase = h.phase;
  const playing = phase === "clue" || phase === "guess";
  const ask = (text: string, command: Record<string, unknown>) => {
    if (confirm(text)) void go(command);
  };
  const setBlind = (blind: boolean) => {
    if (!blind && phase !== "setup" && !confirm("Vedrai la mappa: la tua partita non sarà più valida. Lo schermo mostrerà un avviso. Continuare?")) return;
    void go({ type: "set-blind", blind });
  };
  const colors = { "--as-red": h.teams.red.color, "--as-blue": h.teams.blue.color } as CSSProperties;

  return (
    <div className="as-host" data-testid="as-host" data-blind={h.blind} style={colors}>
      <p className="muted" data-testid="as-host-phase">
        {PHASE_LABEL[phase]}
        {playing && ` · turno ${h.turnNumber} · tocca ai ${h.teams[h.turn].name}`}
        {h.pausedRemainingMs !== null && " · in pausa"}
      </p>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="row">
        {phase === "setup" && (
          <>
            <button data-testid="as-shuffle" onClick={() => void go({ type: "shuffle-teams" })}>Mescola squadre</button>
            <button className="primary" data-testid="as-deal" onClick={() => void go({ type: "deal" })}>Distribuisci</button>
          </>
        )}
        {playing && (
          <>
            {h.pausedRemainingMs !== null ? (
              <button className="primary" data-testid="as-resume" onClick={() => void go({ type: "resume" })}>Riprendi</button>
            ) : (
              <button data-testid="as-pause" onClick={() => void go({ type: "pause" })}>Pausa</button>
            )}
            {phase === "guess" && (
              <button className="danger" data-testid="as-reject" onClick={() => ask("L'indizio non è valido? Il turno passa all'altra squadra.", { type: "reject-clue" })}>Indizio non valido</button>
            )}
            <button className="danger" data-testid="as-end-turn" onClick={() => void go({ type: "end-turn" })}>Fine turno</button>
          </>
        )}
        {h.canUndo && (
          <button className="danger" data-testid="as-undo" onClick={() => ask(`Rimettere coperta «${h.lastReveal}»?`, { type: "undo-reveal" })}>
            Annulla scoperta{h.lastReveal ? ` («${h.lastReveal}»)` : ""}
          </button>
        )}
        {playing && (
          <button className="danger" data-testid="as-end" onClick={() => ask("Terminare la partita? Vince chi ha meno agenti da trovare.", { type: "end" })}>Termina la partita</button>
        )}
        {phase === "reveal" && <button className="primary" data-testid="as-next" onClick={() => void go({ type: "next" })}>Avanti</button>}
      </div>

      <label className="row">
        <input type="checkbox" checked={h.blind} data-testid="as-blind" onChange={(e) => setBlind(e.target.checked)} />
        Gioco anch'io (regia cieca)
      </label>
      {h.blind && <p className="muted">Non vedi la mappa: solo ciò che vede lo schermo comune.</p>}

      {h.clueError && <p className="muted" data-testid="as-host-clue-error">Indizio rifiutato dal controllo automatico: {h.clueError}</p>}
      {h.clue && (
        <p data-testid="as-host-clue">
          Indizio dei {h.teams[h.clue.side].name}: <b>«{h.clue.word}» {countText(h.clue.count)}</b> · scoperte {h.clue.guesses} · confermati {h.confirmed}/{h.voters}
        </p>
      )}
      {h.outcome && (
        <p className="big" data-testid="as-host-outcome">
          {h.outcome.winner === "draw" ? "Pareggio" : `Vincono i ${h.teams[h.outcome.winner].name}`}
        </p>
      )}

      <div className="as-host-cols">
        {SIDES.map((side) => {
          const t = h.teams[side];
          const to: Side = side === "red" ? "blue" : "red";
          return (
            <section key={side} className="as-host-team" data-side={side} data-testid={`as-host-team-${side}`}>
              <h3>
                {t.name} <small>({t.members.length}{t.agentsLeft !== null ? ` · ${t.agentsLeft} da trovare` : ""})</small>
              </h3>
              <ul>
                {t.members.map((p) => (
                  <li key={p.id}>
                    <span>
                      {p.id === t.spymaster.id && "🕶 "}
                      <b>{p.nickname}</b>
                      {p.id === t.spymaster.id && <small> · Capo-spia</small>}
                    </span>
                    {phase === "setup" && (
                      <span className="row">
                        {p.id !== t.spymaster.id && (
                          <button onClick={() => void go({ type: "set-spymaster", side, playerId: p.id })} title="Fai Capo-spia" aria-label={`${p.nickname} Capo-spia`}>🕶</button>
                        )}
                        <button disabled={!h.canMove[side]} onClick={() => void go({ type: "move-player", playerId: p.id, side: to })} aria-label={`Sposta ${p.nickname} nei ${h.teams[to].name}`}>
                          → {h.teams[to].name}
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {h.cards.length > 0 && (
        <div className="as-grid as-host-grid" data-testid="as-host-grid" style={{ "--cols": h.cards.length === 16 ? 4 : 5 } as CSSProperties}>
          {h.cards.map((c, i) => (
            <div key={i} className="as-card" data-revealed={c.revealed} data-kind={c.kind}>
              <span className="as-word">{c.word}</span>
            </div>
          ))}
        </div>
      )}
      {h.clues.length > 0 && (
        <p className="muted">
          Indizi: {h.clues.map((c) => `${c.side === "red" ? "🔴" : "🔵"} ${c.word}·${countText(c.count)}${c.rejected ? " (annullato)" : ""}`).join("  ")}
        </p>
      )}
    </div>
  );
}
