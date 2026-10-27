import { useEffect, useRef, useState } from "react";
import { type EffectSetting, MAX_EFFECTS, ZONE_REQUIRED_EFFECTS, effectZone } from "@gioco/shared";
import { EFFECT_SHORT_NAMES } from "./songs";
import { ZONE_STEP_SECONDS, type ZoneDrag, defaultZone, dragZone, nextFreeZone, waveformPeaks } from "./zoneDrag";

/** Quanti tratti si disegnano: abbastanza per vedere dove parla la voce, pochi per non pesare. */
const BUCKETS = 300;
const HEIGHT = 56;

interface Decoded {
  peaks: Float32Array;
  duration: number;
}

// Un brano si decodifica una volta sola per file anche se il pannello si chiude e si riapre.
const cache = new Map<string, Promise<Decoded>>();
function decode(file: string): Promise<Decoded> {
  let found = cache.get(file);
  if (!found) {
    found = fetch(`/media/${file}`)
      .then((r) => r.arrayBuffer())
      .then((data) => new OfflineAudioContext(1, 1, 44_100).decodeAudioData(data))
      .then((buffer) => ({
        peaks: waveformPeaks(Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c)), BUCKETS),
        duration: buffer.duration,
      }));
    found.catch(() => cache.delete(file));
    cache.set(file, found);
  }
  return found;
}

const fmt = (s: number) => s.toLocaleString("it-IT", { maximumFractionDigits: 1 });

/**
 * La forma d'onda del brano con le zone degli effetti: si trascinano i bordi (inizio e fine) o tutta la zona, e anche con
 * la tastiera (frecce: ±0,1 s, con Maiusc ±1 s). Il valore si registra al rilascio, così l'anteprima non si rifà a ogni pixel.
 */
export function Waveform({
  file,
  effects,
  onZoneChange,
  onAddZone,
}: {
  file: string;
  effects: EffectSetting[];
  onZoneChange: (index: number, zone: { from: number; to: number } | null) => void;
  /** Duplica l'effetto `index` su un'altra zona (più zone = lo stesso effetto più volte nell'elenco). */
  onAddZone?: (index: number, zone: { from: number; to: number }) => void;
}) {
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    decode(file).then(
      (d) => alive && setDecoded(d),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [file]);

  const track = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ index: number; zone: { from: number; to: number } } | null>(null);
  const grab = useRef<{ kind: ZoneDrag; x: number; zone: { from: number; to: number }; index: number } | null>(null);

  if (failed) return <small className="muted">Forma d'onda non disponibile per questo file.</small>;
  if (!decoded) return <small className="muted" role="status">Carico la forma d'onda…</small>;
  const { peaks, duration } = decoded;

  const zoned = effects.flatMap((e, index) => {
    const zone = effectZone(e);
    return zone ? [{ index, zone: draft?.index === index ? draft.zone : zone }] : [];
  });

  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / duration) * 100))}%`;
  const path = Array.from(peaks, (p, i) => `M${i + 0.5} ${HEIGHT / 2 - p * (HEIGHT / 2 - 2)}V${HEIGHT / 2 + p * (HEIGHT / 2 - 2)}`).join("");

  const down = (e: React.PointerEvent, kind: ZoneDrag, index: number, zone: { from: number; to: number }) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    grab.current = { kind, x: e.clientX, zone, index };
    setDraft({ index, zone });
  };
  const move = (e: React.PointerEvent) => {
    const g = grab.current;
    const width = track.current?.getBoundingClientRect().width ?? 0;
    if (!g || width <= 0) return;
    setDraft({ index: g.index, zone: dragZone(g.kind, g.zone, ((e.clientX - g.x) / width) * duration, duration) });
  };
  const up = () => {
    const g = grab.current;
    grab.current = null;
    if (g && draft) {
      const same = draft.zone.from === g.zone.from && draft.zone.to === g.zone.to;
      if (!same) onZoneChange(g.index, draft.zone);
    }
    setDraft(null);
  };
  const key = (e: React.KeyboardEvent, kind: ZoneDrag, index: number, zone: { from: number; to: number }) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (step === 0) return;
    e.preventDefault();
    onZoneChange(index, dragZone(kind, zone, step * (e.shiftKey ? 1 : ZONE_STEP_SECONDS), duration));
  };

  return (
    <div className="waveform" data-duration={duration.toFixed(2)}>
      <div className="waveform-track" ref={track} style={{ height: HEIGHT }}>
        <svg viewBox={`0 0 ${peaks.length} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" width="100%" height={HEIGHT}>
          <path d={path} stroke="currentColor" strokeWidth="0.7" fill="none" />
        </svg>
        {zoned.map(({ index, zone }) => (
          <div key={index} className="waveform-zone" data-zone={index + 1} style={{ left: pct(zone.from), width: `calc(${pct(zone.to)} - ${pct(zone.from)})` }}>
            <div
              className="waveform-grip"
              role="slider"
              tabIndex={0}
              aria-label={`Sposta la zona ${index + 1}`}
              aria-valuemin={0}
              aria-valuemax={Number(duration.toFixed(1))}
              aria-valuenow={zone.from}
              aria-valuetext={`da ${fmt(zone.from)} a ${fmt(zone.to)} s`}
              onPointerDown={(e) => down(e, "move", index, zone)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onKeyDown={(e) => key(e, "move", index, zone)}
            />
            {(["start", "end"] as const).map((kind) => (
              <div
                key={kind}
                className={`waveform-handle ${kind}`}
                role="slider"
                tabIndex={0}
                aria-label={`${kind === "start" ? "Inizio" : "Fine"} della zona ${index + 1}`}
                aria-valuemin={0}
                aria-valuemax={Number(duration.toFixed(1))}
                aria-valuenow={kind === "start" ? zone.from : zone.to}
                onPointerDown={(e) => down(e, kind, index, zone)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onKeyDown={(e) => key(e, kind, index, zone)}
              />
            ))}
          </div>
        ))}
      </div>
      <ul className="waveform-effects" aria-label="Zone degli effetti">
        {effects.map((e, index) => {
          const zone = zoned.find((z) => z.index === index)?.zone;
          const required = (ZONE_REQUIRED_EFFECTS as readonly string[]).includes(e.type);
          const name = `${index + 1}. ${EFFECT_SHORT_NAMES[e.type]}`;
          return (
            <li key={index}>
              <span>{name}: {zone ? `${fmt(zone.from)}–${fmt(zone.to)} s` : "tutto il brano"}</span>
              {!zone && <button type="button" onClick={() => onZoneChange(index, defaultZone(duration))}>Limita a una zona: effetto {index + 1}</button>}
              {zone && !required && <button type="button" onClick={() => onZoneChange(index, null)}>Tutto il brano: effetto {index + 1}</button>}
              {zone && onAddZone && effects.length < MAX_EFFECTS && (
                <button
                  type="button"
                  disabled={nextFreeZone(duration, zoned.map((z) => z.zone)) === null}
                  title="Aggiunge lo stesso effetto, con le stesse impostazioni, su un'altra zona"
                  onClick={() => onAddZone(index, nextFreeZone(duration, zoned.map((z) => z.zone))!)}
                >
                  Aggiungi un'altra zona: effetto {index + 1}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <small className="muted">
        {zoned.length > 0 ? "Trascina i bordi o il centro di una zona (o usa le frecce). " : "Limita un effetto a una zona per poterla trascinare qui. "}
        Il brano dura {fmt(duration)} s.
      </small>
    </div>
  );
}
