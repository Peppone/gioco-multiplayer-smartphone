import { type CSSProperties, useEffect, useState } from "react";
import { MazeDrawing } from "./MazeDrawing";
import type { ClockSync } from "@gioco/shared";
import { clockText } from "../parole-mannare/tokens";
import { SymbolIcon } from "./symbols";
import type { ButtonColor, Edgework, Status, StripColor, TvModule, WireColor } from "./types";

export const COLOR_NAME: Record<WireColor | ButtonColor | StripColor, string> = { red: "rosso", blue: "blu", yellow: "giallo", black: "nero", white: "bianco", green: "verde" };
export const MODULE_TITLE = { wires: "Fili", button: "Pulsante", symbols: "Simboli", colors: "Colori", maze: "Labirinto", word: "Parola" } as const;
/** I quattro colori del modulo «Colori», nell'ordine del server (`LAMPS`). */
export const LAMP_IDS = ["red", "blue", "green", "yellow"] as const;
export const LAMP_NAME = { red: "rosso", blue: "blu", green: "verde", yellow: "giallo" } as const;

/** Colore di un oggetto del gioco (filo, pulsante, striscia) come variabile CSS; il testo sopra usa `--ink`. */
export const colorVars = (color: string): CSSProperties => ({ "--c": `var(--art-${color})`, "--ink": `var(--art-ink-${color})` }) as CSSProperties;

// ---- Tempo della bomba ----

/** Tempo «finto» rimasto (ms): scorre a `speed` volte il reale da `clock.at` (ora server), e si ferma in pausa. */
export function bombMs(status: Status, clock: ClockSync): number {
  if (status.pausedRemainingMs !== null) return status.pausedRemainingMs;
  return Math.max(0, status.clock.remainingMs - Math.max(0, clock.toServerTime(Date.now()) - status.clock.at) * status.speed);
}

export function useBombMs(status: Status | null, clock: ClockSync): number {
  const calc = () => (status ? bombMs(status, clock) : 0);
  const [ms, setMs] = useState(calc);
  useEffect(() => {
    setMs(calc());
    // a ogni errore con accelerazione `clock` e `speed` cambiano: l'effetto riparte da lì
    const id = setInterval(() => setMs(calc()), 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.clock.at, status?.clock.remainingMs, status?.speed, status?.pausedRemainingMs, clock]);
  return ms;
}

/** Il timer della bomba (m:ss): lampeggia sotto i 30 secondi, e dopo gli errori scorre più veloce. */
export function BombTimer({ status, clock }: { status: Status; clock: ClockSync }) {
  const ms = useBombMs(status, clock);
  const finished = status.outcome !== null;
  const shown = finished ? status.outcome!.remainingMs : ms;
  return (
    <span className="art-timer" data-testid="art-timer" data-paused={status.pausedRemainingMs !== null || undefined} data-urgent={(!finished && shown < 30_000) || undefined} data-fast={status.speed > 1 || undefined}>
      {status.pausedRemainingMs !== null ? "⏸ " : "⏱ "}
      {clockText(shown)}
      {status.speed > 1 && !finished && <small> ×{status.speed.toFixed(2).replace(/\.?0+$/, "")}</small>}
    </span>
  );
}

export function Strikes({ status }: { status: Pick<Status, "strikes" | "maxStrikes"> }) {
  return (
    <span className="art-strikes" data-testid="art-strikes" role="img" aria-label={`Errori: ${status.strikes} su ${status.maxStrikes}`}>
      {Array.from({ length: status.maxStrikes }, (_, i) => (
        <b key={i} data-on={i < status.strikes || undefined}>
          ✖
        </b>
      ))}
    </span>
  );
}

// ---- Moduli sulla TV ----

function WiresSvg({ wires, cut }: { wires: WireColor[]; cut: number[] }) {
  const n = wires.length;
  const y = (i: number) => (n === 1 ? 50 : 14 + (i * 72) / (n - 1));
  return (
    <svg className="art-svg" viewBox="0 0 160 100" role="img" aria-label={`${n} fili`} data-testid="art-wires">
      {wires.map((color, i) => {
        const cy = y(i);
        const isCut = cut.includes(i);
        const path = (a: number, b: number) => `M${a} ${cy} C ${a + (b - a) * 0.3} ${cy + 5}, ${a + (b - a) * 0.7} ${cy - 5}, ${b} ${cy}`;
        return (
          <g key={i} style={colorVars(color)} data-wire={i} data-color={color} data-cut={isCut || undefined}>
            <text x="6" y={cy + 3} className="art-svg-n">
              {i + 1}
            </text>
            {isCut ? (
              <>
                <path d={path(24, 70)} className="art-wire-edge" />
                <path d={path(24, 70)} className="art-wire" />
                <path d={path(90, 148)} className="art-wire-edge" />
                <path d={path(90, 148)} className="art-wire" />
              </>
            ) : (
              <>
                <path d={path(24, 148)} className="art-wire-edge" />
                <path d={path(24, 148)} className="art-wire" />
              </>
            )}
            <circle cx="24" cy={cy} r="3.5" className="art-pin" />
            <circle cx="148" cy={cy} r="3.5" className="art-pin" />
          </g>
        );
      })}
    </svg>
  );
}

function ButtonSvg({ color, label, strip, holding }: { color: ButtonColor; label: string; strip?: StripColor; holding: boolean }) {
  return (
    <svg className="art-svg" viewBox="0 0 160 100" role="img" aria-label={`Pulsante ${COLOR_NAME[color]} «${label}»`} data-testid="art-button" data-color={color} data-holding={holding || undefined}>
      <g style={colorVars(color)}>
        <circle cx="62" cy="52" r="40" className="art-btn-base" />
        <circle cx="62" cy="48" r="36" className="art-btn-top" data-pressed={holding || undefined} />
        <text x="62" y="52" className="art-btn-label" textLength={Math.min(60, label.length * 9)} lengthAdjust="spacingAndGlyphs">
          {label}
        </text>
      </g>
      {/* La striscia compare solo mentre il pulsante è tenuto premuto: prima la TV non la mostra. */}
      <g style={strip ? colorVars(strip) : undefined}>
        <rect x="118" y="12" width="24" height="76" rx="4" className="art-strip" data-on={strip ? true : undefined} data-color={strip} data-testid="art-strip" />
      </g>
    </svg>
  );
}

function SymbolsPad({ symbols, pressed }: { symbols: string[]; pressed: number[] }) {
  return (
    <div className="art-symbols" data-testid="art-symbols" data-count={symbols.length}>
      {symbols.map((id, i) => (
        <div key={id} className="art-symbol" data-pressed={pressed.includes(i) || undefined}>
          <SymbolIcon id={id} />
        </div>
      ))}
    </div>
  );
}

/** Le quattro luci: lampeggiano in sequenza (i lampi del passo in corso) e poi si ripete, finché l'artificiere non risponde. */
function ColorsLamps({ sequence, stage, entered }: { sequence: number[]; stage: number; entered: number }) {
  const shown = sequence.slice(0, stage + 1);
  const key = shown.join(",");
  const [lit, setLit] = useState<number | null>(shown[0] ?? null);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const play = () => {
      let at = 0;
      for (const c of key.split(",").map(Number)) {
        timers.push(setTimeout(() => setLit(c), at));
        at += 650;
        timers.push(setTimeout(() => setLit(null), at - 220));
      }
      timers.push(setTimeout(play, at + 1600));
    };
    play();
    return () => timers.forEach(clearTimeout);
  }, [key]);
  return (
    <div className="art-colors" data-testid="art-colors">
      <div className="art-lamps">
        {LAMP_IDS.map((id, i) => (
          <i key={id} className="art-lamp" data-lit={lit === i || undefined} data-lamp={id} style={colorVars(id)} />
        ))}
      </div>
      <p className="art-colors-step" aria-label={`Passo ${stage + 1} di ${sequence.length}`}>
        {Array.from({ length: stage + 1 }, (_, i) => (
          <b key={i} data-done={i < entered || undefined}>●</b>
        ))}
        <small> {stage + 1}/{sequence.length}</small>
      </p>
    </div>
  );
}

function WordWheels({ wheels, pos }: { wheels: string[][]; pos: number[] }) {
  return (
    <div className="art-wheels" data-testid="art-wheels">
      {wheels.map((w, i) => (
        <div key={i} className="art-wheel">
          <small>▲</small>
          <b data-testid="art-wheel-letter">{w[pos[i]!]}</b>
          <small>▼</small>
        </div>
      ))}
    </div>
  );
}

export function ModuleTv({ m, selected }: { m: TvModule; selected: boolean }) {
  return (
    <section className="art-mod" data-testid="art-module" data-kind={m.kind} data-solved={m.solved || undefined} data-selected={selected || undefined}>
      <header>
        <b className="art-mod-n">{m.id + 1}</b>
        <span>{MODULE_TITLE[m.kind]}</span>
        <i className="art-led" data-on={m.solved || undefined} aria-label={m.solved ? "disinnescato" : "attivo"} />
      </header>
      {m.kind === "wires" && <WiresSvg wires={m.data.wires} cut={m.progress.cut} />}
      {m.kind === "button" && <ButtonSvg color={m.data.color} label={m.data.label} strip={m.data.strip} holding={m.progress.holding} />}
      {m.kind === "symbols" && <SymbolsPad symbols={m.data.symbols} pressed={m.progress.pressed} />}
      {m.kind === "colors" && <ColorsLamps sequence={m.data.sequence} stage={m.progress.stage} entered={m.progress.entered} />}
      {m.kind === "maze" && <MazeDrawing size={6} marks={m.data.marks} pos={m.progress.pos} goal={m.data.goal} />}
      {m.kind === "word" && <WordWheels wheels={m.data.wheels} pos={m.progress.pos} />}
      {m.solved && <span className="art-mod-done">✔</span>}
    </section>
  );
}

/** Il bordo della bomba: ciò che le regole del manuale chiedono di leggere. Solo sulla TV. */
export function EdgeworkBar({ e }: { e: Edgework }) {
  return (
    <div className="art-edge" data-testid="art-edge">
      <span className="art-serial" data-testid="art-serial">
        <small>SERIALE</small> {e.serial}
      </span>
      <span className="art-batteries" aria-label={`${e.batteries} batterie`}>
        {e.batteries === 0 ? <small>nessuna batteria</small> : Array.from({ length: e.batteries }, (_, i) => <i key={i} className="art-battery" />)}
      </span>
      <span className="art-indicators">
        {e.indicators.map((i) => (
          <span key={i.label} className="art-indicator" data-lit={i.lit || undefined} aria-label={`spia ${i.label} ${i.lit ? "accesa" : "spenta"}`}>
            {i.lit ? "●" : "○"} {i.label}
          </span>
        ))}
      </span>
      <span className="art-ports">
        {e.ports.length === 0 ? <small>nessuna porta</small> : e.ports.map((p) => <span key={p} className="art-port">{p}</span>)}
      </span>
    </div>
  );
}
