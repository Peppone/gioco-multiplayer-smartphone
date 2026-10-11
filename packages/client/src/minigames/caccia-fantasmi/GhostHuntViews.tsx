import { Suspense, lazy, useEffect, useState } from "react";
import type { ClockSync } from "@gioco/shared";
import { useSfx } from "../../audio/useAudio";
import { Countdown } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";
import { RulesDialog } from "./RulesDialog";
import type { Rules } from "./rulesText";

// La libreria di decodifica dei QR è un pezzo separato, scaricato solo quando si apre lo scanner.
const QrScanner = lazy(() => import("./QrScanner"));

type Side = "ghost" | "hunter";
type Owner = Side | null;
type Winner = Side | "draw" | null;

/** Sullo schermo il nome della zona; il proprietario compare solo alla rivelazione finale. */
interface PublicZone {
  name: string;
  owner?: Owner;
}
/** Ciò che questo giocatore ha visto di persona di una zona, e quando. */
interface Seen {
  owner: Owner;
  since: number;
  at: number;
  /** Fino a quando la zona era bloccata quando l'hai vista (0 = non lo era). */
  lockUntil: number;
}
interface PlayerZone {
  name: string;
  seen: Seen | null;
}
interface GameEvent {
  id: number;
  at: number;
  kind: "catch" | "miss";
  a: string;
  b: string;
}
interface Feedback {
  kind: "ok" | "flip" | "own" | "look" | "zoneLocked" | "unknown" | "cooldown" | "headStart" | "locked" | "caught" | "missed" | "already" | "self";
  zone: number | null;
  owner: Owner;
  since: number | null;
  at: number;
  until: number | null;
  target: string | null;
  points: number;
}
interface ScreenSetup {
  phase: "setup";
  zones: PublicZone[];
  ghostsTotal: number;
  playersTotal: number;
}
interface ScreenPlay {
  phase: "play";
  startedAt: number;
  endsAt: number;
  huntersFrom: number;
  zones: PublicZone[];
  ghostsTotal: number;
  playersTotal: number;
  catches: number;
  caught: { nickname: string; until: number }[];
  events: GameEvent[];
}
interface ScreenDone {
  phase: "reveal" | "done";
  winner: Winner;
  seconds: Record<Side, number>;
  /** Peso di un secondo di controllo dei fantasmi (1 = nessuno). */
  weight: number;
  catches: number;
  zones: PublicZone[];
  players: { id: string; nickname: string; role: Side; points: number }[];
}
interface Me {
  role: Side;
  /** Nascosti durante la caccia: il totale tradirebbe se si tiene ancora una zona. */
  points: number | null;
  lockedUntil: number;
  nextScanAt: number;
  nextAccuseAt: number;
  feedback: Feedback | null;
}
interface PlayerSetup extends Me {
  phase: "setup";
  mates: string[];
  rules: Rules;
  zones: PlayerZone[];
  startedAt: number;
  endsAt: number;
  huntersFrom: number;
}
interface PlayerPlay extends Omit<PlayerSetup, "phase"> {
  phase: "play";
  events: GameEvent[];
  suspects: { id: string; nickname: string; jailedUntil: number }[];
}
interface PlayerDone extends Me {
  phase: "reveal" | "done";
  winner: Winner;
  seconds: Record<Side, number>;
}

/** Rivelazione e fine condividono la stessa vista; il guard serve perché il discriminante è un'unione. */
const isFinal = <T extends { phase: string }>(v: T): v is Extract<T, { phase: "reveal" | "done" }> => v.phase === "reveal" || v.phase === "done";

const SIDE_ICON: Record<Side, string> = { ghost: "👻", hunter: "🔦" };
const ownerClass = (o: Owner | undefined) => (o === "ghost" ? "gf-ghost" : o === "hunter" ? "gf-hunter" : o === null ? "gf-free" : "gf-unknown");
const ownerLabel = (o: Owner) => (o === "ghost" ? "👻 infestata" : o === "hunter" ? "🔦 purificata" : "libera");

/** Ora del server, aggiornata ogni mezzo secondo (serve a decidere cosa è ancora bloccato). */
function useServerNow(clock: ClockSync): number {
  const [now, setNow] = useState(() => clock.toServerTime(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setNow(clock.toServerTime(Date.now())), 500);
    return () => clearInterval(id);
  }, [clock]);
  return now;
}

const secsLeft = (until: number, now: number) => Math.max(0, Math.ceil((until - now) / 1000));
const secsAgo = (at: number, now: number) => Math.max(0, Math.floor((now - at) / 1000));

/** «infestata da 40s», «libera». Il tempo si mostra solo se qualcuno l'ha presa davvero. */
function stateText(owner: Owner, since: number | null, now: number): string {
  return owner === null || since === null ? ownerLabel(owner) : `${ownerLabel(owner)} da ${secsAgo(since, now)}s`;
}

function eventText(e: GameEvent): string {
  return e.kind === "catch" ? `🎯 ${e.a} ha catturato ${e.b}: era un fantasma!` : `❌ ${e.a} ha accusato ${e.b} a torto`;
}

/** Schermo: i nomi, con lo stato nascosto (❓) finché non c'è la rivelazione. */
function PublicZones({ zones, revealed }: { zones: PublicZone[]; revealed: boolean }) {
  return (
    <ul className="gf-zones">
      {zones.map((z) => (
        <li key={z.name} className={`gf-zone ${revealed ? ownerClass(z.owner ?? null) : "gf-unknown"}`} data-owner={revealed ? (z.owner ?? "free") : "hidden"}>
          <span className="gf-zone-name">{z.name}</span>
          <span className="gf-zone-state">{revealed ? ownerLabel(z.owner ?? null) : "❓ stato segreto"}</span>
        </li>
      ))}
    </ul>
  );
}

/** Telefono: solo ciò che il giocatore ha visto di persona, con l'età dell'informazione. */
function SeenZones({ zones, now }: { zones: PlayerZone[]; now: number }) {
  return (
    <ul className="gf-zones">
      {zones.map((z) => (
        <li key={z.name} className={`gf-zone ${z.seen ? `${ownerClass(z.seen.owner)} gf-old` : "gf-unknown"}`} data-seen={z.seen ? (z.seen.owner ?? "free") : "never"}>
          <span className="gf-zone-name">{z.name}</span>
          {z.seen ? (
            <>
              <span className="gf-zone-state">{ownerLabel(z.seen.owner)}</span>
              <span className="gf-mine">
                visto {secsAgo(z.seen.at, now)}s fa{z.seen.lockUntil > now && ` · bloccata ${secsLeft(z.seen.lockUntil, now)}s`}
              </span>
            </>
          ) : (
            <span className="gf-zone-state">mai controllata</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function TugBar({ seconds, weight = 1 }: { seconds: Record<Side, number>; weight?: number }) {
  const total = seconds.ghost + seconds.hunter;
  const ghostPct = total === 0 ? 50 : (seconds.ghost / total) * 100;
  return (
    <div className="gf-tug" aria-label="Tempo di controllo delle zone">
      <span className="gf-tug-label">
        👻 {seconds.ghost}
        {weight > 1 && <small> (×{String(weight).replace(".", ",")})</small>}
      </span>
      <div className="gf-tug-bar">
        <div className="gf-tug-ghost" style={{ width: `${ghostPct}%` }} />
      </div>
      <span className="gf-tug-label">{seconds.hunter} 🔦</span>
    </div>
  );
}

function EventLog({ events }: { events: GameEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ul className="gf-events">
      {[...events].reverse().slice(0, 5).map((e) => (
        <li key={e.id}>{eventText(e)}</li>
      ))}
    </ul>
  );
}

function WinnerTitle({ winner }: { winner: Winner }) {
  return <>{winner === "ghost" ? "Vincono i FANTASMI! 👻" : winner === "hunter" ? "Vincono gli ACCHIAPPAFANTASMI! 🔦" : "Pareggio!"}</>;
}

export function GhostHuntScreen({ view, clock, theme }: ViewProps) {
  const v = view as ScreenSetup | ScreenPlay | ScreenDone;
  const sfx = useSfx(theme);
  const now = useServerNow(clock);
  const phase = v.phase;
  const catches = v.phase === "play" ? v.catches : 0;
  const lastEvent = v.phase === "play" ? (v.events[v.events.length - 1]?.id ?? 0) : 0;

  useEffect(() => {
    if (phase === "play") sfx("start", 0.4);
    if (phase === "reveal") sfx("fanfare");
  }, [phase, sfx]);
  useEffect(() => {
    if (catches > 0) sfx("correct");
  }, [catches, sfx]);
  useEffect(() => {
    if (lastEvent > 0) sfx("reveal", 0.3);
  }, [lastEvent, sfx]);

  if (v.phase === "setup") {
    return (
      <div className="gf-screen">
        <h2 className="question">👻 Caccia ai Fantasmi</h2>
        <p className="big">
          Tra voi si nascondono {v.ghostsTotal} {v.ghostsTotal === 1 ? "fantasma" : "fantasmi"}
        </p>
        <p className="muted">Guarda il tuo telefono: scoprirai se sei un fantasma o un acchiappafantasmi. Raggiungi le zone e scansiona i loro QR.</p>
        <PublicZones zones={v.zones} revealed={false} />
        <p className="muted">Lo stato di una zona si scopre solo andando a guardarla di persona.</p>
      </div>
    );
  }

  if (isFinal(v)) {
    const order = [...v.players].sort((a, b) => b.points - a.points);
    return (
      <div className="gf-screen">
        <h2 className="question"><WinnerTitle winner={v.winner} /></h2>
        <PublicZones zones={v.zones} revealed />
        <TugBar seconds={v.seconds} weight={v.weight} />
        <p className="muted">{v.catches} {v.catches === 1 ? "cattura" : "catture"}</p>
        <ul className="zh-roles">
          {order.map((p) => (
            <li key={p.id} className={`zh-role ${p.role === "ghost" ? "zh-zombie" : ""}`}>
              <span>{SIDE_ICON[p.role]}</span> {p.nickname} <b>{p.points}</b>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const hiding = now < v.huntersFrom;
  const jailed = v.caught.filter((c) => c.until > now);
  return (
    <div className="gf-screen">
      <Countdown openedAt={v.startedAt} deadline={v.endsAt} clock={clock} />
      {hiding ? (
        <h2 className="question">I fantasmi si nascondono… {secsLeft(v.huntersFrom, now)}s</h2>
      ) : (
        <h2 className="question">{v.ghostsTotal} {v.ghostsTotal === 1 ? "fantasma" : "fantasmi"} in giro: trovateli!</h2>
      )}
      <PublicZones zones={v.zones} revealed={false} />
      <p className="muted">Chi è padrone di una zona? Lo sa solo chi va a vederla di persona.</p>
      {jailed.length > 0 && (
        <p className="gf-jail">
          {jailed.map((c) => `🔒 ${c.nickname} (${secsLeft(c.until, now)}s)`).join(" · ")}
        </p>
      )}
      <EventLog events={v.events} />
    </div>
  );
}

/** Legge (una volta) il codice di zona dal link del QR e lo toglie dall'indirizzo. */
function takeZoneParam(): string | null {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("zona");
    if (!code) return null;
    url.searchParams.delete("zona");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    return code;
  } catch {
    return null;
  }
}

function feedbackText(f: Feedback, zones: PlayerZone[], now: number): string {
  const zone = f.zone !== null ? (zones[f.zone]?.name ?? "") : "";
  switch (f.kind) {
    case "ok":
      return `Hai preso ${zone}!`;
    case "flip":
      return `${zone} strappata al nemico! +${f.points}`;
    case "own":
      return `${zone} è già della tua fazione.`;
    case "look":
      return `${zone}: ${stateText(f.owner, f.since, now)}`;
    case "zoneLocked":
      return `${zone} è appena stata conquistata: bloccata ancora ${secsLeft(f.until ?? 0, now)}s.`;
    case "unknown":
      return "Codice non valido: riprova.";
    case "cooldown":
      return `Aspetta ancora ${secsLeft(f.until ?? 0, now)}s prima di riprovare.`;
    case "headStart":
      return "I fantasmi si stanno nascondendo: aspetta il via.";
    case "locked":
      return `Sei bloccato ancora per ${secsLeft(f.until ?? 0, now)}s.`;
    case "caught":
      return `Preso! ${f.target} era un fantasma! +${f.points}`;
    case "missed":
      return `${f.target} non è un fantasma! Sei bloccato ${secsLeft(f.until ?? 0, now)}s, ${f.points} punti.`;
    case "already":
      return `${f.target} è già in prigione.`;
    case "self":
      return "Non puoi accusare questo giocatore.";
  }
}

const GOOD_FEEDBACK: Feedback["kind"][] = ["ok", "flip", "caught"];
const BAD_FEEDBACK: Feedback["kind"][] = ["missed", "zoneLocked", "unknown", "locked", "cooldown", "headStart"];
const FEEDBACK_VISIBLE_MS = 8000;

/** Una zona che il giocatore sta guardando: attende il responso del server, poi mostra lo stato e chiede conferma. */
interface Pending {
  code: string;
  /** Orario dell'ultimo esito prima della richiesta: un esito diverso è la risposta. */
  baseline: number;
  /** Indice della zona, noto quando il server ha risposto. */
  zone: number | null;
}

export function GhostHuntController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PlayerSetup | PlayerPlay | PlayerDone;
  const sfx = useSfx(theme);
  const now = useServerNow(clock);
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [showRules, setShowRules] = useState(false);
  const fb = v.feedback;
  const phase = v.phase;

  /** Qualunque modo di leggere una zona (scanner, link, codice a mano) la controlla prima di conquistarla. */
  const look = (c: string) => {
    send({ type: "look", code: c });
    setPending({ code: c, baseline: fb?.at ?? 0, zone: null });
  };

  // Il QR di una zona apre /play?zona=CODICE: appena la caccia è in corso la si controlla.
  useEffect(() => {
    if (phase !== "play") return;
    const zone = takeZoneParam();
    if (zone) look(zone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // La risposta del server a «controlla»: o lo stato della zona o un errore (codice sbagliato, blocco…).
  useEffect(() => {
    if (!pending || pending.zone !== null || !fb || fb.at === pending.baseline) return;
    setPending(fb.kind === "look" && fb.zone !== null ? { ...pending, zone: fb.zone } : null);
  }, [fb?.at, fb?.kind, fb?.zone, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!fb) return;
    if (GOOD_FEEDBACK.includes(fb.kind)) sfx("correct");
    else if (BAD_FEEDBACK.includes(fb.kind)) sfx("wrong");
  }, [fb?.at, fb?.kind, sfx]); // eslint-disable-line react-hooks/exhaustive-deps

  const rules = isFinal(v) ? null : v.rules;
  const roleBadge = (
    <div className="gf-head">
      <p className={`gf-role gf-${v.role}`} data-role={v.role}>
        {SIDE_ICON[v.role]} Sei {v.role === "ghost" ? "un FANTASMA" : "un ACCHIAPPAFANTASMI"}
        {v.points !== null && ` · ${v.points} pt`}
      </p>
      {rules && <button className="gf-info" onClick={() => setShowRules(true)}>ℹ️ Regole</button>}
      {rules && showRules && <RulesDialog role={v.role} rules={rules} onClose={() => setShowRules(false)} />}
    </div>
  );

  if (isFinal(v)) {
    const won = v.winner === v.role;
    return (
      <div className="gf-ctrl">
        {roleBadge}
        <p className="big">{v.winner === "draw" ? "Pareggio" : won ? "Avete vinto!" : "Avete perso"}</p>
        <p className="muted"><WinnerTitle winner={v.winner} /></p>
      </div>
    );
  }

  if (v.phase === "setup") {
    return (
      <div className="gf-ctrl">
        {roleBadge}
        {v.role === "ghost" ? (
          <>
            <p className="big">Nasconditi, conquista le zone e non farti scoprire.</p>
            <p className="muted">
              {v.mates.length > 0 ? `Gli altri fantasmi: ${v.mates.join(", ")}.` : "Sei l'unico fantasma."} Nessun altro lo sa: non dirlo!
            </p>
          </>
        ) : (
          <>
            <p className="big">Trova i fantasmi e accusali.</p>
            <p className="muted">Purifica le zone scansionando i loro QR. Se accusi un innocente, resti bloccato e perdi punti.</p>
          </>
        )}
        <p className="muted">Lo stato di una zona (libera, infestata, purificata) lo vedi solo scansionando il suo QR di persona.</p>
        <SeenZones zones={v.zones} now={now} />
        <p className="muted">Aspetta il via della regia.</p>
      </div>
    );
  }

  const p = v;
  const hiding = p.role === "hunter" && now < p.huntersFrom;
  const locked = now < p.lockedUntil;
  const canAct = !hiding && !locked;
  const scanWait = secsLeft(p.nextScanAt, now);
  const accuseWait = secsLeft(p.nextAccuseAt, now);
  // L'esito di «controlla» lo mostra la scheda della zona, non la riga di stato.
  const showFeedback = fb && fb.kind !== "look" && now - fb.at < FEEDBACK_VISIBLE_MS;
  const target = picked ? p.suspects.find((s) => s.id === picked) : undefined;
  const looking = pending && pending.zone !== null ? { zone: p.zones[pending.zone], index: pending.zone } : null;
  /** Secondi di blocco rimasti alla zona che si sta guardando (0 = conquistabile). */
  const zoneLockedFor = looking?.zone?.seen ? secsLeft(looking.zone.seen.lockUntil, now) : 0;

  return (
    <div className="gf-ctrl">
      {roleBadge}
      <Countdown openedAt={p.startedAt} deadline={p.endsAt} clock={clock} />
      {hiding && <p className="big gf-banner">Fermo! I fantasmi si nascondono: {secsLeft(p.huntersFrom, now)}s</p>}
      {locked && (
        <p className="big gf-banner">
          {p.role === "ghost" ? "🔒 Sei in prigione" : "⛔ Bloccato"}: {secsLeft(p.lockedUntil, now)}s
        </p>
      )}
      {showFeedback && <p className={`gf-feedback ${GOOD_FEEDBACK.includes(fb.kind) ? "good" : "bad"}`} role="status">{feedbackText(fb, p.zones, now)}</p>}

      {scanning && (
        <Suspense fallback={<div className="gf-scanner"><p className="gf-scanner-msg">Avvio della fotocamera…</p></div>}>
          <QrScanner
            onCode={(c) => {
              setScanning(false);
              look(c);
            }}
            onClose={() => setScanning(false)}
          />
        </Suspense>
      )}
      {pending && !looking && <p className="gf-pending" aria-label="Controllo in corso">Controllo la zona…</p>}
      {pending && looking?.zone && (
        <section className="gf-pending" aria-label="Zona controllata">
          <p className="big">📷 {looking.zone.name}</p>
          <p>
            {looking.zone.seen ? stateText(looking.zone.seen.owner, looking.zone.seen.since, now) : "?"}
          </p>
          {zoneLockedFor > 0 && <p className="gf-lock">🔒 Bloccata ancora {zoneLockedFor}s: nessuno può conquistarla.</p>}
          {looking.zone.seen?.owner === p.role ? (
            <p className="muted">È già della tua fazione.</p>
          ) : (
            <button
              className="primary gf-pending-go"
              disabled={!canAct || scanWait > 0 || zoneLockedFor > 0}
              onClick={() => {
                send({ type: "scan", code: pending.code });
                setPending(null);
              }}
            >
              {zoneLockedFor > 0 ? `Bloccata ${zoneLockedFor}s` : scanWait > 0 && canAct ? `Attendi ${scanWait}s` : p.role === "ghost" ? "👻 Infesta la zona" : "🔦 Purifica la zona"}
            </button>
          )}
          <button onClick={() => setPending(null)}>{looking.zone.seen?.owner === p.role ? "Chiudi" : "Lascia stare"}</button>
        </section>
      )}
      <button className="gf-scan-open" disabled={scanning} onClick={() => setScanning(true)}>📷 Scansiona il QR</button>

      <form
        className="gf-scan"
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim()) return;
          look(code);
          setCode("");
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Codice della zona"
          aria-label="Codice della zona"
          autoCapitalize="characters"
          autoCorrect="off"
          maxLength={12}
        />
        <button className="primary" type="submit" disabled={!canAct || code.trim() === ""}>Controlla</button>
      </form>
      <p className="muted">Per sapere chi controlla una zona devi essere lì: scansiona il QR nell'app, con la fotocamera del telefono, oppure scrivi il codice.</p>

      <SeenZones zones={p.zones} now={now} />

      {p.role === "hunter" && (
        <section className="gf-accuse">
          <h3>Accusa un fantasma</h3>
          <div className="gf-suspects">
            {p.suspects.map((s) => {
              const jailed = s.jailedUntil > now;
              return (
                <button
                  key={s.id}
                  className={`gf-suspect ${picked === s.id ? "chosen" : ""}`}
                  disabled={!canAct || jailed}
                  onClick={() => setPicked(picked === s.id ? null : s.id)}
                >
                  {s.nickname}
                  {jailed && " 🔒"}
                </button>
              );
            })}
          </div>
          <button
            className="primary gf-accuse-go"
            disabled={!canAct || !target || accuseWait > 0}
            onClick={() => {
              if (!target) return;
              send({ type: "accuse", target: target.id });
              setPicked(null);
            }}
          >
            {accuseWait > 0 && canAct ? `Attendi ${accuseWait}s` : target ? `Accusa ${target.nickname}` : "Scegli chi accusare"}
          </button>
          <p className="muted">Accusa sbagliata: resti bloccato e perdi punti.</p>
        </section>
      )}

      {p.role === "ghost" && p.mates.length > 0 && <p className="muted">Compagni fantasma: {p.mates.join(", ")}</p>}
      <EventLog events={p.events} />
    </div>
  );
}
