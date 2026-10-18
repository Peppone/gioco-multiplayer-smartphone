import { useState } from "react";
import type { HostProps } from "../types";
import { CHARACTER_LABEL } from "./rulesText";
import type { HostInfo } from "./types";
import "./botto.css";

const PHASE_LABEL: Record<HostInfo["phase"], string> = {
  pairing: "Abbinamento alle stanze",
  deal: "Carte distribuite",
  round: "Round in corso",
  lock: "Elezione dei leader",
  hostages: "Scelta degli ostaggi",
  exchange: "Scambio fatto",
  gamble: "Previsione del Giocatore d'azzardo",
  reveal: "Rivelazione",
  done: "Finita",
};

/** Regia di Stanze col botto: stanze, leader, ostaggi e comandi. In modalità cieca non riceve carte, voti né scelte. */
export function BottoHost({ info, run }: HostProps) {
  const h = info as HostInfo;
  const [error, setError] = useState<string | null>(null);
  const go = async (command: Record<string, unknown>) => {
    const ack = await run(command);
    setError(ack.ok ? null : ack.error);
  };
  const phase = h.phase;
  const setBlind = (blind: boolean) => {
    if (!blind && phase !== "pairing" && !confirm("Vedrai tutte le carte: la tua partita non sarà più valida. Lo schermo mostrerà un avviso. Continuare?")) return;
    void go({ type: "set-blind", blind });
  };

  return (
    <div className="scb-host" data-testid="scb-host" data-blind={h.blind}>
      <p className="muted" data-testid="scb-host-phase">
        {PHASE_LABEL[phase]}
        {phase !== "pairing" && phase !== "deal" && phase !== "reveal" && phase !== "done" ? ` · round ${h.round + 1} di ${h.roundCount}` : ""}
      </p>
      {error && <p className="error" role="alert">{error}</p>}

      <div className="row">
        {phase === "pairing" && (
          <>
            <select value={h.assignment} onChange={(e) => void go({ type: "set-assignment", mode: e.target.value })} aria-label="Abbinamento alle stanze">
              <option value="random">A caso</option>
              <option value="qr">Con i QR</option>
              <option value="host">Dalla regia</option>
            </select>
            <button data-testid="scb-shuffle" onClick={() => void go({ type: "shuffle-rooms" })}>Rimescola</button>
            <button className="primary" data-testid="scb-deal" disabled={!h.balanced} onClick={() => void go({ type: "deal" })}>Distribuisci le carte</button>
          </>
        )}
        {phase === "deal" && <button className="primary" data-testid="scb-start-round" onClick={() => void go({ type: "start-round" })}>Avvia il round</button>}
        {phase === "round" && <button className="danger" data-testid="scb-end-round" onClick={() => void go({ type: "end-round" })}>Chiudi il round</button>}
        {phase === "exchange" && <button className="primary" data-testid="scb-start-round" onClick={() => void go({ type: "start-round" })}>Avvia il prossimo round</button>}
        {phase === "reveal" && <button className="primary" data-testid="scb-next" onClick={() => void go({ type: "next" })}>Avanti</button>}
        {(phase === "round" || phase === "lock" || phase === "hostages" || phase === "exchange" || phase === "gamble") && (
          <>
            <button data-testid="scb-pause" onClick={() => void go({ type: "pause" })}>Pausa</button>
            <button data-testid="scb-resume" onClick={() => void go({ type: "resume" })}>Riprendi</button>
          </>
        )}
      </div>
      {phase === "pairing" && !h.balanced && <p className="error">Le stanze non sono bilanciate: sposta qualcuno prima di distribuire le carte.</p>}

      <label className="row">
        <input type="checkbox" checked={h.blind} data-testid="scb-blind" onChange={(e) => setBlind(e.target.checked)} />
        Gioco anch'io (regia cieca)
      </label>
      {h.blind && <p className="muted">Non vedi carte, voti, condivisioni né le scelte degli ostaggi: solo ciò che vede lo schermo comune.</p>}

      <div className="scb-host-cols">
        {([0, 1] as const).map((r) => {
          const members = h.players.filter((p) => p.room === r);
          const room = h.rooms?.[r];
          return (
            <section key={r} className="scb-host-room" data-testid={`scb-host-room-${r}`}>
              <h3>
                {h.roomNames[r]} <small>({members.length})</small>
              </h3>
              <p className="muted">
                Leader: {h.leaders[r]?.revealed ? h.leaders[r]!.revealed!.nickname : room?.leader ? `${room.leader.nickname} (non ancora rivelato)` : "—"}
                {h.leaders[r]?.locked ? " 🔒" : ""}
                {phase === "hostages" ? (h.leaders[r]?.confirmed ? " · ostaggi confermati" : " · sceglie gli ostaggi") : ""}
                {phase === "exchange" ? (h.startPressed[r] ? " · pronto" : "") : ""}
              </p>
              <ul>
                {members.map((p) => {
                  const card = h.cards?.[p.id];
                  const votes = room ? Object.values(room.votes).filter((c) => c === p.id).length : 0;
                  return (
                    <li key={p.id} data-team={card?.team}>
                      <span>
                        {room?.leader?.id === p.id && "★ "}
                        <b>{p.nickname}</b>
                        {card && <small> · {CHARACTER_LABEL[card.character]}</small>}
                        {votes > 0 && <small> · ✋{votes}</small>}
                        {room?.picks.includes(p.id) && " 🎯"}
                      </span>
                      <span className="row">
                        <button onClick={() => void go({ type: "move-player", playerId: p.id, room: r === 0 ? 1 : 0 })} title="Sposta nell'altra stanza">⇄</button>
                        {phase !== "pairing" && <button onClick={() => void go({ type: "set-leader", room: r, playerId: p.id })} title="Nomina leader">★</button>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {h.shares && h.shares.length > 0 && (
        <details className="scb-host-log" data-testid="scb-host-shares">
          <summary>Condivisioni ({h.shares.length})</summary>
          <ul>
            {[...h.shares].reverse().map((s) => (
              <li key={s.seq}>
                R{s.round + 1} · {s.fromNickname} → {s.toNickname ?? "tutta la stanza"} · {s.kind} · {s.status}
              </li>
            ))}
          </ul>
        </details>
      )}
      {h.outcome && <p className="big" data-testid="scb-host-outcome">{h.outcome.winner === "red" ? "Vince la ROSSA" : "Vince la BLU"}: {h.outcome.reason}</p>}
    </div>
  );
}
