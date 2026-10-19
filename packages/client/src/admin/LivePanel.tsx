import { Suspense, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { EventDetail, EventSummary, HostCommand, InstanceView, MasterLink } from "@gioco/shared";
import { minigameViews } from "../minigames/registry";
import type { HostLibrary } from "../minigames/types";
import { useClockSync } from "../net/useClockSync";
import { useServerInfo } from "../screen/useServerInfo";
import { Leaderboard } from "../ui/Leaderboard";
import { ApiError, api, errorMessage } from "./api";
import { parseImport, serializeInstance } from "./schema-form/logic";
import { LiveRoster } from "./EventRoster";
import { useAdminGame } from "./useAdminGame";
import { type QrCode, ZoneQrSheet } from "./ZoneQrSheet";

const PHASE_LABEL = {
  idle: "Nessuna partita",
  ready: "Pronta",
  round: "Round in corso",
  results: "Risultati del round",
  ended: "Conclusa",
} as const;

const INFO_LABEL: Record<string, string> = {
  phase: "Fase",
  index: "Domanda n.",
  total: "Domande totali",
  question: "Domanda",
  correct: "Risposta corretta",
  answer: "Risposta",
  answered: "Hanno risposto",
  playerCount: "Giocatori",
  points: "Punti in palio",
  answering: "Risponde",
  queue: "Coda",
};

function InfoView({ info }: { info: unknown }) {
  if (!info || typeof info !== "object") return null;
  return (
    <dl className="info">
      {Object.entries(info as Record<string, unknown>)
        .filter(([k, v]) => k !== "qrCodes" && v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => (
          <div key={k}>
            <dt>{INFO_LABEL[k] ?? k}</dt>
            <dd>{k === "index" ? Number(v) + 1 : Array.isArray(v) ? v.join(" → ") : String(v)}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Scelta e avvio di una partita pronta. */
function StartPicker({ onStart }: { onStart: (matchId: string) => void }) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [eventId, setEventId] = useState("");
  const [detail, setDetail] = useState<EventDetail | null>(null);

  useEffect(() => {
    api<EventSummary[]>("GET", "/events").then(setEvents, () => undefined);
  }, []);
  useEffect(() => {
    if (!eventId) return setDetail(null);
    api<EventDetail>("GET", `/events/${eventId}`).then(setDetail, () => setDetail(null));
  }, [eventId]);

  return (
    <section className="panel">
      <h3>Avvia una partita</h3>
      <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
        <option value="">Scegli la serata…</option>
        {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
      </select>
      <ul className="list">
        {detail?.matches.map((m) => (
          <li key={m.id}>
            <span>
              {m.order}. {m.name} <small className="muted">· {m.rounds.length} round ·{m.status === "pending" ? "pronta" : m.status === "running" ? "avviata" : "conclusa"}</small>
            </span>
            <button className="primary" disabled={m.status !== "pending" || m.rounds.length === 0} onClick={() => onStart(m.id)}>
              Avvia
            </button>
          </li>
        ))}
        {detail && detail.matches.length === 0 && <li className="muted">Questa serata non ha partite.</li>}
      </ul>
    </section>
  );
}

/** Link e QR per il telefono del Game Master: valido per la partita in corso, revocabile e rigenerabile. */
function MasterLinkBox() {
  const info = useServerInfo(5000);
  const [link, setLink] = useState<MasterLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Il GM entra da un telefono: serve l'indirizzo pubblico (tunnel) o della rete locale, non localhost.
  const base = (info?.tunnel.status === "ready" ? info.tunnel.url : info?.lanUrl) ?? window.location.origin;
  const url = link ? `${base}/master#t=${link.token}` : null;

  const generate = async () => {
    setError(null);
    try {
      setLink(await api<MasterLink>("POST", "/master-link"));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const revoke = async () => {
    setError(null);
    try {
      await api("DELETE", "/master-link");
      setLink(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="panel master-link">
      <h3>Link del Game Master</h3>
      <p className="muted">Il Game Master conduce la sessione dal suo telefono. Il link vale solo per questa partita e si può revocare.</p>
      {error && <p className="error">{error}</p>}
      {url ? (
        <>
          <div className="qr-box"><QRCodeSVG value={url} size={200} /></div>
          <code className="master-url">{url}</code>
          <div className="row">
            <button onClick={() => void navigator.clipboard?.writeText(url)}>Copia il link</button>
            <button onClick={() => void generate()}>Rigenera</button>
            <button className="danger" onClick={() => void revoke()}>Revoca</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="primary" onClick={() => void generate()}>Genera il link</button>
          <button className="danger" onClick={() => void revoke()}>Revoca l'accesso</button>
        </div>
      )}
    </section>
  );
}

/** Salvataggio, esportazione e caricamento della configurazione del round in corso, per le interfacce della regia che lo offrono. */
function hostLibrary(typeId: string): HostLibrary {
  const guard = async <T,>(job: () => Promise<T>): Promise<T> => {
    try {
      return await job();
    } catch (e) {
      throw new Error(e instanceof Error && !(e instanceof ApiError) ? e.message : errorMessage(e));
    }
  };
  return {
    save: (title) => guard(async () => void (await api("POST", "/live/save-to-instance", title ? { title } : {}))),
    exportFile: () =>
      guard(async () => {
        const inst = await api<{ typeId: string; title: string; theme: string; config: unknown }>("GET", "/live/config");
        const url = URL.createObjectURL(new Blob([serializeInstance(inst)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `${inst.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "configurazione"}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }),
    list: () => guard(async () => (await api<InstanceView[]>("GET", "/instances")).filter((i) => i.typeId === typeId).map((i) => ({ id: i.id, title: i.title }))),
    fetchConfig: (source) =>
      guard(async () => {
        if ("instanceId" in source) {
          const found = (await api<InstanceView[]>("GET", "/instances")).find((i) => i.id === source.instanceId);
          if (!found) throw new Error("Istanza non trovata.");
          return found.config;
        }
        const parsed = parseImport(await source.file.text());
        if (!parsed.ok) throw new Error(parsed.error);
        const mine = parsed.instances.filter((i) => i.typeId === typeId);
        if (mine.length !== 1) throw new Error(parsed.instances.length > 1 ? "Il file contiene più istanze: esportane una sola." : "Il file è di un altro tipo di minigioco.");
        return mine[0]!.config;
      }),
  };
}

export function LivePanel() {
  const { state, connected, command, socket } = useAdminGame();
  const clock = useClockSync(socket, true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [points, setPoints] = useState("100");
  const [reason, setReason] = useState("");

  const run = async (cmd: HostCommand | { type: "plugin"; command: Record<string, unknown> }) => {
    setError(null);
    const ack = await command(cmd);
    if (!ack.ok) setError(ack.error);
  };

  const adjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const [kind, id] = target.split(":");
    await run({
      type: "adjust",
      playerId: kind === "p" ? id! : null,
      teamId: kind === "t" ? id! : null,
      points: Number(points),
      reason,
    });
    setReason("");
  };

  if (!state) return <section className="panel"><p>{connected ? "Caricamento…" : "Connessione alla regia…"}</p></section>;

  const active = state.phase !== "idle";
  // I minigiochi con punti fisici (QR) lo dichiarano nella vista della regia.
  const HostUi = state.frame ? minigameViews[state.frame.typeId]?.Host : undefined;
  const hostInfo = state.host?.info as { qrCodes?: QrCode[] } | undefined;
  const qrCodes = hostInfo?.qrCodes && hostInfo.qrCodes.length > 0 ? hostInfo.qrCodes : null;

  return (
    <div className="live">
      {!connected && <p className="error">Connessione persa: riconnessione in corso…</p>}
      {error && <p className="error">{error}</p>}

      {(!active || state.phase === "ended") && (
        <StartPicker onStart={(matchId) => void run({ type: "start", matchId })} />
      )}

      {active && (
        <section className="panel">
          <h2>{state.matchName} <small className="muted">· {PHASE_LABEL[state.phase]}</small></h2>
          <p className="muted">Round {state.roundNumber} di {state.roundCount}{state.frame ? ` · ${state.frame.title}` : ""}</p>

          {state.host && HostUi && state.master && (
            <p className="muted master-hint" role="note">
              Stai conducendo tu come Game Master: puoi usare qui sotto tutti i comandi, senza il link. Il link serve solo per far condurre un altro telefono.
            </p>
          )}
          {state.host && HostUi ? (
            <Suspense fallback={<p>Caricamento…</p>}>
              <HostUi
                info={state.host.info}
                run={(c) => command({ type: "plugin", command: c })}
                clock={clock.current}
                theme={state.frame!.theme}
                library={hostLibrary(state.frame!.typeId)}
              />
            </Suspense>
          ) : state.host && (
            <>
              <InfoView info={state.host.info} />
              <div className="row">
                {state.host.actions.map((a) => (
                  <button
                    key={a.id}
                    disabled={!a.enabled}
                    className={a.danger ? "danger" : "primary"}
                    onClick={() => void run({ type: "plugin", command: { type: a.id } })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="row">
            {state.engineActions.map((a) => (
              <button
                key={a.id}
                disabled={!a.enabled}
                className={a.danger ? "danger" : "primary"}
                onClick={() => {
                  if (a.danger && !confirm(`${a.label}?`)) return;
                  void run({ type: "engine", action: a.id as "next" | "finish-round" | "end-match" | "close" });
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {active && state.phase !== "ended" && state.eventId && (
        <LiveRoster eventId={state.eventId} inRound={state.phase === "round"} pending={!!state.rosterPending} />
      )}

      {state.master && state.phase === "round" && <MasterLinkBox />}

      {qrCodes && state.phase === "round" && <ZoneQrSheet codes={qrCodes} />}

      {active && state.leaderboards && (
        <section className="panel">
          <h3>Classifiche</h3>
          <Leaderboard data={state.leaderboards} />
          {state.phase !== "ended" && (
            <form className="row" onSubmit={adjust}>
              <select value={target} onChange={(e) => setTarget(e.target.value)} required>
                <option value="">Assegna punti a…</option>
                {state.leaderboards.teams.map((t) => <option key={t.id} value={`t:${t.id}`}>Squadra {t.name}</option>)}
                {state.leaderboards.players.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.avatar} {p.name}</option>)}
              </select>
              <input value={points} onChange={(e) => setPoints(e.target.value)} type="number" step="1" style={{ width: "6rem" }} required />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo" maxLength={80} required />
              <button type="submit">Assegna</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
