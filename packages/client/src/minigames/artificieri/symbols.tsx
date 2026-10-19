import type { ReactNode } from "react";

/**
 * I 30 simboli del modulo «Simboli» e delle colonne del manuale, disegnati qui con lo stesso id del server
 * (`SYMBOL_IDS` in `@gioco/minigames`). Ognuno sta in un quadrato 24×24, con tratto o riempimento nel colore del testo.
 * Sono pochi tracciati: pesano solo qualche KB, quindi stanno anche nel telefono.
 */

const fill = { fill: "currentColor", stroke: "none" } as const;

const SHAPES: Record<string, ReactNode> = {
  spirale: <path d="M12 12a1.5 1.5 0 0 1 3 0a3 3 0 0 1-6 0a4.5 4.5 0 0 1 9 0a6 6 0 0 1-12 0" />,
  croce: <path d="M12 3v18M3 12h18" />,
  stella: <polygon {...fill} points="12,2.5 14.8,9 21.8,9.5 16.4,14 18.2,21 12,17.2 5.8,21 7.6,14 2.2,9.5 9.2,9" />,
  luna: <path {...fill} d="M16 3a9 9 0 1 0 5 13A7 7 0 0 1 16 3z" />,
  sole: (
    <>
      <circle {...fill} cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  fulmine: <polygon {...fill} points="13,2 5,13 11,13 9,22 19,9 13,9" />,
  goccia: <path {...fill} d="M12 3C12 3 5 11 5 15a7 7 0 0 0 14 0C19 11 12 3 12 3z" />,
  cuore: <path {...fill} d="M12 21C4 14 3 9 6 6.5a4.5 4.5 0 0 1 6 1.5a4.5 4.5 0 0 1 6-1.5C21 9 20 14 12 21z" />,
  occhio: (
    <>
      <path d="M2 12C6 5 18 5 22 12C18 19 6 19 2 12z" />
      <circle {...fill} cx="12" cy="12" r="3" />
    </>
  ),
  chiave: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11L21 21M18 18l2-2M15 15l2-2" />
    </>
  ),
  freccia: <path d="M3 12h15M12 5l7 7-7 7" />,
  onda: <path d="M2 12q2.5-6 5 0t5 0t5 0t5 0" />,
  triangolo: <polygon points="12,3 22,20 2,20" />,
  quadrato: <rect x="4" y="4" width="16" height="16" />,
  cerchio: <circle cx="12" cy="12" r="8" />,
  esagono: <polygon points="12,2 20.5,7 20.5,17 12,22 3.5,17 3.5,7" />,
  rombo: <polygon {...fill} points="12,2 21,12 12,22 3,12" />,
  zigzag: <polyline points="2,17 7,7 12,17 17,7 22,17" />,
  tridente: <path d="M12 22V4M5 4v6a7 7 0 0 0 14 0V4" />,
  ancora: (
    <>
      <circle cx="12" cy="4.5" r="1.8" />
      <path d="M12 6.5V19M7 10h10M4 14a8 8 0 0 0 16 0" />
    </>
  ),
  corona: <polygon {...fill} points="3,19 3,8 8,13 12,5 16,13 21,8 21,19" />,
  fiamma: <path {...fill} d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 3 0-3-1-5 0-8z" />,
  foglia: <path d="M5 19C5 10 10 5 20 4C19 14 14 19 5 19zM5 19L14 10" />,
  mano: (
    <>
      <path d="M6 12V7M9.5 11V4M13 11V3.5M16.5 12V6" />
      <path d="M5 12h13v4a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z" />
    </>
  ),
  scudo: <path d="M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5zM12 2v20" />,
  spada: (
    <>
      <path {...fill} d="M12 2l2.2 12h-4.4z" />
      <path d="M7 14h10M12 14v6" />
      <circle {...fill} cx="12" cy="21" r="1.2" />
    </>
  ),
  campana: (
    <>
      <path {...fill} d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z" />
      <circle {...fill} cx="12" cy="21.2" r="1.4" />
    </>
  ),
  tazza: <path d="M5 8h12v6a6 6 0 0 1-12 0zM17 9h2a2.5 2.5 0 0 1 0 5h-2M8 3v2M12 3v2" />,
  nodo: (
    <>
      <circle cx="8.5" cy="12" r="6" />
      <circle cx="15.5" cy="12" r="6" />
    </>
  ),
  clessidra: <path d="M6 3h12M6 21h12M7 3c0 6 5 7 5 9s-5 3-5 9M17 3c0 6-5 7-5 9s5 3 5 9" />,
};

/** Gli id disegnati (il test li confronta con quelli del server). */
export const SYMBOL_SHAPES = Object.keys(SHAPES);

export function SymbolIcon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ?? "art-sym"} viewBox="0 0 24 24" role="img" aria-label={id} data-symbol={id} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {SHAPES[id]}
    </svg>
  );
}
