import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { ClockSync } from "@gioco/shared";
import { useSfx } from "../../audio/useAudio";
import { useServerInfo } from "../../screen/useServerInfo";
import { useRemaining } from "../Countdown";
import { clockText } from "../parole-mannare/tokens";
import type { ControllerProps, ViewProps } from "../types";
import { CardFace, Dynamite } from "./CardFace";
import { CHARACTER_LABEL, TEAM_LABEL, hostagesText, rulesSections } from "./rulesText";
import type { Known, Me, MovedPerson, Person, PhoneView, PublicView } from "./types";
import "./botto.css";

// Lo scanner (con la libreria di decodifica) si scarica solo quando si apre.
const QrScanner = lazy(() => import("../caccia-fantasmi/QrScanner"));

// ---- Pezzi comuni ----

function Timer({ v, clock }: { v: Pick<PublicView, "phaseEndsAt" | "pausedRemainingMs">; clock: ClockSync }) {
  const left = useRemaining(v.phaseEndsAt ?? 0, clock);
  if (v.pausedRemainingMs !== null) return <span className="scb-timer" data-paused="true" data-testid="scb-timer">⏸ {clockText(v.pausedRemainingMs)}</span>;
  if (v.phaseEndsAt === null) return null;
  return <span className="scb-timer" data-testid="scb-timer">⏱ {clockText(left)}</span>;
}

/** «Il round parte tra 5 s»: il conto alla rovescia verso la scadenza più vicina (in ora server). */
function StartCountdown({ v, clock }: { v: PublicView; clock: ClockSync }) {
  const left = useRemaining(v.phaseEndsAt ?? 0, clock);
  if (v.phaseEndsAt === null) return null;
  const next = v.round + 1 < v.roundCount;
  return (
    <p className="scb-start-count" data-testid="scb-start-count">
      {next ? "Il round parte" : "Si va alla rivelazione"} tra <b>{Math.ceil(left / 1000)} s</b>
    </p>
  );
}

const roundLabel = (v: PublicView) => `Round ${v.round + 1} di ${v.roundCount}`;
const nameOf = (v: PublicView, r: 0 | 1) => v.roomNames[r];

// ---- Schermo condiviso ----

function RoomColumn({ v, r, moved }: { v: PublicView; r: 0 | 1; moved: MovedPerson[] }) {
  const leader = v.leaders[r];
  const stale = !v.leadersFresh && v.round > 0 && v.phase !== "reveal" && v.phase !== "done";
  const arrived = new Set(moved.filter((m) => m.to === r).map((m) => m.id));
  const hidden = v.phase === "pairing" || v.phase === "deal" ? null : leader;
  return (
    <section className="scb-room" data-testid={`scb-room-${r}`} data-room={r}>
      <h2 className="scb-room-name">{nameOf(v, r)} <small>{v.rooms[r].length}</small></h2>
      {hidden && (
        <p className="scb-room-leader" data-testid={`scb-leader-${r}`} data-stale={stale}>
          ★ {hidden.nickname}
          {stale && <small> · Leader al round precedente</small>}
        </p>
      )}
      <ul className="scb-people" data-count={v.rooms[r].length}>
        {v.rooms[r].map((p) => (
          <li key={p.id} data-arrived={arrived.has(p.id)} data-leader={leader?.id === p.id}>
            {p.nickname}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScreenQr({ v }: { v: PublicView }) {
  const info = useServerInfo(5000);
  const base = (info?.tunnel.status === "ready" ? info.tunnel.url : null) ?? info?.lanUrl ?? window.location.origin;
  const codes = v.pairing?.codes;
  if (!codes) return null;
  return (
    <div className="scb-qrs">
      {([0, 1] as const).map((r) => (
        <figure key={r} className="scb-qr" data-testid={`scb-qr-${r}`}>
          <QRCodeSVG value={`${base}/play?stanza=${codes[r]}`} size={170} />
          <figcaption>{nameOf(v, r)}</figcaption>
          <code>{codes[r]}</code>
        </figure>
      ))}
    </div>
  );
}

function ExchangeBoard({ v }: { v: PublicView }) {
  if (!v.exchange) return null;
  return (
    <ul className="scb-exchange" data-testid="scb-exchange">
      {v.exchange.moved.map((m) => (
        <li key={m.id} data-from={m.from} data-to={m.to}>
          <b>{m.nickname}</b> <span>{nameOf(v, m.from)} → {nameOf(v, m.to)}</span>
        </li>
      ))}
    </ul>
  );
}

function RevealBoard({ v }: { v: PublicView }) {
  const cards = v.cards ?? [];
  const special = (c: (typeof cards)[number]) => c.card.character === "president" || c.card.character === "bomber";
  return (
    <>
      <div className="scb-boom" data-testid="scb-boom" data-boom={v.outcome?.sameRoom ? "yes" : "no"} aria-hidden="true">
        {v.outcome?.sameRoom ? <span className="scb-burst">BOOM!</span> : <Dynamite className="scb-dud" />}
      </div>
      <h2 className="question" data-testid="scb-outcome" data-winner={v.outcome?.winner}>
        {v.outcome?.winner === "red" ? "Vince la squadra ROSSA! 💥" : "Vince la squadra BLU! 🛡️"}
      </h2>
      <p className="big">{v.outcome?.reason}</p>
      {v.gamblerGuess && <p className="muted">Il Giocatore d'azzardo puntava sulla squadra {TEAM_LABEL[v.gamblerGuess]}</p>}
      <div className="scb-rooms scb-rooms-reveal">
        {([0, 1] as const).map((r) => (
          <section key={r} className="scb-room">
            <h2 className="scb-room-name">{nameOf(v, r)}</h2>
            <ul className="scb-people scb-cards">
              {cards.filter((c) => c.room === r).map((c) => (
                <li key={c.id} data-team={c.card.team} data-special={special(c)} data-character={c.card.character}>
                  <b>{c.nickname}</b> <small>{CHARACTER_LABEL[c.card.character]}</small>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

export function BottoScreen({ view, clock, theme }: ViewProps) {
  const v = view as PublicView;
  const sfx = useSfx(theme);
  const phase = v.phase;

  useEffect(() => {
    if (phase === "round") sfx("start", 0.5);
    if (phase === "lock" || phase === "hostages") sfx("buzz", 0.5);
    if (phase === "exchange") sfx("notify");
    if (phase === "reveal") sfx(v.outcome?.sameRoom ? "wrong" : "fanfare");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, v.round]);

  const moved = v.exchange?.moved ?? [];
  const rooms = (
    <div className="scb-rooms" data-phase={phase}>
      <RoomColumn v={v} r={0} moved={moved} />
      <RoomColumn v={v} r={1} moved={moved} />
    </div>
  );
  const warning = v.hostSeesCards && <p className="scb-warning" data-testid="scb-host-sees">⚠️ La regia vede le carte</p>;

  if (phase === "pairing") {
    return (
      <div className="scb-screen" data-phase={phase}>
        <h2 className="question">💣 Stanze col botto</h2>
        <p className="big">
          {v.pairing?.mode === "qr" ? "Scansiona il QR della stanza in cui vai" : v.pairing?.mode === "host" ? "La regia vi sta dividendo nelle stanze" : "Le stanze sono state sorteggiate"}
        </p>
        <ScreenQr v={v} />
        {rooms}
        {v.unassigned.length > 0 && <p className="muted" data-testid="scb-unassigned">Senza stanza: {v.unassigned.map((p) => p.nickname).join(", ")}</p>}
        {warning}
      </div>
    );
  }
  if (phase === "deal") {
    return (
      <div className="scb-screen" data-phase={phase}>
        <h2 className="question">Carte distribuite!</h2>
        <p className="big">Tieni premuto il pulsante sul telefono per vedere la tua carta, poi vai nella tua stanza</p>
        {rooms}
        {warning}
      </div>
    );
  }
  if (phase === "reveal" || phase === "done") {
    return (
      <div className="scb-screen" data-phase={phase}>
        <RevealBoard v={v} />
      </div>
    );
  }

  let banner;
  if (phase === "round") banner = <p className="muted">{hostagesText(v.hostagesNeeded)} da scambiare a fine round</p>;
  else if (phase === "lock") {
    const waiting = ([0, 1] as const).filter((r) => !v.locked[r] || !v.leaders[r]).map((r) => nameOf(v, r));
    banner = <p className="big" data-testid="scb-lock">Tempo scaduto! In attesa del leader di {waiting.join(" e ") || "…"}</p>;
  } else if (phase === "hostages") {
    banner = (
      <p className="big" data-testid="scb-hostages">
        I leader scelgono {hostagesText(v.hostagesNeeded)} ciascuno
        {([0, 1] as const).map((r) => (
          <span key={r} className="scb-flag" data-done={v.hostagesConfirmed[r]}>{nameOf(v, r)}: {v.hostagesConfirmed[r] ? "pronto ✓" : "sta scegliendo…"}</span>
        ))}
      </p>
    );
  } else if (phase === "exchange") {
    banner = (
      <>
        <h3>Scambio degli ostaggi</h3>
        <ExchangeBoard v={v} />
        <p className="muted" data-testid="scb-pressed">
          {([0, 1] as const).map((r) => `${nameOf(v, r)}: ${v.startPressed[r] ? "leader pronto ✓" : "leader non ancora pronto"}`).join(" · ")}
        </p>
        <StartCountdown v={v} clock={clock} />
      </>
    );
  } else if (phase === "gamble") banner = <p className="big">Il Giocatore d'azzardo sceglie chi vincerà…</p>;

  return (
    <div className="scb-screen" data-phase={phase}>
      <div className="scb-topbar">
        <h2 className="question">{roundLabel(v)}</h2>
        <Timer v={v} clock={clock} />
      </div>
      {banner}
      {rooms}
      {phase === "round" && v.exchange && <p className="muted">Ultimo scambio: {v.exchange.moved.map((m) => m.nickname).join(", ")}</p>}
      {warning}
    </div>
  );
}

// ---- Telefono ----

/** Tenendo premuto si vede la carta: il vicino non sbircia e uno scatto accidentale non resta a schermo. */
function HoldCard({ me }: { me: Me }) {
  const [held, setHeld] = useState(false);
  if (!me.card) return null;
  return (
    <button
      className="scb-hold"
      data-testid="scb-hold"
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {held ? (
        <span className="scb-secret" data-testid="scb-secret" data-team={me.card.team}>
          <CardFace card={me.card} />
        </span>
      ) : (
        "👁 Tieni premuto: la tua carta"
      )}
    </button>
  );
}

/** Legge (una volta) il codice della stanza dal link del QR e lo toglie dall'indirizzo. */
function takeRoomParam(): string | null {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("stanza");
    if (!code) return null;
    url.searchParams.delete("stanza");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    return code;
  } catch {
    return null;
  }
}

function PairingPanel({ v, me, send }: { v: PhoneView; me: Me; send: ControllerProps["send"] }) {
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const mode = v.pairing?.mode ?? "random";
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const fromLink = takeRoomParam();
    if (fromLink) send({ type: "join-room", code: fromLink });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scb-pairing" data-testid="scb-pairing">
      {me.room !== null ? (
        <p className="big" data-testid="scb-joined">Sei nella stanza <b>{nameOf(v, me.room)}</b></p>
      ) : mode === "qr" ? (
        <p className="big">Scansiona il QR della stanza in cui vai</p>
      ) : (
        <p className="big">La regia ti sta assegnando una stanza…</p>
      )}
      {me.joinRefused !== null && <p className="error" role="alert" data-testid="scb-full">{nameOf(v, me.joinRefused)} è piena: scegli l'altra stanza.</p>}
      {mode === "qr" && (
        <>
          <button className="primary" data-testid="scb-scan" onClick={() => setScanning(true)}>📷 Scansiona il QR</button>
          <div className="row">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Codice della stanza" aria-label="Codice della stanza" maxLength={8} />
            <button disabled={code.trim().length < 4} onClick={() => { send({ type: "join-room", code }); setCode(""); }}>Entra</button>
          </div>
          <p className="muted">Puoi cambiare stanza scansionando l'altro QR, finché la regia non distribuisce le carte.</p>
          {scanning && (
            <Suspense fallback={<p>Caricamento…</p>}>
              <QrScanner param="stanza" what="della stanza" onCode={(c) => { setScanning(false); send({ type: "join-room", code: c }); }} onClose={() => setScanning(false)} />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}

function RulesDialog({ v, me, onClose }: { v: PhoneView; me: Me; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Regole del gioco">
      <div className="gf-rules-body">
        <h2>Come si gioca</h2>
        {rulesSections(me.card, v.rules).map((s) => (
          <section key={s.title} className={s.title === "Per te" ? "gf-rules-mine" : undefined}>
            <h3>{s.title}</h3>
            {s.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        ))}
      </div>
      <button className="primary gf-rules-close" onClick={onClose}>Ho capito</button>
    </div>
  );
}

/** Le carte che ti sono state mostrate: stanno dietro un pulsante, così girando il telefono non si svelano. */
function KnownDialog({ known, onClose }: { known: Known[]; onClose: () => void }) {
  return (
    <div className="gf-rules" role="dialog" aria-modal="true" aria-label="Carte viste">
      <div className="gf-rules-body">
        <h2>Carte viste</h2>
        {known.length === 0 && <p className="muted">Nessuno ti ha ancora mostrato la carta.</p>}
        <ul className="scb-known" data-testid="scb-known">
          {known.map((k) => (
            <li key={k.playerId} data-team={k.card.team} data-level={k.level}>
              <b>{k.nickname}</b>
              <CardFace card={k.card} colorOnly={k.level === "color"} />
            </li>
          ))}
        </ul>
      </div>
      <button className="primary gf-rules-close" onClick={onClose}>Chiudi</button>
    </div>
  );
}

/** Una carta appena mostrata a te: a tutto schermo per qualche secondo. */
function useFlash(known: Known[]): [Known | null, () => void] {
  const seen = useRef<number | null>(null);
  const [flash, setFlash] = useState<Known | null>(null);
  useEffect(() => {
    const max = known.reduce((m, k) => Math.max(m, k.seq), 0);
    if (seen.current === null) {
      seen.current = max;
      return;
    }
    const fresh = known.filter((k) => k.seq > seen.current!).sort((a, b) => b.seq - a.seq)[0];
    seen.current = Math.max(seen.current, max);
    if (fresh) setFlash(fresh);
  }, [known]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);
  return [flash, () => setFlash(null)];
}

type SheetAction = { id: string; label: string; primary?: boolean; run: () => void; disabled?: boolean };

function Sheet({ person, actions, onClose }: { person: Person; actions: SheetAction[]; onClose: () => void }) {
  return (
    <div className="scb-sheet" role="dialog" aria-label={`Azioni su ${person.nickname}`} data-testid="scb-sheet">
      <h3>{person.nickname}</h3>
      <div className="scb-sheet-actions">
        {actions.map((a) => (
          <button key={a.id} className={a.primary ? "primary" : ""} disabled={a.disabled} data-testid={`scb-action-${a.id}`} onClick={() => { a.run(); onClose(); }}>
            {a.label}
          </button>
        ))}
      </div>
      <button onClick={onClose}>Annulla</button>
    </div>
  );
}

function RoomPeople({ v, me, send }: { v: PhoneView; me: Me; send: ControllerProps["send"] }) {
  const [target, setTarget] = useState<Person | null>(null);
  const roommates = me.room === null ? [] : v.rooms[me.room].filter((p) => p.id !== me.id);
  const picks = me.hostagePicks ?? [];
  const votes = me.votes ?? {};
  const needed = v.hostagesNeeded;

  const actions = (p: Person): SheetAction[] => {
    const list: SheetAction[] = [];
    if (me.canVote) {
      list.push(
        me.myVote === p.id
          ? { id: "unvote", label: "Ritira il voto", run: () => send({ type: "vote-leader", targetId: null }) }
          : { id: "vote", label: "Vota come leader", primary: true, run: () => send({ type: "vote-leader", targetId: p.id }) },
      );
    }
    if (me.canAppoint) list.push({ id: "appoint", label: "Nomina leader", run: () => send({ type: "appoint", targetId: p.id }) });
    if (me.canShare) {
      list.push({ id: "reveal-card", label: "Mostra la carta", primary: true, run: () => send({ type: "reveal", kind: "card", targetId: p.id }) });
      if (me.colorAllowed) list.push({ id: "reveal-color", label: "Mostra il colore", run: () => send({ type: "reveal", kind: "color", targetId: p.id }) });
      list.push({ id: "share-card", label: "Scambia la carta", run: () => send({ type: "share-offer", kind: "card", targetId: p.id }), disabled: !!me.outgoing });
      if (me.colorAllowed) list.push({ id: "share-color", label: "Scambia il colore", run: () => send({ type: "share-offer", kind: "color", targetId: p.id }), disabled: !!me.outgoing });
    }
    if (me.canAbdicate && me.isLeader) list.push({ id: "abdicate", label: "Passa la leadership", run: () => send({ type: "abdicate", targetId: p.id }) });
    if (me.canPickHostages) {
      const on = picks.includes(p.id);
      list.push({
        id: "hostage",
        label: on ? "Togli dagli ostaggi" : "Scegli come ostaggio",
        disabled: !on && picks.length >= needed,
        run: () => send({ type: "pick-hostages", playerIds: on ? picks.filter((x) => x !== p.id) : [...picks, p.id] }),
      });
    }
    return list;
  };

  return (
    <>
      <ul className="scb-names" data-testid="scb-names" data-count={roommates.length}>
        {roommates.map((p) => (
          <li key={p.id}>
            <button
              className="scb-name"
              data-testid={`scb-player-${p.id}`}
              data-leader={me.leader?.id === p.id}
              data-voted={me.myVote === p.id}
              data-hostage={picks.includes(p.id)}
              onClick={() => setTarget(p)}
            >
              <span>{p.nickname}</span>
              <small>
                {me.leader?.id === p.id && "★ "}
                {(votes[p.id] ?? 0) > 0 && `✋${votes[p.id]} `}
                {picks.includes(p.id) && "🎯"}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {target && <Sheet person={target} actions={actions(target)} onClose={() => setTarget(null)} />}
    </>
  );
}

function ShowAll({ me, send }: { me: Me; send: ControllerProps["send"] }) {
  if (!me.canShare) return null;
  return (
    <div className="scb-showall row">
      <button data-testid="scb-show-all-card" onClick={() => send({ type: "reveal", kind: "card", targetId: null })}>📢 Mostra la carta a tutti</button>
      {me.colorAllowed && <button data-testid="scb-show-all-color" onClick={() => send({ type: "reveal", kind: "color", targetId: null })}>🎨 Il colore a tutti</button>}
    </div>
  );
}

function HostagePanel({ v, me, send }: { v: PhoneView; me: Me; send: ControllerProps["send"] }) {
  const picks = me.hostagePicks ?? [];
  const names = picks.map((id) => v.rooms.flat().find((p) => p.id === id)?.nickname ?? "?");
  return (
    <div className="scb-hostage-bar" data-testid="scb-hostage-bar">
      <b>Ostaggi ({picks.length}/{v.hostagesNeeded})</b>
      <span>{names.join(", ") || "tocca un nome per sceglierli"}</span>
      {v.phase === "hostages" && (
        <button className="primary" data-testid="scb-confirm" disabled={!me.canConfirmHostages} onClick={() => send({ type: "confirm-hostages" })}>
          {me.hostagesConfirmed ? "Confermati ✓" : "Conferma gli ostaggi"}
        </button>
      )}
    </div>
  );
}

function Offers({ me, send }: { me: Me; send: ControllerProps["send"] }) {
  const offer = me.incoming?.[0];
  if (offer) {
    return (
      <div className="scb-overlay" role="dialog" aria-label="Proposta di scambio" data-testid="scb-offer">
        <p className="big"><b>{offer.from.nickname}</b> vuole scambiare {offer.kind === "card" ? "la carta" : "il colore"} con te</p>
        <div className="row">
          <button className="primary" data-testid="scb-offer-accept" onClick={() => send({ type: "share-answer", seq: offer.seq, accept: true })}>Accetta</button>
          <button data-testid="scb-offer-decline" onClick={() => send({ type: "share-answer", seq: offer.seq, accept: false })}>Rifiuta</button>
        </div>
      </div>
    );
  }
  if (me.abdicationFrom) {
    return (
      <div className="scb-overlay" role="dialog" aria-label="Passaggio di leadership" data-testid="scb-abdication">
        <p className="big"><b>{me.abdicationFrom.nickname}</b> ti passa la leadership</p>
        <div className="row">
          <button className="primary" data-testid="scb-abdicate-accept" onClick={() => send({ type: "abdicate-answer", accept: true })}>Accetto</button>
          <button onClick={() => send({ type: "abdicate-answer", accept: false })}>Rifiuto</button>
        </div>
      </div>
    );
  }
  return null;
}

export function BottoController({ view, send, clock, theme }: ControllerProps) {
  const v = view as PhoneView;
  const me = v.me;
  const sfx = useSfx(theme);
  const [rules, setRules] = useState(false);
  const [showKnown, setShowKnown] = useState(false);
  const [flash, closeFlash] = useFlash(me?.known ?? []);
  const phase = v.phase;
  const offerKey = me?.incoming?.[0]?.seq ?? (me?.abdicationFrom ? -1 : null);

  useEffect(() => {
    if (phase === "round") sfx("start", 0.5);
    if (phase === "lock") sfx("buzz");
    if (phase === "exchange") sfx("notify");
    if (phase === "reveal") sfx("fanfare");
  }, [phase, v.round, sfx]);
  useEffect(() => {
    if (offerKey !== null) {
      sfx("mail");
      try {
        navigator.vibrate?.(150);
      } catch {
        /* non su iOS Safari */
      }
    }
  }, [offerKey, sfx]);
  useEffect(() => {
    if (flash) sfx("reveal", 0.5);
  }, [flash, sfx]);

  if (!me) return <p className="big">Non sei in questa partita.</p>;

  const room = me.room;
  const roomName = room === null ? null : nameOf(v, room);
  const iAmLeader = !!me.isLeader;

  let body;
  if (phase === "pairing") {
    body = <PairingPanel v={v} me={me} send={send} />;
  } else if (phase === "deal") {
    body = (
      <div className="scb-go" data-testid="scb-go">
        <p className="muted">Vai in</p>
        <h2 className="scb-go-room" data-room={room}>{roomName}</h2>
        <p className="muted">Tieni premuto il pulsante per vedere la tua carta. Il round parte a breve.</p>
      </div>
    );
  } else if (phase === "round" || phase === "lock") {
    body = (
      <>
        <p className="scb-leader-line" data-testid="scb-leader-line">
          {me.leader ? <>Leader: <b>{iAmLeader ? "tu" : me.leader.nickname}</b>{me.leaderLocked && " 🔒"}</> : "Nessun leader: votate o nominatene uno"}
          {me.abdicateTo && <small> · passi la carica a {me.abdicateTo.nickname}…</small>}
        </p>
        {phase === "lock" && <p className="scb-lock-note" data-testid="scb-lock-note">Tempo scaduto!{me.canAppoint ? " Eleggete il leader: tra poco lo estrae il sistema." : " Attendi l'altra stanza."}</p>}
        <RoomPeople v={v} me={me} send={send} />
        <ShowAll me={me} send={send} />
        {iAmLeader && <HostagePanel v={v} me={me} send={send} />}
        {!iAmLeader && (me.hostagePicks?.length ?? 0) > 0 && (
          <p className="muted" data-testid="scb-hostage-seen">Ostaggi in preparazione: {(me.hostagePicks ?? []).map((id) => v.rooms.flat().find((p) => p.id === id)?.nickname ?? "?").join(", ")}</p>
        )}
        {me.outgoing && <p className="muted" data-testid="scb-outgoing">Aspetto la risposta di {me.outgoing.to.nickname}…</p>}
      </>
    );
  } else if (phase === "hostages") {
    body = (
      <>
        <p className="big" data-testid="scb-hostage-title">Scelta degli ostaggi</p>
        <p className="muted" data-testid="scb-leaders-pub">
          Leader: {([0, 1] as const).map((r) => `${nameOf(v, r)}: ${v.leaders[r]?.nickname ?? "?"}`).join(" · ")}
        </p>
        {iAmLeader ? (
          <>
            <RoomPeople v={v} me={me} send={send} />
            <HostagePanel v={v} me={me} send={send} />
          </>
        ) : (
          <>
            <p className="muted">Il leader sceglie {hostagesText(v.hostagesNeeded)} da mandare nell'altra stanza.</p>
            {(me.hostagePicks?.length ?? 0) > 0 && <p data-testid="scb-hostage-seen">Ostaggi: {(me.hostagePicks ?? []).map((id) => v.rooms.flat().find((p) => p.id === id)?.nickname ?? "?").join(", ")}</p>}
          </>
        )}
      </>
    );
  } else if (phase === "exchange") {
    body = (
      <>
        {me.travel ? (
          <div className="scb-travel" role="alert" data-testid="scb-travel">
            <p className="muted">Sei un ostaggio</p>
            <h2 className="scb-go-room" data-room={me.travel.to}>Vai in {nameOf(v, me.travel.to)}</h2>
          </div>
        ) : (
          <p className="big" data-testid="scb-stay">Scambio fatto. Tu resti in <b>{roomName}</b></p>
        )}
        {iAmLeader && (
          <button className="primary scb-start" data-testid="scb-start" disabled={!me.canStart} onClick={() => send({ type: "start-round" })}>
            {me.canStart ? "Avvia il round" : "Pronto ✓"}
          </button>
        )}
        <StartCountdown v={v} clock={clock} />
      </>
    );
  } else if (phase === "gamble") {
    body = me.canGamble ? (
      <div className="scb-gamble" data-testid="scb-gamble">
        <h3>Chi vincerà?</h3>
        <div className="row">
          <button className="primary" data-team="blue" data-testid="scb-gamble-blue" onClick={() => send({ type: "gamble", team: "blue" })}>Squadra Blu</button>
          <button className="primary" data-team="red" data-testid="scb-gamble-red" onClick={() => send({ type: "gamble", team: "red" })}>Squadra Rossa</button>
        </div>
      </div>
    ) : (
      <p className="big">Il Giocatore d'azzardo sceglie chi vincerà…</p>
    );
  } else {
    const mine = me.card?.team;
    const won = v.outcome && (mine === v.outcome.winner || (me.card?.character === "gambler" && me.myGuess === v.outcome.winner));
    body = (
      <div className="scb-end" data-testid="scb-end">
        <h2 data-winner={v.outcome?.winner}>{v.outcome?.winner === "red" ? "Vince la ROSSA 💥" : "Vince la BLU 🛡️"}</h2>
        <p className="big">{won ? "Hai vinto! 🎉" : "Questa volta no."}</p>
        <p className="muted">{v.outcome?.reason}</p>
      </div>
    );
  }

  const inPlay = phase === "round" || phase === "lock" || phase === "hostages" || phase === "exchange";
  return (
    <div className="scb-ctrl" data-phase={phase} data-room={room ?? undefined} data-leader={iAmLeader}>
      <div className="scb-head">
        <div className="scb-where">
          {roomName && <b className="scb-room-badge" data-testid="scb-room-name" data-room={room}>{roomName}</b>}
          {inPlay && <small>{roundLabel(v)}</small>}
        </div>
        <Timer v={v} clock={clock} />
        <button className="gf-info" data-testid="scb-rules" onClick={() => setRules(true)} aria-label="Regole">ℹ️</button>
      </div>
      <HoldCard me={me} />
      {body}
      {me.card && (
        <button className="scb-known-btn" data-testid="scb-known-open" onClick={() => setShowKnown(true)}>
          Carte viste ({me.known?.length ?? 0})
        </button>
      )}
      {!flash && <Offers me={me} send={send} />}
      {flash && (
        <button className="scb-overlay scb-flash" data-testid="scb-flash" onClick={closeFlash} aria-label="Carta mostrata">
          <p className="big"><b>{flash.nickname}</b> ti mostra {flash.level === "card" ? "la carta" : "il colore"}</p>
          <CardFace card={flash.card} colorOnly={flash.level === "color"} />
          <small className="muted">Tocca per chiudere</small>
        </button>
      )}
      {rules && <RulesDialog v={v} me={me} onClose={() => setRules(false)} />}
      {showKnown && <KnownDialog known={me.known ?? []} onClose={() => setShowKnown(false)} />}
    </div>
  );
}
