import { type CSSProperties, type PointerEvent, useCallback, useRef, useState } from "react";
import type { Token } from "./types";

export type DragKind = "player" | "token";
export interface DragItem {
  kind: DragKind;
  id: string;
}
export interface Assignment {
  playerId: string;
  token: Token;
}

/** Soglia (px) oltre la quale un tocco diventa un trascinamento. */
const THRESHOLD = 8;

/** Un nome e un gettone, in qualunque ordine, formano un'assegnazione. */
export function toAssignment(a: DragItem, b: DragItem): Assignment | null {
  if (a.kind === b.kind) return null;
  const [player, token] = a.kind === "player" ? [a, b] : [b, a];
  return { playerId: player.id, token: token.id as Token };
}

const same = (a: DragItem | null, b: DragItem | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;

/**
 * Trascinamento «a coppie» per il telefono del Sindaco: si trascina un nome su un gettone o un gettone su un nome
 * (una sola funzione di rilascio per entrambe le direzioni). In alternativa il tocco-tocco: il primo tocco seleziona,
 * il secondo, su un elemento dell'altro tipo, completa l'assegnazione; ritoccare lo stesso elemento deseleziona.
 * Pointer Events + `elementFromPoint`, senza librerie. Gli elementi portano `data-dd="<tipo>:<id>"`.
 */
export function useDragPair(onAssign: (a: Assignment) => void) {
  const [selected, setSelected] = useState<DragItem | null>(null);
  const [drag, setDrag] = useState<{ item: DragItem; x: number; y: number } | null>(null);
  const [over, setOver] = useState<DragItem | null>(null);
  const start = useRef<{ item: DragItem; x: number; y: number; moved: boolean } | null>(null);

  const itemAt = (x: number, y: number): DragItem | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-dd]");
    if (!el || el.dataset.disabled === "true") return null;
    const [kind, ...rest] = (el.dataset.dd ?? "").split(":");
    return kind === "player" || kind === "token" ? { kind, id: rest.join(":") } : null;
  };

  const assign = useCallback(
    (a: DragItem, b: DragItem) => {
      const pair = toAssignment(a, b);
      if (pair) {
        onAssign(pair);
        try {
          navigator.vibrate?.(30);
        } catch {
          /* non su iOS Safari */
        }
      }
      setSelected(null);
    },
    [onAssign],
  );

  const bind = (item: DragItem, disabled: boolean) => ({
    "data-dd": `${item.kind}:${item.id}`,
    "data-disabled": disabled ? "true" : "false",
    "aria-disabled": disabled,
    "data-selected": same(selected, item) ? "true" : "false",
    "data-over": same(over, item) ? "true" : "false",
    onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(),
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (disabled) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      start.current = { item, x: e.clientX, y: e.clientY, moved: false };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < THRESHOLD) return;
      s.moved = true;
      setDrag({ item: s.item, x: e.clientX, y: e.clientY });
      const under = itemAt(e.clientX, e.clientY);
      setOver(under && under.kind !== s.item.kind ? under : null);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      setDrag(null);
      setOver(null);
      if (!s) return;
      if (s.moved) {
        const under = itemAt(e.clientX, e.clientY);
        if (under) assign(s.item, under);
        return;
      }
      // Tocco: seleziona, deseleziona o completa la coppia.
      if (same(selected, s.item)) setSelected(null);
      else if (selected && selected.kind !== s.item.kind) assign(selected, s.item);
      else setSelected(s.item);
    },
    onPointerCancel: () => {
      start.current = null;
      setDrag(null);
      setOver(null);
    },
  });

  return { bind, selected, drag, clearSelection: () => setSelected(null) };
}

/** L'elemento che segue il dito durante il trascinamento. */
export function DragGhost({ drag, label }: { drag: { x: number; y: number } | null; label: string }) {
  if (!drag) return null;
  const style: CSSProperties = { left: drag.x, top: drag.y };
  return (
    <div className="pm-ghost" style={style} aria-hidden="true">
      {label}
    </div>
  );
}
