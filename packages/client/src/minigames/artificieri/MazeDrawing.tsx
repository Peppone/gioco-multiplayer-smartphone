/**
 * Un labirinto in SVG, in due versioni:
 * - con `cells` (i muri, come in `maze.ts`: un bit per lato aperto) e i segni: è la pagina del manuale;
 * - senza `cells`: è il modulo sulla TV, una griglia senza muri con i segni, la posizione (`pos`) e l'arrivo (`goal`).
 * Le coordinate sono in celle (la cella è 1×1), così lo spessore dei muri non dipende dalla dimensione.
 */
const RIGHT = 2;
const DOWN = 4;

interface Props {
  size: number;
  cells?: number[];
  marks: [number, number];
  pos?: number;
  goal?: number;
}

export function MazeDrawing({ size, cells, marks, pos, goal }: Props) {
  const at = (i: number) => ({ x: (i % size) + 0.5, y: Math.floor(i / size) + 0.5 });
  const walls: [number, number, number, number][] = [];
  if (cells) {
    walls.push([0, 0, size, 0], [0, size, size, size], [0, 0, 0, size], [size, 0, size, size]);
    cells.forEach((bits, i) => {
      const x = i % size;
      const y = Math.floor(i / size);
      if (x < size - 1 && (bits & RIGHT) === 0) walls.push([x + 1, y, x + 1, y + 1]);
      if (y < size - 1 && (bits & DOWN) === 0) walls.push([x, y + 1, x + 1, y + 1]);
    });
  }
  return (
    <svg className="art-maze" viewBox={`-0.2 -0.2 ${size + 0.4} ${size + 0.4}`} role="img" aria-label={cells ? "Labirinto del manuale" : "Labirinto"} data-testid={cells ? "art-maze-manual" : "art-maze"}>
      {!cells && (
        <g className="art-maze-grid">
          {Array.from({ length: size + 1 }, (_, k) => (
            <g key={k}>
              <line x1={k} y1={0} x2={k} y2={size} />
              <line x1={0} y1={k} x2={size} y2={k} />
            </g>
          ))}
        </g>
      )}
      {cells && (
        <g className="art-maze-walls">
          {walls.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
      )}
      {marks.map((i) => (
        <circle key={i} className="art-maze-mark" cx={at(i).x} cy={at(i).y} r={0.28} />
      ))}
      {goal !== undefined && <rect className="art-maze-goal" x={at(goal).x - 0.3} y={at(goal).y - 0.3} width={0.6} height={0.6} />}
      {pos !== undefined && <circle className="art-maze-pos" cx={at(pos).x} cy={at(pos).y} r={0.22} />}
    </svg>
  );
}
