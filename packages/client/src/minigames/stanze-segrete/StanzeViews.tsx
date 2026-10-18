import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGroup, motion } from "framer-motion";
import { useSfx } from "../../audio/useAudio";
import { Countdown, useRemaining } from "../Countdown";
import type { ControllerProps, ViewProps } from "../types";
import "./stanze.css";
import { Die, RollingDie } from "./Dice";
import { rulesSections } from "./rulesText";
import {
  type Ability,
  type ArrowState,
  DIR_ARROW,
  DIR_LABEL,
  type Dir,
  type PendingRequest,
  type PhoneItem,
  type PhoneEvent,
  type PhoneView,
  type ScreenView,
  playerColor,
} from "./types";

const roomName = (c: number) => `Stanza ${c + 1}`;

// ---------------------------------------------------------------- Schermo condiviso

/** Il complesso visto dall'alto: stanze numerate, avatar dei giocatori e, alla rivelazione, lettere e percorsi. */
export function StanzeScreen({ view, theme }: ViewProps) {
  const v = view as ScreenView;
  const sfx = useSfx(theme);
  const revealed = v.letters !== undefined;
  useEffect(() => {
    if (revealed) sfx("reveal");
  }, [revealed, sfx]);

  if (!v.mapShown) {
    return (
      <section className="ss-screen" aria-label="Il complesso">
        <h1>Stanze Segrete</h1>
        <p className="muted ss-status ss-dark">
          {v.phase === "setup" ? "Il complesso si sta preparando…" : "Il complesso è avvolto nel buio. Trovate l'uscita."}
        </p>
      </section>
    );
  }
  const rows = v.rows ?? 0;
  const cols = v.cols ?? 0;
  const players = v.players ?? [];
  const positions = v.positions ?? {};
  const cells = Array.from({ length: rows * cols }, (_, i) => i);
  const occupants = (c: number) => players.map((p, i) => ({ p, i })).filter(({ p }) => positions[p.id] === c);
  const pathIndex = (c: number) => (v.paths ?? []).flatMap((pa, wi) => (pa.cells.includes(c) ? [wi] : []));

  return (
    <section className="ss-screen" aria-label="Il complesso">
      <h1>Stanze Segrete</h1>
      <p className="muted ss-status">
        {v.phase === "setup" ? "Il complesso si sta preparando…" : v.phase === "play" ? "Trovate l'uscita." : revealed ? "Ecco il complesso." : ""}
      </p>
      <LayoutGroup>
        <div className="ss-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {cells.map((c) => {
            const onPaths = pathIndex(c);
            return (
              <div key={c} className={`ss-room ${revealed ? "lit" : ""} ${onPaths.map((w) => `path-${w}`).join(" ")}`} data-cell={c}>
                <span className="ss-num">{c + 1}</span>
                {revealed && <span className="ss-letter">{v.letters![c]}</span>}
                <div className="ss-people">
                  {occupants(c).map(({ p, i }) => (
                    <motion.span
                      key={p.id}
                      layoutId={`ss-av-${p.id}`}
                      className="ss-avatar"
                      style={{ background: playerColor(i) }}
                      title={p.nickname}
                      transition={{ type: "spring", stiffness: 220, damping: 22 }}
                    >
                      {p.nickname.slice(0, 1).toUpperCase()}
                    </motion.span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </LayoutGroup>
      {players.length > 0 && (
        <ul className="ss-legend">
          {players.map((p, i) => (
            <li key={p.id}>
              <span className="ss-avatar small" style={{ background: playerColor(i) }}>{p.nickname.slice(0, 1).toUpperCase()}</span> {p.nickname}
            </li>
          ))}
        </ul>
      )}
      {revealed && v.paths && (
        <ul className="ss-words">
          {v.paths.map((pa, i) => (
            <li key={pa.word} className={`word-${i}`}>
              <b>{pa.word}</b> <span className="muted">{pa.cells.map((c) => c + 1).join(" → ")}</span>
            </li>
          ))}
        </ul>
      )}
      {revealed && v.outcomes && (
        <ul className="ss-outcomes">
          {v.outcomes.map((o) => (
            <li key={o.id} className={o.outcome}>
              {o.nickname}: {o.outcome === "fuggito" ? "è fuggito 🚪" : o.outcome === "eliminato" ? "eliminato 💀" : "ancora dentro"}
              {o.solved && " · ha risolto 🔑"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Telefono

type Tab = "game" | "master" | "events" | "rules";

/** Piccola mappa con la propria posizione (e gli altri, se pubblici). Mai lettere. */
function MiniMap({ v }: { v: PhoneView }) {
  // La mappa non si conosce a priori: compare solo quando il GM la mostra.
  if (!v.mapShown || !v.rows || !v.cols) return null;
  const cells = Array.from({ length: v.rows * v.cols }, (_, i) => i);
  return (
    <div className="ss-mini" style={{ gridTemplateColumns: `repeat(${v.cols}, 1fr)` }} aria-label="Mappa">
      {cells.map((c) => (
        <div key={c} className={`ss-mini-room ${v.cell === c ? "me" : ""}`} data-cell={c}>
          <small>{c + 1}</small>
          {v.cell === c && <span className="ss-dot">●</span>}
          {(v.others ?? []).filter((o) => o.cell === c).map((o) => (
            <span key={o.id} className="ss-other" title={o.nickname}>{o.nickname.slice(0, 1).toUpperCase()}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Croce direzionale: frecce aperte, bloccate (🔒, non premibili) o nascoste ai bordi. */
function Compass({ title, state, kind, disabled, onPress }: { title: string; state: Record<Dir, ArrowState>; kind: "move" | "peek"; disabled: boolean; onPress: (d: Dir) => void }) {
  const cell = (d: Dir) => {
    const s = state[d];
    if (s === "wall") return <span className="ss-arrow wall" aria-hidden="true" />;
    return (
      <button
        className={`ss-arrow ${s}`}
        data-dir={d}
        data-state={s}
        aria-label={`${kind === "move" ? "Vai" : "Sbircia"} ${DIR_LABEL[d]}`}
        disabled={s === "blocked" || disabled}
        onClick={() => onPress(d)}
      >
        {s === "blocked" ? "🔒" : DIR_ARROW[d]}
      </button>
    );
  };
  return (
    <div className="ss-compass" data-kind={kind}>
      <h3>{title}</h3>
      <div className="ss-cross">
        <span />
        {cell("up")}
        <span />
        {cell("left")}
        <span className="ss-center">●</span>
        {cell("right")}
        <span />
        {cell("down")}
        <span />
      </div>
    </div>
  );
}

/** La lettera si vede solo tenendo premuto: il vicino non sbircia e uno scatto accidentale non la memorizza. */
function LetterBox({ s, clock, sightSec }: { s: NonNullable<PhoneView["sighting"]>; clock: ControllerProps["clock"]; sightSec: number }) {
  const [held, setHeld] = useState(false);
  const left = useRemaining(s.until, clock);
  if (left <= 0) return null;
  return (
    <div className="ss-letter-box">
      <button
        className="ss-hold"
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {held ? <span className="ss-letter-big" data-testid="letter">{s.letter}</span> : "Tieni premuto per vedere"}
      </button>
      <Countdown openedAt={s.until - sightSec * 1000} deadline={s.until} clock={clock} />
    </div>
  );
}

function abilityLabel(a: Ability): string {
  switch (a.action) {
    case "sight": return "👁 Guarda la lettera";
    case "guess": return "Proponi la soluzione";
    case "message": return "Scrivi al Master";
    case "move": return "Muoviti";
    case "peek": return "Sbircia";
    default: return a.label ?? a.action;
  }
}

function AbilityBadge({ a, clock }: { a: Ability; clock: ControllerProps["clock"] }) {
  const left = useRemaining(a.expiresAt ?? 0, clock);
  return (
    <span className="ss-badge">
      {a.usesLeft !== null && `${a.usesLeft} ${a.usesLeft === 1 ? "uso" : "usi"}`}
      {a.usesLeft !== null && a.expiresAt !== null && " · "}
      {a.expiresAt !== null && `${Math.ceil(left / 1000)} s`}
    </span>
  );
}

function PendingLine({ r, v, onCancel }: { r: PendingRequest; v: PhoneView; onCancel: () => void }) {
  void v;
  const what =
    r.kind === "move" ? `Hai chiesto di andare ${DIR_LABEL[r.direction!]}`
      : r.kind === "peek" ? `Hai chiesto di sbirciare ${DIR_LABEL[r.direction!]}`
        : r.kind === "guess" ? `Hai proposto «${r.word}»`
          : "Hai inviato la richiesta";
  return (
    <p className="ss-pending" role="status">
      {what}: in attesa del Master… <button onClick={onCancel}>Ritira</button>
    </p>
  );
}

function feedbackText(f: NonNullable<PhoneView["feedback"]>): string {
  switch (f.kind) {
    case "approved": return f.cell !== null ? `Il Master ti ha fatto entrare nella ${roomName(f.cell)}` : "Il Master ha approvato";
    case "refused": return "Il Master ha rifiutato";
    case "cancelled": return "Il Master ha annullato la richiesta";
    case "letter": return "Il Master ti mostra una lettera";
    case "solved": return "Il Master ha convalidato la tua soluzione!";
  }
}

function Feedback({ f, clock }: { f: NonNullable<PhoneView["feedback"]>; clock: ControllerProps["clock"] }) {
  const left = useRemaining(f.at + 8000, clock);
  if (left <= 0) return null;
  return <p className={`ss-feedback ${f.kind}`} role="status">{feedbackText(f)}</p>;
}

/** Gli oggetti della stanza: si sa che c'è qualcosa, ma non cosa, finché il Master non lo palesa. */
function Items({ items }: { items: PhoneItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="ss-items" aria-label="Oggetti nella stanza">
      {items.map((it) =>
        it.known ? (
          <li key={it.ref} className="ss-item known" data-known="true">
            <b><span aria-hidden="true">{it.icon}</span> {it.name}</b>
            {it.text && <p className="ss-item-text">{it.text}</p>}
          </li>
        ) : (
          <li key={it.ref} className="ss-item" data-known="false">
            <b><span aria-hidden="true">❔</span> Un oggetto</b>
            <small className="muted">C'è qualcosa qui, ma non sai cosa.</small>
          </li>
        ),
      )}
    </ul>
  );
}

/** Il dado tirato più di recente (animato se è nuovo) e, sotto, i risultati precedenti. */
function RollResult({ r, seen }: { r: NonNullable<PhoneView["dice"]>["rolled"][number]; seen: Set<number> }) {
  const [play] = useState(() => !seen.has(r.id));
  useEffect(() => {
    seen.add(r.id);
  }, [r.id, seen]);
  return (
    <div className="ss-dice" data-testid="dice-result">
      <RollingDie sides={r.sides} result={r.result} play={play} onLanded={() => navigator.vibrate?.(r.hidden ? 40 : [40, 40, 80])} />
      {r.label && <p className="ss-dice-label">{r.label}</p>}
      {r.hidden ? <p className="ss-dice-hidden">Il Master vede il risultato.</p> : <p className="ss-dice-result">d{r.sides}: <b>{r.result}</b></p>}
    </div>
  );
}

function DiceCards({ dice, send, seen }: { dice: NonNullable<PhoneView["dice"]>; send: ControllerProps["send"]; seen: Set<number> }) {
  const ask = dice.pending[0];
  const last = dice.rolled[dice.rolled.length - 1];
  const before = dice.rolled.slice(0, -1).reverse();
  return (
    <>
      {ask && (
        <div className="ss-dice ask dice-wait" role="group" aria-label="Dado da tirare" data-testid="dice-ask">
          <h3>🎲 Il Master ti fa tirare un dado{dice.pending.length > 1 ? ` (${dice.pending.length})` : ""}</h3>
          <Die sides={ask.sides} size={6.5} />
          {ask.label && <p className="ss-dice-label">{ask.label}</p>}
          <button className="primary ss-dice-roll" onClick={() => send({ type: "roll", rollId: ask.id })}>Lancia il d{ask.sides}</button>
        </div>
      )}
      {last && <RollResult key={last.id} r={last} seen={seen} />}
      {before.length > 0 && (
        <ul className="ss-dice-history" aria-label="Lanci precedenti">
          {before.map((r) => <li key={r.id}>d{r.sides}: {r.result ?? "?"}</li>)}
        </ul>
      )}
    </>
  );
}

function GuessForm({ onSend }: { onSend: (word: string) => void }) {
  const [word, setWord] = useState("");
  return (
    <form className="ss-form" onSubmit={(e) => { e.preventDefault(); if (word.trim()) { onSend(word); setWord(""); } }}>
      <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="La soluzione" maxLength={24} aria-label="Soluzione" />
      <button type="submit" className="primary">Proponi la soluzione</button>
    </form>
  );
}

function GameTab({ v, send, clock, seenDice }: { v: PhoneView; send: ControllerProps["send"]; clock: ControllerProps["clock"]; seenDice: Set<number> }) {
  const abilities = v.abilities ?? [];
  const pending = v.pending ?? [];
  const has = (a: string) => abilities.find((x) => x.action === a);
  const hasPending = (kind: "move" | "peek") => pending.some((r) => r.kind === kind);
  const customs = abilities.filter((a) => a.action.startsWith("custom:"));
  const seen = useRef(abilities.map((a) => a.id).join());

  // Vibrazione breve (Android) quando il Master accende o spegne una capacità.
  useEffect(() => {
    const now = abilities.map((a) => a.id).join();
    if (now !== seen.current) {
      seen.current = now;
      navigator.vibrate?.(60);
    }
  }, [abilities]);

  return (
    <div className="ss-game">
      <h2 className="ss-where">{v.cell === null || v.cell === undefined ? "Aspetta il Game Master" : `Sei nella ${roomName(v.cell)}`}</h2>
      {v.outcome === "fuggito" && <p className="ss-banner good">Sei fuggito! 🚪</p>}
      {v.outcome === "eliminato" && <p className="ss-banner bad">Sei stato eliminato 💀</p>}
      {v.solved && <p className="ss-banner good">Soluzione convalidata 🔑</p>}
      <MiniMap v={v} />
      {v.feedback && <Feedback f={v.feedback} clock={clock} />}
      {v.dice && <DiceCards dice={v.dice} send={send} seen={seenDice} />}
      <Items items={v.items ?? []} />
      {v.sighting && <LetterBox s={v.sighting} clock={clock} sightSec={v.rules?.sightSec ?? 8} />}
      {pending.map((r) => <PendingLine key={r.id} r={r} v={v} onCancel={() => send({ type: "cancel", requestId: r.id })} />)}

      {v.compass?.move && (
        <Compass title="Muoviti" kind="move" state={v.compass.move} disabled={hasPending("move")} onPress={(d) => send({ type: "move", direction: d })} />
      )}
      {v.compass?.peek && (
        <Compass title="Sbircia" kind="peek" state={v.compass.peek} disabled={hasPending("peek")} onPress={(d) => send({ type: "peek", direction: d })} />
      )}

      <div className="ss-actions">
        {has("sight") && (
          <button className="primary ss-action" disabled={!!v.sighting} onClick={() => send({ type: "sight" })}>
            {abilityLabel(has("sight")!)} <AbilityBadge a={has("sight")!} clock={clock} />
          </button>
        )}
        {customs.map((a) => (
          <button key={a.id} className="primary ss-action" onClick={() => send({ type: "custom", actionId: a.action.slice("custom:".length) })}>
            {abilityLabel(a)} <AbilityBadge a={a} clock={clock} />
          </button>
        ))}
        {has("guess") && <GuessForm onSend={(word) => send({ type: "guess", word })} />}
      </div>
      {abilities.length === 0 && pending.length === 0 && !v.sighting && !v.dice?.pending.length && !v.dice?.rolled.length && <p className="muted ss-wait">Aspetta il Game Master.</p>}
    </div>
  );
}

function MasterTab({ v, send, clock }: { v: PhoneView; send: ControllerProps["send"]; clock: ControllerProps["clock"] }) {
  const msgs = v.messages ?? [];
  const canWrite = (v.abilities ?? []).some((a) => a.action === "message");
  const [text, setText] = useState("");
  const [replies, setReplies] = useState<Record<number, string>>({});
  void clock;

  // Aprire la scheda segna come letti i messaggi del Master.
  useEffect(() => {
    for (const m of msgs) if (!m.mine && m.readAt === null) send({ type: "ack", messageId: m.id });
  }, [msgs, send]);

  return (
    <div className="ss-mail">
      <ul className="ss-thread">
        {msgs.length === 0 && <li className="muted">Nessun messaggio.</li>}
        {msgs.map((m) => (
          <li key={m.id} className={m.mine ? "mine" : "theirs"}>
            <small className="muted">{m.mine ? "Tu" : "Master"}</small>
            <p>{m.text}</p>
            {m.canReply && (
              <form
                className="ss-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = (replies[m.id] ?? "").trim();
                  if (t) {
                    send({ type: "reply", messageId: m.id, text: t });
                    setReplies({ ...replies, [m.id]: "" });
                  }
                }}
              >
                <input value={replies[m.id] ?? ""} onChange={(e) => setReplies({ ...replies, [m.id]: e.target.value })} placeholder="Rispondi" aria-label="Rispondi" maxLength={v.rules?.messageMaxLength ?? 280} />
                <button type="submit">Invia</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {canWrite ? (
        <form
          className="ss-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              send({ type: "message", text });
              setText("");
            }
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Scrivi al Master" aria-label="Scrivi al Master" maxLength={v.rules?.messageMaxLength ?? 280} />
          <button type="submit" className="primary">Invia</button>
        </form>
      ) : (
        <p className="muted">Puoi scrivere al Master quando ti abilita.</p>
      )}
    </div>
  );
}

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

function EventsTab({ events }: { events: PhoneEvent[] }) {
  return (
    <ul className="ss-history">
      {events.length === 0 && <li className="muted">Nessun evento ricevuto.</li>}
      {events.map((e) => (
        <li key={e.id} className={e.cancelled ? "cancelled" : ""}>
          <small className="muted">
            {hhmm(e.at)} · {e.cancelled ? "annullato" : e.acceptedAt ? `accettato alle ${hhmm(e.acceptedAt)}` : ""}
          </small>
          <p>{e.text}</p>
        </li>
      ))}
    </ul>
  );
}

function RulesTab({ v }: { v: PhoneView }) {
  if (!v.rules) return null;
  return (
    <div className="ss-rules">
      {rulesSections(v.rules).map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          {s.paragraphs.map((p) => <p key={p}>{p}</p>)}
        </section>
      ))}
    </div>
  );
}

/**
 * Le schede a tutto schermo escono dallo Stage (che nei temi con filtri o trasformazioni diventerebbe il loro
 * riquadro di riferimento) e si agganciano al contenitore del telefono, così coprono davvero tutto.
 */
function Overlay({ anchor, children }: { anchor: HTMLElement | null; children: ReactNode }) {
  const host = anchor?.closest("main") ?? null;
  return host ? createPortal(children, host) : null;
}

/** Evento da accettare: copre tutto il telefono finché non si preme «Accetta»; più eventi si mostrano in ordine. */
function EventCard({ events, send, vibrateKey }: { events: PhoneEvent[]; send: ControllerProps["send"]; vibrateKey: string }) {
  useEffect(() => {
    navigator.vibrate?.([200, 100, 200]);
  }, [vibrateKey]);
  const e = events[0]!;
  return (
    <div className="ss-event" role="alertdialog" aria-label="Evento" data-testid="event-card">
      {events.length > 1 && <small className="muted">1 di {events.length}</small>}
      <p className="ss-event-text"><b>Evento:</b> {e.text}</p>
      <button className="primary ss-accept" onClick={() => send({ type: "accept-event", eventId: e.id })}>Accetta</button>
    </div>
  );
}

/** Nell'anteprima (/preview?tab=events) si può aprire direttamente una scheda. */
function initialTab(): Tab {
  if (!window.location.pathname.startsWith("/preview")) return "game";
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "master" || t === "events" || t === "rules" ? t : "game";
}

export function StanzeController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const sfx = useSfx(theme);
  const [tab, setTab] = useState<Tab>(initialTab);
  const events = v.pendingEvents ?? [];
  const eventKey = events.map((e) => e.id).join();
  const unread = (v.messages ?? []).filter((m) => !m.mine && m.readAt === null).length;
  const prevUnread = useRef(0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Dadi già tirati all'apertura: non si rianimano (si animano solo i lanci nuovi, una volta sola).
  const seenDice = useRef<Set<number> | null>(null);
  if (seenDice.current === null) seenDice.current = new Set((v.dice?.rolled ?? []).map((r) => r.id));
  const askKey = (v.dice?.pending ?? []).map((r) => r.id).join();
  const prevAsk = useRef(askKey);

  useEffect(() => {
    if (events.length > 0) sfx("buzz");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventKey]);
  // Il Master chiede un dado: suono e vibrazione quando ne compare uno nuovo.
  useEffect(() => {
    const fresh = askKey.split(",").filter((id) => id && !prevAsk.current.split(",").includes(id));
    prevAsk.current = askKey;
    if (fresh.length === 0) return;
    sfx("notify");
    navigator.vibrate?.([100, 60, 100]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey]);
  useEffect(() => {
    if (unread > prevUnread.current) navigator.vibrate?.(120);
    prevUnread.current = unread;
  }, [unread]);

  if (!v.member) return <p className="muted">Guarda lo schermo.</p>;
  const showMail = unread > 0 && tab !== "master";

  return (
    <div className="ss-phone" ref={setAnchor}>
      <div className="ss-body">
        {tab === "game" && <GameTab v={v} send={send} clock={clock} seenDice={seenDice.current} />}
        {tab === "master" && <MasterTab v={v} send={send} clock={clock} />}
        {tab === "events" && <EventsTab events={v.history ?? []} />}
        {tab === "rules" && <RulesTab v={v} />}
      </div>
      {showMail && events.length === 0 && (
        <Overlay anchor={anchor}>
          <button className="ss-mail-alert" onClick={() => setTab("master")}>✉️ Nuovo messaggio dal Master: leggi</button>
        </Overlay>
      )}
      {askKey !== "" && tab !== "game" && events.length === 0 && (
        <Overlay anchor={anchor}>
          <button className={`ss-dice-alert ${showMail ? "second" : ""}`} onClick={() => setTab("game")}>🎲 Il Master ti fa tirare un dado: lancia</button>
        </Overlay>
      )}
      <nav className="ss-tabs" aria-label="Sezioni">
        <button className={tab === "game" ? "on" : ""} onClick={() => setTab("game")}>Gioco</button>
        <button className={tab === "master" ? "on" : ""} onClick={() => setTab("master")}>✉️ Master{unread > 0 && <b className="ss-count">{unread}</b>}</button>
        <button className={tab === "events" ? "on" : ""} onClick={() => setTab("events")}>📜 Eventi</button>
        <button className={tab === "rules" ? "on" : ""} onClick={() => setTab("rules")}>ℹ️ Regole</button>
      </nav>
      {events.length > 0 && (
        <Overlay anchor={anchor}>
          <EventCard events={events} send={send} vibrateKey={eventKey} />
        </Overlay>
      )}
    </div>
  );
}
