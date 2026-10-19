import { useEffect, useState } from "react";
import { type ClockSync, doorChangesIn, doorOpen, patrolCell } from "@gioco/shared";
import type { Door, LayerData, Patrol, PublicLane, Reveal } from "./types";

const RIGHT = 2;
const DOWN = 4;

/** Ora server, aggiornata ogni `intervalMs`: serve a calcolare in locale porte e pattuglie. */
export function useServerNow(clock: ClockSync, intervalMs = 200): number {
  const [now, setNow] = useState(() => clock.toServerTime(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setNow(clock.toServerTime(Date.now())), intervalMs);
    return () => clearInterval(id);
  }, [clock, intervalMs]);
  return now;
}

interface Props {
  lane: PublicLane;
  /** Gli strati di un navigatore (solo i suoi): mine, porte con l'orario, chiavi, pattuglie. */
  layers?: LayerData;
  /** Tutti gli strati, a fine gara. */
  reveal?: Reveal;
  /** Tempo trascorso dall'inizio della gara (ms), per porte e pattuglie. */
  elapsedMs?: number;
  /** Ora server (ms): il pilota è fermo se `frozenUntil` è ancora avanti. */
  nowMs?: number;
  /** Sfoca la mappa (il pilota si avvicina). */
  hidden?: boolean;
  /** Mostra a chi appartiene la mappa (TV): il pilota ha il colore della squadra. */
  compact?: boolean;
}

/**
 * La mappa di una corsia in SVG (la cella è 1×1: lo spessore dei muri non dipende dalla dimensione).
 * Sempre: muri, ingresso, uscita, punti di controllo, dove sono le porte, il pilota, le mine scoperte, le chiavi
 * raccolte. Con `layers` o `reveal` anche i segreti, con porte e pattuglie calcolate dall'ora (`elapsedMs`).
 */
export function LaneMap({ lane, layers, reveal, elapsedMs = 0, nowMs, hidden, compact }: Props) {
  const { w, h } = lane;
  const at = (i: number) => ({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
  const walls: [number, number, number, number][] = [[0, 0, w, 0], [0, h, w, h], [0, 0, 0, h], [w, 0, w, h]];
  lane.cells.forEach((bits, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    if (x < w - 1 && (bits & RIGHT) === 0) walls.push([x + 1, y, x + 1, y + 1]);
    if (y < h - 1 && (bits & DOWN) === 0) walls.push([x, y + 1, x + 1, y + 1]);
  });

  const doors: Door[] | undefined = layers?.doors ?? reveal?.doors;
  const mines = layers?.mines ?? reveal?.mines ?? [];
  const keys = layers?.keys ?? reveal?.keys ?? [];
  const patrols: Patrol[] = layers?.patrols ?? reveal?.patrols ?? [];
  const frozen = nowMs !== undefined && lane.frozenUntil > nowMs;

  return (
    <svg className="pc-map" data-testid="pc-map" data-hidden={hidden || undefined} data-compact={compact || undefined} viewBox={`-0.15 -0.15 ${w + 0.3} ${h + 0.3}`} role="img" aria-label={`Labirinto della squadra ${lane.teamName}`}>
      <rect className="pc-floor" x={0} y={0} width={w} height={h} />
      <g className="pc-walls">
        {walls.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      {lane.checkpoints.map((c) => (
        <rect key={`cp${c}`} className="pc-checkpoint" x={at(c).x - 0.2} y={at(c).y - 0.2} width={0.4} height={0.4} transform={`rotate(45 ${at(c).x} ${at(c).y})`} />
      ))}
      <path className="pc-start" d={`M${at(lane.start).x - 0.25} ${at(lane.start).y + 0.25} L${at(lane.start).x + 0.25} ${at(lane.start).y + 0.25} L${at(lane.start).x} ${at(lane.start).y - 0.28} Z`} />
      <g className="pc-exit" data-testid="pc-exit" transform={`translate(${at(lane.exit).x} ${at(lane.exit).y})`}>
        <line x1={-0.18} y1={0.3} x2={-0.18} y2={-0.32} />
        <path d="M-0.18 -0.32 L0.3 -0.16 L-0.18 0" />
      </g>
      {/* porte: la posizione si vede sempre; chi ha lo strato (o a fine gara) vede anche se sono aperte */}
      {lane.doorCells.map((cell) => {
        const door = doors?.find((d) => d.cell === cell);
        const open = door ? doorOpen(door, elapsedMs) : undefined;
        const secs = door ? Math.ceil(doorChangesIn(door, elapsedMs) / 1000) : null;
        return (
          <g key={`d${cell}`} className="pc-door" data-testid="pc-door" data-open={open === undefined ? undefined : open} transform={`translate(${at(cell).x} ${at(cell).y})`}>
            <rect x={-0.34} y={-0.34} width={0.68} height={0.68} rx={0.08} />
            {open === undefined ? <text y={0.12}>▯</text> : <text y={0.13} className="pc-door-secs">{secs}</text>}
          </g>
        );
      })}
      {keys.map((cell) => (
        <g key={`k${cell}`} className="pc-key" data-testid="pc-key" transform={`translate(${at(cell).x} ${at(cell).y})`}>
          <circle cx={-0.1} cy={0} r={0.14} />
          <path d="M0.04 0 H0.34 M0.22 0 V0.14 M0.32 0 V0.12" />
        </g>
      ))}
      {lane.keysTaken.map((cell) => (
        <text key={`kt${cell}`} className="pc-key-taken" x={at(cell).x} y={at(cell).y + 0.12}>
          ✓
        </text>
      ))}
      {mines.map((cell) => (
        <g key={`m${cell}`} className="pc-mine" data-testid="pc-mine" data-known={lane.hitMines.includes(cell) || undefined} transform={`translate(${at(cell).x} ${at(cell).y})`}>
          <circle r={0.22} />
          <path d="M-0.3 0 H0.3 M0 -0.3 V0.3 M-0.21 -0.21 L0.21 0.21 M-0.21 0.21 L0.21 -0.21" />
        </g>
      ))}
      {/* le mine già scoperte da chi ci è saltato sopra, note a tutti */}
      {lane.hitMines
        .filter((c) => !mines.includes(c))
        .map((cell) => (
          <g key={`hm${cell}`} className="pc-mine" data-known transform={`translate(${at(cell).x} ${at(cell).y})`}>
            <circle r={0.22} />
            <path d="M-0.3 0 H0.3 M0 -0.3 V0.3 M-0.21 -0.21 L0.21 0.21 M-0.21 0.21 L0.21 -0.21" />
          </g>
        ))}
      {patrols.map((p, i) => {
        const now = at(patrolCell(p, elapsedMs));
        return (
          <g key={`p${i}`} className="pc-patrol" data-testid="pc-patrol">
            <polyline points={p.path.map((c) => `${at(c).x},${at(c).y}`).join(" ")} />
            <rect x={now.x - 0.22} y={now.y - 0.22} width={0.44} height={0.44} rx={0.06} />
          </g>
        );
      })}
      <g className="pc-pilot" data-testid="pc-pilot" data-frozen={frozen || undefined} style={{ ["--pc-team" as string]: lane.teamColor }} transform={`translate(${at(lane.pos).x} ${at(lane.pos).y})`}>
        <circle r={0.3} />
        <circle className="pc-pilot-eye" cx={0.08} cy={-0.06} r={0.05} />
      </g>
    </svg>
  );
}
