/** Foglio «Tiny Dungeon» di Kenney (CC0): 12 colonne × 11 righe di tile 16×16. Vedi public/assets/kenney/README.txt. */
const SHEET = "/assets/kenney/tiny-dungeon.png";
const COLS = 12;
const ROWS = 11;
const TILE = 16;

export function Sprite({ index, scale = 4, flip = false, label }: { index: number; scale?: number; flip?: boolean; label?: string }) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return (
    <span
      className="spr"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        width: TILE * scale,
        height: TILE * scale,
        backgroundImage: `url(${SHEET})`,
        backgroundSize: `${COLS * TILE * scale}px ${ROWS * TILE * scale}px`,
        backgroundPosition: `-${col * TILE * scale}px -${row * TILE * scale}px`,
        transform: flip ? "scaleX(-1)" : undefined,
      }}
    />
  );
}

/** Tile del foglio per ogni icona di carta (vedi `CARD_ICONS` nel plugin). */
export const ICON_TILE: Record<string, number> = {
  sword: 104,
  dagger: 103,
  axe: 118,
  hammer: 117,
  shield: 101,
  "potion-red": 115,
  "potion-green": 114,
  "potion-blue": 116,
  staff: 129,
  spear: 131,
};

/** Cavalieri: elmo chiuso per il primo lato, visiera aperta per il secondo. */
export const KNIGHT_TILE = [96, 97];
