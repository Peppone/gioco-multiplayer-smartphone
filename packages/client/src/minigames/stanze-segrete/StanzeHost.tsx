import { useEffect, useRef, useState } from "react";
import { useSfx } from "../../audio/useAudio";
import { useRemaining } from "../Countdown";
import type { HostProps } from "../types";
import "./host.css";
import { DIRS, DIR_ARROW, DIR_LABEL, type Dir, type Outcome, playerColor } from "./types";

interface HostGrant {
  id: string;
  playerId: string;
  action: string;
  sightScope?: "own-room" | number;
  directions?: Dir[];
  usesLeft: number | null;
  expiresAt: number | null;
}
interface HostRequest {
  id: number;
  playerId: string;
  kind: "move" | "peek" | "custom" | "guess";
  direction?: Dir;
  actionId?: string;
  word?: string;
  at: number;
  nickname: string;
  correct: boolean | null;
}
interface HostMessage {
  id: number;
  from: string;
  toKind: "master" | "player" | "room" | "all";
  toPlayer: string | null;
  toCell: number | null;
  recipients: string[];
  text: string;
  at: number;
  readBy: Record<string, number>;
  masterReadAt: number | null;
  replyTo: number | null;
  allowReply: boolean;
  maxReplies: number;
}
interface HostItem {
  id: string;
  name: string;
  icon: string;
  text: string;
  note: string;
  cell: number | null;
  enabled: boolean;
  revealedTo: string[];
}
interface HostTimer {
  id: string;
  label: string;
  intervalSec: number | null;
  running: boolean;
  startedAt: number;
  accumulatedMs: number;
  laps: number;
}
interface HostEvent {
  id: number;
  text: string;
  at: number;
  to: "all" | string[];
  accepted: Record<string, number | null>;
  cancelled: boolean;
}
interface HostInfo {
  phase: "setup" | "play" | "reveal" | "done";
  rows: number;
  cols: number;
  rooms: { letter: string; note: string }[];
  words: string[];
  solution: string;
  customActions: { id: string; label: string }[];
  presetEvents: string[];
  defaultSightSec: number;
  eventMaxLength: number;
  messageMaxLength: number;
  roster: { id: string; nickname: string }[];
  positions: Record<string, number | null>;
  outcome: Record<string, Outcome>;
  solved: Record<string, boolean>;
  unplaced: number;
  mapShown: boolean;
  grants: HostGrant[];
  closedDoors: { a: number; b: number }[];
  items: HostItem[];
  timers: HostTimer[];
  sightings: { playerId: string; cellId: number; until: number }[];
  requests: HostRequest[];
  messages: HostMessage[];
  events: HostEvent[];
  log: { at: number; text: string }[];
}

type Run = HostProps["run"];
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const roomName = (c: number) => `Stanza ${c + 1}`;

function neighbor(i: HostInfo, cell: number, d: Dir): number | null {
  const r = Math.floor(cell / i.cols) + (d === "up" ? -1 : d === "down" ? 1 : 0);
  const c = (cell % i.cols) + (d === "left" ? -1 : d === "right" ? 1 : 0);
  return r < 0 || c < 0 || r >= i.rows || c >= i.cols ? null : r * i.cols + c;
}

const isClosed = (i: HostInfo, a: number, b: number) => i.closedDoors.some((d) => d.a === Math.min(a, b) && d.b === Math.max(a, b));

type Names = (id: string) => string;

function ActionName({ action, info }: { action: string; info: HostInfo }) {
  const names: Record<string, string> = { move: "Muoversi", peek: "Sbirciare", sight: "Guardare la lettera", message: "Scrivere al Master", guess: "Proporre la soluzione" };
  return <>{names[action] ?? info.customActions.find((a) => `custom:${a.id}` === action)?.label ?? action}</>;
}

// ------------------------------------------------------------------ Mappa

function MapView({ info, run, sel, setSel, selCell, setSelCell, index }: {
  info: HostInfo; run: Run; sel: string | null; setSel: (id: string | null) => void; selCell: number | null; setSelCell: (c: number | null) => void; index: (id: string) => number;
}) {
  const cells = Array.from({ length: info.rows * info.cols }, (_, i) => i);
  const tapRoom = (c: number) => {
    if (sel) {
      void run({ type: "place", playerId: sel, cellId: c });
      setSel(null);
    } else setSelCell(selCell === c ? null : c);
  };
  return (
    <div className="sh-map" style={{ gridTemplateColumns: `repeat(${info.cols}, 1fr)` }}>
      {cells.map((c) => {
        const here = info.roster.filter((p) => info.positions[p.id] === c);
        const asks = info.requests.filter((r) => r.playerId && info.positions[r.playerId] === c && (r.kind === "move" || r.kind === "peek"));
        const right = neighbor(info, c, "right");
        const down = neighbor(info, c, "down");
        return (
          <div key={c} className={`sh-room ${selCell === c ? "sel" : ""}`} data-cell={c}>
            <button className="sh-room-tap" onClick={() => tapRoom(c)} aria-label={`${roomName(c)}, lettera ${info.rooms[c]?.letter}`}>
              <span className="sh-num">{c + 1}</span>
              <span className="sh-letter">{info.rooms[c]?.letter}</span>
            </button>
            {info.rooms[c]?.note && <small className="sh-note">{info.rooms[c]!.note}</small>}
            <div className="sh-occupants">
              {here.map((p) => (
                <button key={p.id} className={`sh-av ${sel === p.id ? "sel" : ""}`} style={{ background: playerColor(index(p.id)) }} onClick={() => setSel(sel === p.id ? null : p.id)} title={p.nickname} aria-label={p.nickname}>
                  {p.nickname.slice(0, 1).toUpperCase()}
                </button>
              ))}
              {asks.map((r) => <span key={r.id} className="sh-ask">{r.nickname}{r.direction ? DIR_ARROW[r.direction] : ""}</span>)}
            </div>
            {right !== null && (
              <button className={`sh-door h ${isClosed(info, c, right) ? "closed" : ""}`} aria-label={`Porta tra ${roomName(c)} e ${roomName(right)}`} onClick={() => void run({ type: "door", a: c, b: right, open: isClosed(info, c, right) })}>
                {isClosed(info, c, right) ? "🔒" : ""}
              </button>
            )}
            {down !== null && (
              <button className={`sh-door v ${isClosed(info, c, down) ? "closed" : ""}`} aria-label={`Porta tra ${roomName(c)} e ${roomName(down)}`} onClick={() => void run({ type: "door", a: c, b: down, open: isClosed(info, c, down) })}>
                {isClosed(info, c, down) ? "🔒" : ""}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Richieste

function Requests({ info, run }: { info: HostInfo; run: Run }) {
  const [secs, setSecs] = useState(String(info.defaultSightSec));
  const target = (r: HostRequest) => {
    const from = info.positions[r.playerId];
    return from === null || from === undefined || !r.direction ? null : neighbor(info, from, r.direction);
  };
  const moves = info.requests.filter((r) => r.kind === "move");
  if (info.requests.length === 0) return <p className="muted">Nessuna richiesta in attesa.</p>;
  return (
    <div className="sh-requests">
      {moves.length > 1 && (
        <div className="row">
          <button className="primary" onClick={() => void run({ type: "resolve-all-moves", approve: true })}>Approva tutti gli spostamenti ({moves.length})</button>
          <button onClick={() => void run({ type: "resolve-all-moves", approve: false })}>Rifiuta tutti</button>
        </div>
      )}
      <ul className="sh-req-list">
        {info.requests.map((r) => {
          const to = target(r);
          return (
            <li key={r.id} className={`sh-req ${r.kind}`} data-kind={r.kind}>
              <b>{r.nickname}</b>{" "}
              {r.kind === "move" && <>chiede di andare {DIR_LABEL[r.direction!]} {DIR_ARROW[r.direction!]}{to !== null && <> (verso la {roomName(to)})</>}</>}
              {r.kind === "peek" && <>vuole sbirciare {DIR_LABEL[r.direction!]} {DIR_ARROW[r.direction!]}{to !== null && <> (la {roomName(to)})</>}</>}
              {r.kind === "guess" && <>propone «{r.word}» <span className={r.correct ? "ok" : "ko"}>({r.correct ? "giusta" : "sbagliata"})</span></>}
              {r.kind === "custom" && <>chiede: {info.customActions.find((a) => a.id === r.actionId)?.label ?? r.actionId}</>}
              <div className="row">
                <button className="primary" onClick={() => void run({ type: "resolve", requestId: r.id, approve: true })}>
                  {r.kind === "guess" ? "Convalida" : "Approva"}
                </button>
                {r.kind === "peek" && (
                  <>
                    <input type="number" min={1} max={300} value={secs} onChange={(e) => setSecs(e.target.value)} className="sh-num-in" aria-label="Secondi" />
                    <button onClick={() => void run({ type: "resolve", requestId: r.id, approve: true, showLetterSec: Math.max(1, Number(secs) || info.defaultSightSec) })}>Mostra la lettera ({secs} s)</button>
                  </>
                )}
                <button onClick={() => void run({ type: "resolve", requestId: r.id, approve: false })}>Rifiuta</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Giocatori e capacità

interface GrantOpts {
  duration: string;
  uses: string;
  scope: string;
}

function GrantTimer({ g, clock }: { g: HostGrant; clock: HostProps["clock"] }) {
  const left = useRemaining(g.expiresAt ?? 0, clock);
  if (g.usesLeft === null && g.expiresAt === null) return <small className="muted">finché non lo spegni</small>;
  return (
    <small className="muted">
      {g.usesLeft !== null && `${g.usesLeft} usi`}
      {g.usesLeft !== null && g.expiresAt !== null && " · "}
      {g.expiresAt !== null && `${Math.ceil(left / 1000)} s`}
    </small>
  );
}

function grantCommand(target: unknown, action: string, o: GrantOpts): Record<string, unknown> {
  return {
    type: "grant",
    target,
    action,
    ...(action === "sight" && { sightScope: o.scope === "own-room" ? "own-room" : Number(o.scope) }),
    ...(Number(o.duration) > 0 && { durationSec: Math.floor(Number(o.duration)) }),
    // Le lettere si guardano per poco: senza limiti indicati vale una sola occhiata (§5.3 del piano).
    ...(Number(o.uses) > 0 ? { uses: Math.floor(Number(o.uses)) } : action === "sight" && !(Number(o.duration) > 0) ? { uses: 1 } : {}),
  };
}

function PlayerCard({ info, p, i, run, opts, clock, nameOf }: {
  info: HostInfo; p: { id: string; nickname: string }; i: number; run: Run; opts: GrantOpts; clock: HostProps["clock"]; nameOf: Names;
}) {
  const actions = ["move", "peek", "sight", "message", "guess", ...info.customActions.map((a) => `custom:${a.id}`)];
  const mine = info.grants.filter((g) => g.playerId === p.id);
  const cell = info.positions[p.id];
  const [letterCell, setLetterCell] = useState("0");
  const [letterSec, setLetterSec] = useState(String(info.defaultSightSec));
  const [msg, setMsg] = useState("");
  void nameOf;
  const talk = info.messages.filter((m) => m.from === p.id || (m.from === "master" && m.recipients.includes(p.id)));

  return (
    <details className="sh-player" data-player={p.nickname}>
      <summary>
        <span className="sh-av static" style={{ background: playerColor(i) }}>{p.nickname.slice(0, 1).toUpperCase()}</span>
        <b>{p.nickname}</b> <span className="muted">{cell === null || cell === undefined ? "non piazzato" : roomName(cell)}</span>
        {mine.length > 0 && <span className="sh-caps">{mine.length} ✓</span>}
        {info.outcome[p.id] !== "in-gioco" && <span className="sh-out">{info.outcome[p.id]}</span>}
      </summary>
      <div className="sh-player-body">
        <label>
          Esito{" "}
          <select value={info.outcome[p.id]} onChange={(e) => void run({ type: "set-outcome", playerId: p.id, outcome: e.target.value })}>
            <option value="in-gioco">in gioco</option>
            <option value="fuggito">fuggito</option>
            <option value="eliminato">eliminato</option>
          </select>
        </label>
        <ul className="sh-caps-list">
          {actions.map((a) => {
            const g = mine.find((x) => x.action === a);
            return (
              <li key={a}>
                <button
                  className={`sh-toggle ${g ? "on" : ""}`}
                  aria-pressed={!!g}
                  data-action={a}
                  onClick={() => void run(g ? { type: "revoke", grantId: g.id } : grantCommand({ players: [p.id] }, a, opts))}
                >
                  <ActionName action={a} info={info} /> {g ? "● acceso" : "○ spento"}
                </button>
                {g && <GrantTimer g={g} clock={clock} />}
                {g && (a === "move" || a === "peek") && (
                  <div className="sh-dirs" aria-label="Direzioni aperte">
                    {DIRS.map((d) => {
                      const open = (g.directions ?? DIRS).includes(d);
                      return (
                        <button key={d} className={`sh-dir ${open ? "open" : "blocked"}`} data-dir={d} aria-pressed={open} aria-label={`${DIR_LABEL[d]}: ${open ? "aperta" : "bloccata"}`}
                          onClick={() => void run({ type: "set-directions", grantId: g.id, directions: open ? (g.directions ?? [...DIRS]).filter((x) => x !== d) : [...(g.directions ?? []), d] })}>
                          {open ? DIR_ARROW[d] : "🔒"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="row">
          <select value={letterCell} onChange={(e) => setLetterCell(e.target.value)} aria-label="Lettera della stanza">
            {info.rooms.map((r, c) => <option key={c} value={c}>{roomName(c)} ({r.letter})</option>)}
          </select>
          <input type="number" min={1} max={300} value={letterSec} onChange={(e) => setLetterSec(e.target.value)} className="sh-num-in" aria-label="Secondi" />
          <button onClick={() => void run({ type: "show-letter", target: { players: [p.id] }, cellId: Number(letterCell), seconds: Math.max(1, Number(letterSec) || 5) })}>Mostra una lettera</button>
        </div>
        <ul className="sh-talk">
          {talk.slice(-4).map((m) => <li key={m.id} className={m.from === "master" ? "gm" : "pl"}>{m.from === "master" ? "Tu" : p.nickname}: {m.text}</li>)}
        </ul>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) { void run({ type: "message", to: { player: p.id }, text: msg }); setMsg(""); } }}>
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={`Messaggio a ${p.nickname}`} maxLength={info.messageMaxLength} />
          <button type="submit">Invia</button>
        </form>
      </div>
    </details>
  );
}

// ------------------------------------------------------------------ Abilitazione rapida

function QuickGrant({ info, run, opts, setOpts }: { info: HostInfo; run: Run; opts: GrantOpts; setOpts: (o: GrantOpts) => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [room, setRoom] = useState("");
  const [action, setAction] = useState("sight");
  const actions = ["move", "peek", "sight", "message", "guess", ...info.customActions.map((a) => `custom:${a.id}`)];
  const target = (): unknown => {
    if (room !== "") return { cell: Number(room) };
    if (picked.size === 0 || picked.size === info.roster.length) return "all";
    return { players: [...picked] };
  };
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
    setRoom("");
  };
  return (
    <div className="sh-quick">
      <div className="chips">
        <button className={`chip ${picked.size === 0 && room === "" ? "on" : ""}`} onClick={() => { setPicked(new Set()); setRoom(""); }}>Tutti</button>
        {info.roster.map((p) => (
          <button key={p.id} className={`chip ${picked.has(p.id) ? "on" : ""}`} aria-pressed={picked.has(p.id)} onClick={() => toggle(p.id)}>{p.nickname}</button>
        ))}
        <select value={room} onChange={(e) => { setRoom(e.target.value); setPicked(new Set()); }} aria-label="Occupanti di una stanza">
          <option value="">Una stanza…</option>
          {info.rooms.map((_, c) => <option key={c} value={c}>Chi è nella {roomName(c)}</option>)}
        </select>
      </div>
      <div className="row">
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Capacità">
          {actions.map((a) => <option key={a} value={a}>{info.customActions.find((c) => `custom:${c.id}` === a)?.label ?? ({ move: "Muoversi", peek: "Sbirciare", sight: "Guardare la lettera", message: "Scrivere al Master", guess: "Proporre la soluzione" } as Record<string, string>)[a]}</option>)}
        </select>
        <button className="primary" onClick={() => void run(grantCommand(target(), action, opts))}>Abilita</button>
        <button onClick={() => void run({ type: "revoke", target: target(), action })}>Disabilita</button>
        <button className="danger" onClick={() => { if (confirm("Spegnere ogni capacità di tutti i giocatori?")) void run({ type: "revoke", target: "all" }); }}>Spegni tutto</button>
      </div>
      <div className="row sh-opts">
        <label>Durata (s) <input type="number" min={0} value={opts.duration} onChange={(e) => setOpts({ ...opts, duration: e.target.value })} className="sh-num-in" placeholder="∞" /></label>
        <label>Usi <input type="number" min={0} value={opts.uses} onChange={(e) => setOpts({ ...opts, uses: e.target.value })} className="sh-num-in" placeholder="∞" /></label>
        <label>
          Lettera{" "}
          <select value={opts.scope} onChange={(e) => setOpts({ ...opts, scope: e.target.value })}>
            <option value="own-room">della stanza in cui si trova</option>
            {info.rooms.map((_, c) => <option key={c} value={c}>{roomName(c)}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Tempo

/** Ora server, aggiornata ogni 250 ms: serve ai contatori che scorrono. */
function useServerNow(clock: HostProps["clock"]): number {
  const [now, setNow] = useState(() => clock.toServerTime(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setNow(clock.toServerTime(Date.now())), 250);
    return () => clearInterval(id);
  }, [clock]);
  return now;
}

const clockText = (ms: number) => {
  const t = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(t / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h > 0 ? `${h}:` : ""}${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
};

function TimerRow({ t, now, run, sfx }: { t: HostTimer; now: number; run: Run; sfx: (n: "buzz") => void }) {
  const elapsed = t.accumulatedMs + (t.running ? Math.max(0, now - t.startedAt) : 0);
  const every = t.intervalSec ? t.intervalSec * 1000 : null;
  const into = every ? elapsed % every : 0;
  // Un avviso quando scatta un nuovo intervallo: suono, vibrazione e la riga si evidenzia per qualche secondo.
  const [flash, setFlash] = useState(false);
  const lastLaps = useRef(t.laps);
  useEffect(() => {
    if (t.laps > lastLaps.current) {
      sfx("buzz");
      navigator.vibrate?.([120, 60, 120]);
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 6000);
      lastLaps.current = t.laps;
      return () => clearTimeout(id);
    }
    lastLaps.current = t.laps;
  }, [t.laps, sfx]);

  return (
    <li className={`sh-timer ${t.running ? "running" : ""} ${flash ? "flash" : ""}`} data-timer={t.id}>
      <div className="row">
        <b>{t.label}</b>
        <output className="sh-clock" aria-label={`Tempo trascorso: ${t.label}`}>{clockText(elapsed)}</output>
      </div>
      {every && (
        <>
          <div className="sh-lap-bar" aria-hidden="true"><div style={{ width: `${(into / every) * 100}%` }} /></div>
          <small className="muted">
            Ogni {t.intervalSec! % 60 === 0 ? `${t.intervalSec! / 60} min` : `${t.intervalSec} s`} · intervalli trascorsi: <b data-laps>{t.laps}</b>
            {flash && <b className="sh-lap-alert"> · ⏱ intervallo scaduto!</b>}
          </small>
        </>
      )}
      <div className="row">
        {t.running ? (
          <button onClick={() => void run({ type: "timer-pause", timerId: t.id })}>Pausa</button>
        ) : (
          <button className="primary" onClick={() => void run({ type: "timer-start", timerId: t.id })}>{elapsed > 0 ? "Riprendi" : "Avvia"}</button>
        )}
        <button onClick={() => void run({ type: "timer-reset", timerId: t.id })}>Azzera</button>
        <button className="danger" onClick={() => void run({ type: "timer-remove", timerId: t.id })}>Elimina</button>
      </div>
    </li>
  );
}

/** Il tempo di gioco e i cronometri del Master (anche a intervalli fissi): solo per lui, non vanno a schermo né ai giocatori. */
function Clocks({ info, run, clock, sfx }: { info: HostInfo; run: Run; clock: HostProps["clock"]; sfx: (n: "buzz") => void }) {
  const now = useServerNow(clock);
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState("");
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    const secs = Math.round(Number(minutes.replace(",", ".")) * 60);
    void run({ type: "timer-add", label, ...(secs >= 5 && { intervalSec: secs }) });
    setLabel("");
    setMinutes("");
  };
  return (
    <div className="sh-clocks">
      <ul className="sh-timers">
        {info.timers.map((t) => <TimerRow key={t.id} t={t} now={now} run={run} sfx={sfx} />)}
      </ul>
      <form className="row" onSubmit={add}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nuovo cronometro (es. Gas nella Stanza 5)" maxLength={30} aria-label="Nome del cronometro" />
        <input value={minutes} onChange={(e) => setMinutes(e.target.value)} className="sh-num-in" inputMode="decimal" placeholder="ogni… min" aria-label="Intervallo in minuti (facoltativo)" />
        <button type="submit" disabled={info.timers.length >= 10}>Aggiungi</button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ Oggetti

/** Gli oggetti del complesso: li metti in una stanza, li rendi percepibili (misteriosi) e poi li palesi ai presenti o ad alcuni. */
function Items({ info, run, nameOf }: { info: HostInfo; run: Run; nameOf: Names }) {
  return (
    <ul className="sh-items">
      {info.items.map((it) => {
        const here = info.roster.filter((p) => it.cell !== null && info.positions[p.id] === it.cell);
        return (
          <li key={it.id} className={`sh-item ${it.enabled ? "on" : ""}`} data-item={it.id}>
            <div className="row">
              <b>{it.icon} {it.name}</b>
              <select value={it.cell ?? ""} onChange={(e) => void run({ type: "place-item", itemId: it.id, cellId: e.target.value === "" ? null : Number(e.target.value) })} aria-label={`Stanza di ${it.name}`}>
                <option value="">In nessuna stanza</option>
                {info.rooms.map((_, c) => <option key={c} value={c}>{roomName(c)}</option>)}
              </select>
            </div>
            {(it.note || it.text) && <small className="muted">{it.note}{it.note && it.text ? " · " : ""}{it.text && `Testo: «${it.text}»`}</small>}
            {it.cell !== null && (
              <>
                <button className={`sh-toggle ${it.enabled ? "on" : ""}`} aria-pressed={it.enabled} onClick={() => void run({ type: "enable-item", itemId: it.id, enabled: !it.enabled })}>
                  {it.enabled ? "● I presenti sanno che c'è qualcosa" : "○ Nascosto ai giocatori"}
                </button>
                <div className="row">
                  <button disabled={here.length === 0} onClick={() => void run({ type: "reveal-item", itemId: it.id, to: "room" })}>Palesa ai presenti ({here.length})</button>
                  {here.map((p) => (
                    <button key={p.id} className={`chip ${it.revealedTo.includes(p.id) ? "on" : ""}`} disabled={it.revealedTo.includes(p.id)} onClick={() => void run({ type: "reveal-item", itemId: it.id, to: { players: [p.id] } })}>
                      Palesa a {p.nickname}
                    </button>
                  ))}
                  {it.revealedTo.length > 0 && <button onClick={() => void run({ type: "conceal-item", itemId: it.id })}>Rendi di nuovo misterioso</button>}
                </div>
                {it.revealedTo.length > 0 && <small className="muted">Lo conoscono: {it.revealedTo.map(nameOf).join(", ")}</small>}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ Posta

function Mail({ info, run, nameOf }: { info: HostInfo; run: Run; nameOf: Names }) {
  const [to, setTo] = useState("all");
  const [text, setText] = useState("");
  const [allowReply, setAllowReply] = useState(true);
  const inbox = info.messages.filter((m) => m.from !== "master");
  const unread = inbox.filter((m) => m.masterReadAt === null);
  const target = (): unknown => (to === "all" ? "all" : to.startsWith("c:") ? { cell: Number(to.slice(2)) } : { player: to.slice(2) });
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run({ type: "message", to: target(), text, allowReply });
    setText("");
  };
  return (
    <div className="sh-mail">
      <h4>Posta in arrivo {unread.length > 0 && <b className="sh-count">{unread.length}</b>}</h4>
      <ul className="sh-inbox">
        {inbox.length === 0 && <li className="muted">Nessun messaggio dai giocatori.</li>}
        {[...inbox].reverse().slice(0, 30).map((m) => (
          <li key={m.id} className={m.masterReadAt === null ? "unread" : ""}>
            <small className="muted">{hhmm(m.at)} · {nameOf(m.from)}{m.replyTo ? " (risposta)" : ""}</small>
            <div>{m.text}</div>
            <div className="row">
              {m.masterReadAt === null && <button onClick={() => void run({ type: "read", messageId: m.id })}>Letto</button>}
              <button onClick={() => { setTo(`p:${m.from}`); void run({ type: "read", messageId: m.id }); }}>Rispondi</button>
            </div>
          </li>
        ))}
      </ul>
      <form className="sh-compose" onSubmit={send}>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Destinatario del messaggio">
          <option value="all">Tutti i giocatori</option>
          {info.roster.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.nickname}</option>)}
          {info.rooms.map((_, c) => <option key={c} value={`c:${c}`}>Occupanti della {roomName(c)}</option>)}
        </select>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Messaggio segreto…" maxLength={info.messageMaxLength} rows={2} aria-label="Testo del messaggio" />
        <label className="check"><input type="checkbox" checked={allowReply} onChange={(e) => setAllowReply(e.target.checked)} /> Consenti risposta</label>
        <button type="submit" className="primary">Invia il messaggio</button>
      </form>
      <h4>Inviati</h4>
      <ul className="sh-sent">
        {[...info.messages].reverse().filter((m) => m.from === "master").slice(0, 10).map((m) => (
          <li key={m.id}>
            <small className="muted">{hhmm(m.at)} · a {m.toKind === "all" ? "tutti" : m.toKind === "room" ? roomName(m.toCell!) : nameOf(m.toPlayer!)} · letto da {Object.keys(m.readBy).length}/{m.recipients.length}</small>
            <div>{m.text}</div>
            {m.allowReply && <button onClick={() => void run({ type: "close-reply", messageId: m.id })}>Chiudi le risposte</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Eventi

function Events({ info, run, nameOf }: { info: HostInfo; run: Run; nameOf: Names }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(info.roster.map((p) => p.id)));
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };
  const all = picked.size === info.roster.length;
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || picked.size === 0) return;
    void run({ type: "event", to: all ? "all" : [...picked], text });
    setText("");
  };
  return (
    <div className="sh-events">
      <form className="sh-compose" onSubmit={send}>
        {info.presetEvents.length > 0 && (
          <div className="chips">
            {info.presetEvents.map((t) => <button type="button" key={t} className="chip" onClick={() => setText(t)}>{t}</button>)}
          </div>
        )}
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Es. Crolla il soffitto della Stanza 5" maxLength={info.eventMaxLength} rows={2} aria-label="Testo dell'evento" />
        <div className="chips">
          <button type="button" className={`chip ${all ? "on" : ""}`} onClick={() => setPicked(new Set(info.roster.map((p) => p.id)))}>Tutti</button>
          <button type="button" className="chip" onClick={() => setPicked(new Set())}>Nessuno</button>
          <button type="button" className="chip" onClick={() => setPicked(new Set(info.roster.map((p) => p.id).filter((id) => !picked.has(id))))}>Inverti (tutti tranne…)</button>
          <select value="" onChange={(e) => e.target.value !== "" && setPicked(new Set(info.roster.map((p) => p.id).filter((id) => info.positions[id] === Number(e.target.value))))} aria-label="Occupanti di una stanza">
            <option value="">Occupanti di…</option>
            {info.rooms.map((_, c) => <option key={c} value={c}>{roomName(c)}</option>)}
          </select>
        </div>
        <div className="chips">
          {info.roster.map((p) => (
            <button type="button" key={p.id} className={`chip ${picked.has(p.id) ? "on" : ""}`} aria-pressed={picked.has(p.id)} onClick={() => toggle(p.id)}>{p.nickname}</button>
          ))}
        </div>
        <button type="submit" className="primary" disabled={picked.size === 0}>⚡ Invia l&apos;evento{all ? " a tutti" : ` a ${picked.size}`}</button>
      </form>
      <ul className="sh-event-list">
        {[...info.events].reverse().map((e) => {
          const ids = Object.keys(e.accepted);
          const done = ids.filter((id) => e.accepted[id] !== null);
          const missing = ids.filter((id) => e.accepted[id] === null);
          return (
            <li key={e.id} className={e.cancelled ? "cancelled" : ""} data-event={e.id}>
              <small className="muted">{hhmm(e.at)}{e.cancelled && " · annullato"}</small>
              <div>{e.text}</div>
              <div className="sh-acc">Accettato da {done.length} di {ids.length}{missing.length > 0 && <> · mancano: {missing.map(nameOf).join(", ")}</>}</div>
              {!e.cancelled && missing.length > 0 && <button className="danger" onClick={() => void run({ type: "cancel-event", eventId: e.id })}>Annulla</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ Host

export function StanzeHost({ info: raw, run, clock, theme }: HostProps) {
  const info = raw as HostInfo;
  const sfx = useSfx(theme);
  const [sel, setSel] = useState<string | null>(null);
  const [selCell, setSelCell] = useState<number | null>(null);
  const [opts, setOpts] = useState<GrantOpts>({ duration: "", uses: "", scope: "own-room" });
  const index = (id: string) => Math.max(0, info.roster.findIndex((p) => p.id === id));
  const nameOf: Names = (id) => info.roster.find((p) => p.id === id)?.nickname ?? "?";

  // Un suono quando arriva una nuova richiesta o un nuovo messaggio dai giocatori.
  const incoming = info.requests.length + info.messages.filter((m) => m.from !== "master" && m.masterReadAt === null).length;
  const prev = useRef(incoming);
  useEffect(() => {
    if (incoming > prev.current) {
      sfx("buzz");
      navigator.vibrate?.(80);
    }
    prev.current = incoming;
  }, [incoming, sfx]);

  const unplaced = info.roster.filter((p) => info.positions[p.id] === null || info.positions[p.id] === undefined);
  const editable = info.phase === "setup" || info.phase === "play";

  return (
    <div className="sh" data-phase={info.phase}>
      <section className="sh-sec">
        <h3 data-map={info.mapShown ? "shown" : "hidden"}>Fase: {info.phase === "setup" ? "preparazione" : info.phase === "play" ? "in gioco" : info.phase === "reveal" ? "rivelazione" : "conclusa"}</h3>
        <div className="row">
          {info.phase === "setup" && <button onClick={() => void run({ type: "place-spread" })}>Distribuisci</button>}
          {info.phase === "setup" && <button className="primary" disabled={unplaced.length > 0} onClick={() => void run({ type: "start" })}>Inizia</button>}
          {editable && (
            <button className={info.mapShown ? "" : "primary"} aria-pressed={info.mapShown} onClick={() => void run({ type: "show-map", visible: !info.mapShown })}>
              {info.mapShown ? "Nascondi la mappa" : "Mostra la mappa a schermo e telefoni"}
            </button>
          )}
          {info.phase === "play" && <button className="primary" onClick={() => void run({ type: "public-reveal" })}>Rivela la mappa sullo schermo</button>}
          {info.phase === "play" && <button className="danger" onClick={() => { if (confirm("Concludere senza rivelare la mappa?")) void run({ type: "end" }); }}>Concludi</button>}
          {info.phase === "reveal" && <button className="primary" onClick={() => void run({ type: "end" })}>Concludi</button>}
        </div>
        {info.phase === "setup" && (
          <p className="sh-unplaced" role="status">
            {unplaced.length > 0 ? <>Da piazzare: {unplaced.map((p) => (
              <button key={p.id} className={`chip ${sel === p.id ? "on" : ""}`} onClick={() => setSel(sel === p.id ? null : p.id)}>{p.nickname}</button>
            ))}</> : "Tutti i giocatori sono piazzati."}
          </p>
        )}
      </section>

      <section className="sh-sec">
        <h3>⏱ Tempo</h3>
        <Clocks info={info} run={run} clock={clock} sfx={sfx} />
      </section>

      <section className="sh-sec">
        <h3>Richieste {info.requests.length > 0 && <b className="sh-count">{info.requests.length}</b>}</h3>
        <Requests info={info} run={run} />
      </section>

      <section className="sh-sec">
        <h3>Mappa</h3>
        <p className="muted">Tocca un giocatore e poi una stanza per spostarlo. Tocca il bordo tra due stanze per chiudere o aprire la porta.</p>
        {editable && (
          <div className="row">
            <button disabled={selCell === null} onClick={() => selCell !== null && void run({ type: "place-all", cellId: selCell })}>
              {selCell === null ? "Tutti in una stanza (scegline una)" : `Tutti nella ${roomName(selCell)}`}
            </button>
            <button onClick={() => void run({ type: "place-spread" })}>Distribuisci</button>
          </div>
        )}
        <MapView info={info} run={run} sel={sel} setSel={setSel} selCell={selCell} setSelCell={setSelCell} index={index} />
      </section>

      <section className="sh-sec">
        <h3>Abilitazione rapida</h3>
        <QuickGrant info={info} run={run} opts={opts} setOpts={setOpts} />
      </section>

      <section className="sh-sec">
        <h3>Giocatori</h3>
        {info.roster.map((p, i) => <PlayerCard key={p.id} info={info} p={p} i={i} run={run} opts={opts} clock={clock} nameOf={nameOf} />)}
      </section>

      <section className="sh-sec">
        <h3>🎒 Oggetti</h3>
        <Items info={info} run={run} nameOf={nameOf} />
      </section>

      <section className="sh-sec">
        <h3>Posta</h3>
        <Mail info={info} run={run} nameOf={nameOf} />
      </section>

      <section className="sh-sec">
        <h3>⚡ Eventi</h3>
        <Events info={info} run={run} nameOf={nameOf} />
      </section>

      <section className="sh-sec">
        <h3>Diario</h3>
        <ul className="sh-log">
          {[...info.log].reverse().slice(0, 40).map((l, i) => <li key={`${l.at}-${i}`}><small className="muted">{hhmm(l.at)}</small> {l.text}</li>)}
        </ul>
      </section>
    </div>
  );
}
