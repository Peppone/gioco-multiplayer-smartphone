import { BOARD_LAYOUT, surveyCost } from "@gioco/minigames/src/pianeta-nascosto/board";
import { COMET_SECTORS } from "@gioco/minigames/src/pianeta-nascosto/sky";
import type { Kind, Seen, Settings, Token } from "./types";

/** Nomi e glifi degli oggetti: testo, così seguono il colore e il font del tema. */
export const KIND_NAME: Record<Kind, string> = { asteroid: "asteroide", comet: "cometa", gas: "nube di gas", dwarf: "pianeta nano", empty: "vuoto", planetX: "Pianeta X" };
export const KIND_PLURAL: Record<Kind, string> = { asteroid: "asteroidi", comet: "comete", gas: "nubi di gas", dwarf: "pianeti nani", empty: "settori vuoti", planetX: "Pianeta X" };
export const KIND_ICON: Record<Kind, string> = { asteroid: "◍", comet: "☄", gas: "☁", dwarf: "●", empty: "○", planetX: "✱" };
export const SEEN: Seen[] = ["asteroid", "comet", "gas", "dwarf", "empty"];
export const TOKENS: Token[] = ["asteroid", "comet", "gas", "dwarf"];
export const KINDS: Kind[] = ["asteroid", "comet", "gas", "dwarf", "empty", "planetX"];

export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** I settori dove può stare una cometa. */
export const cometSectors = (s: Pick<Settings, "mode">): number[] => COMET_SECTORS[s.mode];
export const theoryBoundaries = (s: Pick<Settings, "mode">): number[] => BOARD_LAYOUT[s.mode].theory;
export const conferenceBoundaries = (s: Pick<Settings, "mode">) => BOARD_LAYOUT[s.mode].conferences;
export { surveyCost };

/** I tipi di un'etichetta (ricerca o conferenza) come glifi, con «+» tra i due. */
export const labelText = (label: Kind[]): string => label.map((k) => KIND_ICON[k]).join("+");
export const labelName = (label: Kind[]): string => label.map((k) => KIND_NAME[k]).join(" + ");

export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---- Geometria del cerchio: il settore 1 è in alto, i numeri crescono in senso orario ----

export const centerAngle = (sector: number, n: number): number => -90 + ((sector - 0.5) * 360) / n;
export const edgeAngle = (sector: number, n: number): number => -90 + ((sector - 1) * 360) / n;

export function polar(r: number, deg: number, cx = 200, cy = 200): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Spicchio d'anello tra i raggi `r1 < r2` e gli angoli `a1 < a2` (gradi). */
export function ring(r1: number, r2: number, a1: number, a2: number, cx = 200, cy = 200): string {
  const [x1, y1] = polar(r2, a1, cx, cy);
  const [x2, y2] = polar(r2, a2, cx, cy);
  const [x3, y3] = polar(r1, a2, cx, cy);
  const [x4, y4] = polar(r1, a1, cx, cy);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r2} ${r2} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} A${r1} ${r1} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
}

/** Il settore è nel cielo visibile quando la freccia indica `earthSector`. */
export const isVisible = (sector: number, earthSector: number, n: number): boolean => (sector - earthSector + n) % n < n / 2;

export const tokensTotal = (t: Record<Token, number>): number => TOKENS.reduce((sum, k) => sum + t[k], 0);
