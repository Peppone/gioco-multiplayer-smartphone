import { useEffect, useRef, useState } from "react";
import type { ControllerProps } from "../types";
import { LAMP_IDS, LAMP_NAME, MODULE_TITLE, colorVars } from "./parts";
import { SymbolIcon } from "./symbols";
import type { Control } from "./types";

type Send = ControllerProps["send"];

function WiresControl({ c, send }: { c: Extract<Control, { kind: "wires" }>; send: Send }) {
  return (
    <div className="art-wire-buttons" data-testid="art-wire-buttons">
      {Array.from({ length: c.wires }, (_, i) => (
        <button key={i} data-testid="art-cut" data-cut={c.cut.includes(i) || undefined} disabled={c.solved || c.cut.includes(i)} onClick={() => send({ type: "cut", module: c.id, wire: i })}>
          <b>{i + 1}</b> ✂ Taglia il filo {i + 1}
        </button>
      ))}
    </div>
  );
}

/**
 * Due tasti: «Premi e rilascia» (un tocco) e «Tieni premuto». Il secondo avvisa il server alla pressione e al
 * sollevamento del dito: il rilascio si giudica all'istante in cui il dito si alza (ora equa), non all'arrivo.
 * `touch-action: none` e il puntatore catturato evitano scorrimenti e rilasci spuri se il dito scivola fuori.
 */
function ButtonControl({ c, send }: { c: Extract<Control, { kind: "button" }>; send: Send }) {
  const down = useRef(false);
  useEffect(() => {
    // se il turno finisce mentre si tiene premuto, non resta nulla di sospeso
    if (c.solved) down.current = false;
  }, [c.solved]);
  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (c.solved || down.current) return;
    down.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // puntatore non catturabile (evento sintetico): il rilascio arriva comunque da pointerup/pointercancel
    }
    send({ type: "hold", module: c.id });
  };
  const lift = () => {
    if (!down.current) return;
    down.current = false;
    send({ type: "release", module: c.id });
  };
  return (
    <div className="art-button-controls">
      <button className="art-tap" data-testid="art-tap" disabled={c.solved || c.holding} onClick={() => send({ type: "tap", module: c.id })}>
        Premi e rilascia
      </button>
      <button
        className="art-hold"
        data-testid="art-hold"
        data-holding={c.holding || undefined}
        disabled={c.solved}
        onPointerDown={press}
        onPointerUp={lift}
        onPointerCancel={lift}
        onContextMenu={(e) => e.preventDefault()}
      >
        {c.holding ? "Rilascia al momento giusto!" : "Tieni premuto"}
      </button>
    </div>
  );
}

function SymbolsControl({ c, send }: { c: Extract<Control, { kind: "symbols" }>; send: Send }) {
  return (
    <div className="art-symbol-keys" data-testid="art-symbol-keys" data-count={c.symbols.length}>
      {c.symbols.map((id, i) => (
        <button key={id} data-testid="art-key" data-pressed={c.pressed.includes(i) || undefined} disabled={c.solved || c.pressed.includes(i)} aria-label={id} onClick={() => send({ type: "press", module: c.id, key: i })}>
          <SymbolIcon id={id} />
        </button>
      ))}
    </div>
  );
}

/** Quattro tasti colorati (con il nome del colore, anche per chi non li distingue bene). */
function ColorsControl({ c, send }: { c: Extract<Control, { kind: "colors" }>; send: Send }) {
  return (
    <div className="art-lamp-keys" data-testid="art-lamp-keys">
      {LAMP_IDS.map((id, i) => (
        <button key={id} style={colorVars(id)} data-testid="art-lamp-key" data-lamp={id} disabled={c.solved} onClick={() => send({ type: "press", module: c.id, key: i })}>
          {LAMP_NAME[id]}
        </button>
      ))}
    </div>
  );
}

const ARROWS = [
  { dir: "up", icon: "↑", label: "Su", area: "up" },
  { dir: "left", icon: "←", label: "Sinistra", area: "left" },
  { dir: "right", icon: "→", label: "Destra", area: "right" },
  { dir: "down", icon: "↓", label: "Giù", area: "down" },
] as const;

function MazeControl({ c, send }: { c: Extract<Control, { kind: "maze" }>; send: Send }) {
  return (
    <div className="art-dpad" data-testid="art-dpad">
      {ARROWS.map((a) => (
        <button key={a.dir} style={{ gridArea: a.area }} data-testid={`art-move-${a.dir}`} aria-label={a.label} disabled={c.solved} onClick={() => send({ type: "move", module: c.id, dir: a.dir })}>
          {a.icon}
        </button>
      ))}
    </div>
  );
}

/** Cinque rotelle: `‹` e `›` per ognuna (la lettera la vede solo chi guarda la TV) e «Invia». */
function WordControl({ c, send }: { c: Extract<Control, { kind: "word" }>; send: Send }) {
  return (
    <div className="art-word-keys" data-testid="art-word-keys">
      <div className="art-spin-row">
        {[0, 1, 2, 3, 4].map((w) => (
          <button key={w} data-testid="art-spin-back" aria-label={`Rotella ${w + 1} indietro`} disabled={c.solved} onClick={() => send({ type: "spin", module: c.id, wheel: w, delta: -1 })}>
            ‹
          </button>
        ))}
      </div>
      <div className="art-spin-row art-spin-n" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="art-spin-row">
        {[0, 1, 2, 3, 4].map((w) => (
          <button key={w} data-testid="art-spin-next" aria-label={`Rotella ${w + 1} avanti`} disabled={c.solved} onClick={() => send({ type: "spin", module: c.id, wheel: w, delta: 1 })}>
            ›
          </button>
        ))}
      </div>
      <button className="primary art-submit" data-testid="art-submit" disabled={c.solved} onClick={() => send({ type: "submit", module: c.id })}>
        Invia
      </button>
    </div>
  );
}

/** I comandi dell'artificiere: una scheda per modulo (✔ se disinnescato) e i tasti del modulo scelto, a tutta larghezza. */
export function DefuserControls({ controls, selected, send }: { controls: Control[]; selected: number | null | undefined; send: Send }) {
  const firstOpen = controls.find((c) => !c.solved)?.id ?? 0;
  const [sel, setSel] = useState<number>(selected ?? firstOpen);
  const c = controls.find((x) => x.id === sel) ?? controls[0];
  if (!c) return null;
  const choose = (id: number) => {
    setSel(id);
    send({ type: "select", module: id });
  };
  return (
    <div className="art-controls" data-testid="art-controls">
      <div className="art-tabs" role="tablist" aria-label="Moduli">
        {controls.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === c.id} data-testid="art-module-tab" data-solved={x.solved || undefined} className={x.id === c.id ? "primary" : ""} onClick={() => choose(x.id)}>
            {x.id + 1}
            {x.solved ? " ✔" : ""}
          </button>
        ))}
      </div>
      <p className="art-controls-title muted">
        Modulo {c.id + 1}: {MODULE_TITLE[c.kind]}
        {c.solved ? " · disinnescato" : ""}
      </p>
      {c.kind === "wires" && <WiresControl c={c} send={send} />}
      {c.kind === "button" && <ButtonControl c={c} send={send} />}
      {c.kind === "symbols" && <SymbolsControl c={c} send={send} />}
      {c.kind === "colors" && <ColorsControl c={c} send={send} />}
      {c.kind === "maze" && <MazeControl c={c} send={send} />}
      {c.kind === "word" && <WordControl c={c} send={send} />}
    </div>
  );
}
