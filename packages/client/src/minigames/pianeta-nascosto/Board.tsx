import type { CSSProperties } from "react";
import { KIND_ICON, centerAngle, conferenceBoundaries, edgeAngle, polar, ring, theoryBoundaries } from "./names";
import type { Kind, PublicView } from "./types";

/**
 * Il tabellone sulla TV: tracciato del tempo (anello esterno), piste di revisione (4 spazi per settore), anello interno con le
 * icone di teoria e conferenza, disco della Terra con il cielo visibile e il sole al centro. Disegnato in SVG con le variabili
 * del tema. Durante la partita gli spicchi sono tutti uguali: l'oggetto di un settore compare solo se è confermato o a partita finita.
 */

const C = 220;
const TRACK = [172, 196] as const;
const CELLS_OUTER = 168;
const CELL = 17;
const INNER = [72, 99] as const;

const cellRadii = (space: number): [number, number] => [CELLS_OUTER - (space + 1) * CELL + 1, CELLS_OUTER - space * CELL];

export function Board({ v, sky }: { v: PublicView; sky?: Kind[] }) {
  const n = v.settings.sectors;
  const sectors = Array.from({ length: n }, (_, i) => i + 1);
  const color = (id: string) => v.observatories.find((o) => o.id === id)?.color ?? "var(--fg)";
  const confirmed = v.confirmed;
  const earthDeg = (v.earth * 360) / n;
  // Il disco (disegnato per la freccia sul settore 1) copre la metà che non si vede.
  const coverStart = edgeAngle(1 + n / 2, n);
  const theory = theoryBoundaries(v.settings);
  const conferences = conferenceBoundaries(v.settings);

  // Segnalini sul tracciato: nello stesso settore stanno affiancati, in ordine di pila (chi è sopra gioca dopo).
  const markers = [...v.observatories]
    .sort((a, b) => a.time - b.time || a.stack - b.stack)
    .map((o) => {
      const sameSector = v.observatories.filter((x) => x.sector === o.sector).sort((a, b) => a.time - b.time || a.stack - b.stack);
      const idx = sameSector.findIndex((x) => x.id === o.id);
      const spread = Math.min(8, 140 / n);
      return { o, angle: centerAngle(o.sector, n) + (idx - (sameSector.length - 1) / 2) * spread, ring: 0 };
    });

  return (
    <svg className="px-board" viewBox="0 0 440 440" role="img" aria-label="Tabellone del sistema solare" data-testid="px-board" data-sectors={n}>
      {/* tracciato del tempo */}
      {sectors.map((s) => {
        const [x, y] = polar(184, centerAngle(s, n), C, C);
        return (
          <g key={`t${s}`}>
            <path className="px-track" d={ring(TRACK[0], TRACK[1], edgeAngle(s, n) + 0.4, edgeAngle(s, n) + 360 / n - 0.4)} />
            <text className="px-num" x={x} y={y} textAnchor="middle" dominantBaseline="central">{s}</text>
          </g>
        );
      })}

      {/* piste di revisione */}
      {sectors.map((s) => {
        const a1 = edgeAngle(s, n) + 0.6;
        const a2 = edgeAngle(s, n) + 360 / n - 0.6;
        const here = v.theories.filter((t) => t.sector === s);
        const [gx, gy] = polar(CELLS_OUTER - 2 * CELL, centerAngle(s, n), C, C);
        const kind = confirmed[s] ?? sky?.[s - 1];
        return (
          <g key={`w${s}`} className="px-wedge" data-testid="px-wedge" data-sector={s} data-confirmed={confirmed[s] ? "true" : undefined}>
            {[0, 1, 2, 3].map((space) => {
              const [r1, r2] = cellRadii(space);
              return <path key={space} className="px-cell" data-space={space} d={ring(r1, r2, a1, a2)} />;
            })}
            {kind && (
              <text className="px-object" data-kind={kind} x={gx} y={gy} textAnchor="middle" dominantBaseline="central" data-testid="px-object">
                {KIND_ICON[kind]}
              </text>
            )}
            {here.map((t, i) => {
              const [r1, r2] = cellRadii(t.space);
              const [x, y] = polar((r1 + r2) / 2, centerAngle(s, n) + (i - (here.length - 1) / 2) * Math.min(7, 100 / n), C, C);
              return (
                <g key={t.id} className="px-token" data-testid="px-token" data-face={t.faceUp ? "up" : "down"} data-space={t.space} style={{ "--px-team": color(t.ownerId), transform: `translate(${x}px, ${y}px)` } as CSSProperties}>
                  <rect x={-6} y={-6} width={12} height={12} rx={2} />
                  {t.faceUp && t.object && (
                    <text textAnchor="middle" dominantBaseline="central" fontSize={10}>{KIND_ICON[t.object]}</text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* anello interno: numeri e icone */}
      <path className="px-inner" d={ring(INNER[0], INNER[1], -90, 269.9)} />
      {sectors.map((s) => {
        const [x, y] = polar(86, centerAngle(s, n), C, C);
        return (
          <text key={`i${s}`} className="px-inum" x={x} y={y} textAnchor="middle" dominantBaseline="central">{s}</text>
        );
      })}
      {theory.map((s) => {
        const [x, y] = polar(86, edgeAngle(s, n) + 360 / n, C, C);
        return <text key={`th${s}`} className="px-icon" data-icon="theory" data-testid="px-icon-theory" x={x} y={y} textAnchor="middle" dominantBaseline="central">▤</text>;
      })}
      {conferences.map((c) => {
        const [x, y] = polar(86, edgeAngle(c.after, n) + 360 / n, C, C);
        const held = v.conferences.find((x) => x.id === c.id)?.held;
        return (
          <g key={c.id} data-testid="px-icon-conference" data-held={held ? "true" : undefined}>
            <text className="px-icon" data-icon="conference" x={x} y={y} textAnchor="middle" dominantBaseline="central">▲</text>
            <text className="px-icon-label" x={x} y={y + 9} textAnchor="middle" dominantBaseline="central">{c.id}</text>
          </g>
        );
      })}

      {/* la Terra: copre metà anello interno; la freccia indica il settore dell'osservatorio più arretrato */}
      <g className="px-earth" data-testid="px-earth" data-earth-sector={v.earthSector} style={{ transform: `rotate(${earthDeg}deg)`, transformOrigin: `${C}px ${C}px` }}>
        <path className="px-disc" d={ring(INNER[0] - 4, INNER[1] + 2, coverStart, coverStart + 180)} />
        <text className="px-disc-label" x={polar(86, coverStart + 90, C, C)[0]} y={polar(86, coverStart + 90, C, C)[1]} textAnchor="middle" dominantBaseline="central">🌍</text>
        <path className="px-arrow" d={`M${C} ${C - 62} L${C - 7} ${C - 47} L${C + 7} ${C - 47} Z`} transform={`rotate(${centerAngle(1, n) + 90} ${C} ${C})`} />
      </g>
      <circle className="px-sun" cx={C} cy={C} r={28} />
      <text className="px-sun-label" x={C} y={C} textAnchor="middle" dominantBaseline="central">☀</text>

      {/* segnalini degli osservatori sul tracciato del tempo */}
      {markers.map(({ o, angle }) => {
        const [x, y] = polar(209, angle, C, C);
        const acting = v.actingIds.includes(o.id);
        return (
          <g key={o.id} className="px-marker" data-testid="px-marker" data-obs={o.id} data-sector={o.sector} data-time={o.time} data-acting={acting || undefined} style={{ "--px-team": o.color, transform: `translate(${x}px, ${y}px)` } as CSSProperties}>
            <circle r={9} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={10}>{o.name.charAt(0).toUpperCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}
