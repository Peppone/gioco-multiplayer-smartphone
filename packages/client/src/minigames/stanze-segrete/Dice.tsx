import { useEffect, useRef, useState } from "react";
import "./dice.css";
import { DICE_SIDES } from "./types";

/** Sagome dei dadi (viewBox 100×100) con qualche spigolo interno per dare l'idea del solido. */
const SHAPES: Record<number, { outline: string; edges: string[] }> = {
  4: { outline: "50,6 95,88 5,88", edges: ["50,6 50,88", "50,6 28,88", "50,6 72,88"] },
  6: { outline: "14,14 86,14 86,86 14,86", edges: ["14,14 28,28", "86,14 72,28", "86,86 72,72", "14,86 28,72"] },
  8: { outline: "50,4 94,50 50,96 6,50", edges: ["6,50 94,50", "50,4 50,96"] },
  10: { outline: "50,4 94,40 50,96 6,40", edges: ["6,40 94,40", "50,4 32,40", "50,4 68,40", "32,40 50,96", "68,40 50,96"] },
  12: { outline: "50,4 94,36 78,90 22,90 6,36", edges: ["50,4 50,30", "94,36 70,46", "6,36 30,46", "78,90 62,66", "22,90 38,66"] },
  20: { outline: "50,3 92,27 92,73 50,97 8,73 8,27", edges: ["50,3 50,28", "92,27 70,40", "8,27 30,40", "92,73 70,60", "8,73 30,60", "50,97 50,72"] },
};

const FILL: Record<number, string> = { 4: "var(--opt-0)", 6: "var(--opt-1)", 8: "var(--opt-2)", 10: "var(--opt-3)", 12: "var(--opt-4)", 20: "var(--opt-5)" };

/** Un dado disegnato in SVG. `value` null = nessun numero (dado fermo); "?" = risultato nascosto. */
export function Die({ sides, value, size = 5, className = "" }: { sides: number; value?: number | string | null; size?: number; className?: string }) {
  const shape = SHAPES[sides] ?? SHAPES[20]!;
  return (
    <svg className={`dice-die ${className}`} viewBox="0 0 100 100" width={`${size}rem`} height={`${size}rem`} role="img" aria-label={`d${sides}${value != null ? `: ${value}` : ""}`} data-sides={sides}>
      <polygon points={shape.outline} fill={FILL[sides] ?? FILL[20]} stroke="var(--border-c)" strokeWidth="4" strokeLinejoin="round" />
      {shape.edges.map((e) => <polyline key={e} points={e} fill="none" stroke="var(--on-opt)" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />)}
      {value != null ? (
        <text x="50" y="57" textAnchor="middle" dominantBaseline="middle" className="dice-num" style={{ fontSize: String(value).length > 1 ? 34 : 42 }}>{value}</text>
      ) : (
        <text x="50" y="57" textAnchor="middle" dominantBaseline="middle" className="dice-num dice-sides" style={{ fontSize: 26 }}>d{sides}</text>
      )}
    </svg>
  );
}

const randomFace = (sides: number) => 1 + Math.floor(Math.random() * sides);
const ROLL_MS = 1300;

/**
 * Il dado che rotola e si ferma sul risultato. Con `play` false compare già fermo (dadi tirati prima di aprire la scheda).
 * `result` null = risultato nascosto al giocatore: il dado rotola e si ferma su «?».
 */
export function RollingDie({ sides, result, play, size = 8, onLanded }: { sides: number; result: number | null; play: boolean; size?: number; onLanded?: () => void }) {
  const [landed, setLanded] = useState(!play);
  const [face, setFace] = useState<number>(() => (play ? randomFace(sides) : (result ?? 0)));
  const cb = useRef(onLanded);
  cb.current = onLanded;

  useEffect(() => {
    if (!play) return;
    const spin = setInterval(() => setFace(randomFace(sides)), 70);
    const stop = setTimeout(() => {
      clearInterval(spin);
      setLanded(true);
      cb.current?.();
    }, ROLL_MS);
    return () => {
      clearInterval(spin);
      clearTimeout(stop);
    };
  }, [play, sides]);

  const hidden = result === null;
  const shown = landed ? (hidden ? "?" : result) : face;
  const special = landed && !hidden ? (result === sides ? "crit" : result === 1 ? "fumble" : "") : "";
  return (
    <div className={`dice-stage ${landed ? "landed" : "rolling"} ${special}`} data-testid="dice-stage" data-state={landed ? "landed" : "rolling"} data-result={landed ? String(shown) : undefined}>
      <Die sides={sides} value={shown} size={size} />
      <span className="dice-shadow" aria-hidden="true" />
      {special === "crit" && <span className="dice-spark" aria-hidden="true">✨</span>}
      {special === "fumble" && <span className="dice-spark" aria-hidden="true">💥</span>}
    </div>
  );
}

/** Dadi a disposizione, per i selettori (Master). */
export const ALL_DICE = DICE_SIDES;
