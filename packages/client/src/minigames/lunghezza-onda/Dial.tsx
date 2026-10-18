import { type PointerEvent, useRef } from "react";
import { motion } from "framer-motion";
import type { Spectrum } from "./types";

/**
 * Il quadrante di Lunghezza d'Onda, uguale su TV e telefono: un semicerchio SVG con gli estremi dello spettro,
 * le fasce del bersaglio (solo quando si possono vedere), il coperchio, la lancetta e i pallini dei giocatori.
 * Le posizioni vanno da 0 (estremo sinistro) a 100 (estremo destro).
 */

const CX = 100;
const CY = 100;
const R = 92;

/** Punto del semicerchio alla posizione `pos`, a distanza `r` dal centro. */
function point(pos: number, r = R): [number, number] {
  const a = Math.PI * (1 - pos / 100);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
}

const fmt = (n: number) => n.toFixed(2);

/** Spicchio tra due posizioni (da sinistra a destra, passando per l'alto). */
function wedge(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${CX} ${CY} L ${fmt(x1)} ${fmt(y1)} A ${R} ${R} 0 0 1 ${fmt(x2)} ${fmt(y2)} Z`;
}

/** Le 5 fasce del bersaglio (2, 3, 4, 3, 2), tagliate ai bordi del quadrante. */
export function bands(target: number, zoneWidth: number): { from: number; to: number; zone: 2 | 3 | 4 }[] {
  const w = zoneWidth;
  const raw: [number, number, 2 | 3 | 4][] = [
    [target - 2.5 * w, target - 1.5 * w, 2],
    [target - 1.5 * w, target - 0.5 * w, 3],
    [target - 0.5 * w, target + 0.5 * w, 4],
    [target + 0.5 * w, target + 1.5 * w, 3],
    [target + 1.5 * w, target + 2.5 * w, 2],
  ];
  return raw
    .map(([from, to, zone]) => ({ from: Math.max(0, from), to: Math.min(100, to), zone }))
    .filter((b) => b.to > b.from);
}

/** Posizione puntata dal dito (in coordinate dello schermo) sul quadrante disegnato in `rect`. */
export function posFromPointer(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): number {
  const x = ((clientX - rect.left) / rect.width) * 200;
  const y = ((clientY - rect.top) / rect.height) * 110;
  // Sotto il centro si prende l'estremo più vicino; altrimenti l'angolo dal centro.
  const a = y >= CY ? (x < CX ? Math.PI : 0) : Math.atan2(CY - y, x - CX);
  const pos = 100 * (1 - a / Math.PI);
  return Math.min(100, Math.max(0, Math.round(pos * 2) / 2));
}

export interface DialDot {
  id: string;
  label: string;
  pos: number;
  color?: string;
  /** Pallino «pieno» (confermato) o «vuoto». */
  confirmed?: boolean;
  mine?: boolean;
}

/** Raggruppa i pallini vicini (entro `gap` punti) in uno solo con il numero: con 29 giocatori non si sovrappongono. */
export function clusterDots(dots: DialDot[], gap = 3): DialDot[] {
  const sorted = [...dots].sort((a, b) => a.pos - b.pos);
  const groups: DialDot[][] = [];
  for (const d of sorted) {
    const g = groups.at(-1);
    if (g && d.pos - g[0]!.pos <= gap) g.push(d);
    else groups.push([d]);
  }
  return groups.map((g) =>
    g.length === 1
      ? g[0]!
      : {
          id: g.map((d) => d.id).join("+"),
          label: String(g.length),
          pos: g.reduce((s, d) => s + d.pos, 0) / g.length,
          color: g.every((d) => d.color === g[0]!.color) ? g[0]!.color : undefined,
          confirmed: g.every((d) => d.confirmed !== false),
          mine: g.some((d) => d.mine),
        },
  );
}

interface DialProps {
  spectrum: Spectrum | null;
  /** Bersaglio da disegnare (Sensitivo, rivelazione); senza, si vede il coperchio chiuso. */
  target?: number | null;
  zoneWidth: number;
  /** Il coperchio si apre con un'animazione (rivelazione sulla TV). */
  revealing?: boolean;
  /** Lancetta principale (la mia posizione, o quella della squadra). */
  needle?: number | null;
  /** Lancetta secondaria tratteggiata (la mediana della squadra mentre muovo la mia). */
  ghostNeedle?: number | null;
  dots?: DialDot[];
  /** Quadrante interattivo: trascinando si sposta la lancetta. */
  onMove?: (pos: number) => void;
  onRelease?: (pos: number) => void;
  className?: string;
}

export function Dial({ spectrum, target, zoneWidth, revealing, needle, ghostNeedle, dots = [], onMove, onRelease, className }: DialProps) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const interactive = !!onMove;
  const shown = target !== null && target !== undefined;

  const at = (e: PointerEvent) => posFromPointer(e.clientX, e.clientY, ref.current!.getBoundingClientRect());

  return (
    <div className={`lo-dial ${className ?? ""}`} data-interactive={interactive} data-open={shown}>
      <svg
        ref={ref}
        viewBox="0 0 200 110"
        role={interactive ? "slider" : "img"}
        aria-label={spectrum ? `${spectrum.left} ↔ ${spectrum.right}` : "Quadrante"}
        aria-valuemin={interactive ? 0 : undefined}
        aria-valuemax={interactive ? 100 : undefined}
        aria-valuenow={interactive && needle !== null && needle !== undefined ? needle : undefined}
        data-testid="lo-dial"
        onPointerDown={
          interactive
            ? (e) => {
                dragging.current = true;
                (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
                onMove(at(e));
              }
            : undefined
        }
        onPointerMove={interactive ? (e) => dragging.current && onMove(at(e)) : undefined}
        onPointerUp={
          interactive
            ? (e) => {
                if (!dragging.current) return;
                dragging.current = false;
                onRelease?.(at(e));
              }
            : undefined
        }
        onPointerCancel={interactive ? () => (dragging.current = false) : undefined}
        onContextMenu={(e) => e.preventDefault()}
      >
        <path className="lo-face" d={wedge(0, 100)} />
        {shown && (
          <g className="lo-bands" data-testid="lo-bands" data-target={target}>
            {bands(target, zoneWidth).map((b) => (
              <path key={`${b.from}-${b.zone}`} className="lo-band" data-zone={b.zone} d={wedge(b.from, b.to)} />
            ))}
          </g>
        )}
        {(!shown || revealing) && (
          <motion.path
            className="lo-cover"
            data-testid="lo-cover"
            d={wedge(0, 100)}
            style={{ originX: "100px", originY: "100px" }}
            initial={{ rotate: 0, opacity: 1 }}
            animate={revealing ? { rotate: 180, opacity: 0 } : { rotate: 0, opacity: 1 }}
            transition={{ duration: 1.4, ease: "easeInOut", delay: 0.6 }}
          />
        )}
        {dots.map((d) => {
          const [x, y] = point(d.pos, R * 0.78);
          return (
            <g key={d.id} className="lo-dot" data-confirmed={d.confirmed !== false} data-mine={d.mine ?? false} data-pos={d.pos}>
              <circle cx={fmt(x)} cy={fmt(y)} r={7} style={d.color ? { fill: d.color } : undefined} />
              <text x={fmt(x)} y={fmt(y)} dy="0.35em" textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
        {ghostNeedle !== null && ghostNeedle !== undefined && <Needle pos={ghostNeedle} className="lo-needle lo-needle-ghost" />}
        {needle !== null && needle !== undefined && <Needle pos={needle} className="lo-needle" testId="lo-needle" />}
        <circle className="lo-hub" cx={CX} cy={CY} r={6} />
      </svg>
      {spectrum && (
        <div className="lo-ends">
          <span className="lo-end" data-side="left">⬅ {spectrum.left}</span>
          <span className="lo-end" data-side="right">{spectrum.right} ➡</span>
        </div>
      )}
    </div>
  );
}

function Needle({ pos, className, testId }: { pos: number; className: string; testId?: string }) {
  const [x, y] = point(pos, R * 0.96);
  return <line className={className} data-testid={testId} data-pos={pos} x1={CX} y1={CY} x2={fmt(x)} y2={fmt(y)} />;
}
