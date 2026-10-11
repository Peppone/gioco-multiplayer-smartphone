import type { AudioEffect } from "@gioco/shared";

/** Frequenza di taglio (Hz) del filtro passa-basso: più è bassa, più il suono è ovattato. */
export const BLUR_CUTOFF_HZ: Record<"blur" | "heavy_blur", number> = { blur: 1_200, heavy_blur: 450 };
/** Sotto questa frequenza basso e grancassa sono riaggiunti al "senza voce", altrimenti sparirebbero col centro. */
export const BASS_KEEP_HZ = 140;

/**
 * Collega l'elemento audio alla destinazione applicando l'effetto. Restituisce una funzione che scollega tutto.
 *
 * - `blur` / `heavy_blur`: filtro passa-basso. Le consonanti e gli alti scompaiono, melodia e ritmo restano
 *   ma il brano è meno riconoscibile.
 * - `no_voice`: la voce è quasi sempre incisa al centro (uguale sui due canali), quindi sottraendo il canale
 *   destro dal sinistro si cancella. Cancella anche il resto di ciò che è centrale (basso, cassa), per questo
 *   i bassi si rimettono con un filtro passa-basso. Con brani mono non cancella nulla.
 */
export function connectEffect(ctx: AudioContext, source: AudioNode, effect: AudioEffect): () => void {
  const nodes: AudioNode[] = [source];
  const chain = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };

  if (effect === "blur" || effect === "heavy_blur") {
    const lowpass = chain(ctx.createBiquadFilter());
    lowpass.type = "lowpass";
    lowpass.frequency.value = BLUR_CUTOFF_HZ[effect];
    lowpass.Q.value = 0.5;
    // Il filtro toglie energia: si compensa un po' per non far abbassare il volume.
    const makeup = chain(ctx.createGain());
    makeup.gain.value = effect === "heavy_blur" ? 2.2 : 1.4;
    source.connect(lowpass);
    lowpass.connect(makeup);
    makeup.connect(ctx.destination);
  } else if (effect === "no_voice") {
    const splitter = chain(ctx.createChannelSplitter(2));
    const merger = chain(ctx.createChannelMerger(2));
    const invert = chain(ctx.createGain());
    invert.gain.value = -1;
    const level = chain(ctx.createGain());
    level.gain.value = 1.5;
    source.connect(splitter);
    // sinistro + (−destro), copiato su entrambe le orecchie
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 0, 1);
    splitter.connect(invert, 1);
    invert.connect(merger, 0, 0);
    invert.connect(merger, 0, 1);
    merger.connect(level);
    level.connect(ctx.destination);
    // basso e cassa, che stavano al centro e sono stati cancellati
    const bass = chain(ctx.createBiquadFilter());
    bass.type = "lowpass";
    bass.frequency.value = BASS_KEEP_HZ;
    const bassLevel = chain(ctx.createGain());
    bassLevel.gain.value = 0.8;
    source.connect(bass);
    bass.connect(bassLevel);
    bassLevel.connect(ctx.destination);
  } else {
    source.connect(ctx.destination);
  }

  return () => nodes.forEach((n) => n.disconnect());
}
