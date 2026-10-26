import { AUDIO_EFFECTS, EFFECT_AMOUNT, EFFECT_SEED, type EffectSetting, SEEDED_EFFECTS, LEGACY_AUDIO_EFFECTS, type MediaItem, type PlaybackMode, ROUND_LISTEN_DEFAULTS, effectZone, legacyEffectSettings, youtubeId } from "@gioco/shared";

/** Nome breve degli effetti, per il riassunto nella lista dei brani. */
export const EFFECT_SHORT_NAMES: Record<EffectSetting["type"], string> = {
  blur: "Sfocato",
  no_voice: "Senza voce",
  telephone: "Telefono",
  distortion: "Distorsione",
  echo: "Eco",
  reverse_chunks: "Al contrario a pezzi",
  flip_spectrum: "Spettro capovolto",
  shuffle_syllables: "Sillabe mescolate",
  stutter: "Balbuziente",
  vocoder: "Vocoder a bande",
  hum: "Canticchiato",
  beep: "Bip",
  silence: "Silenzio",
};

/** Come si ascolta un brano, in poche parole. */
export const MODE_NAMES: Record<PlaybackMode, string> = {
  continuous: "continuo",
  loops: "a spezzoni crescenti",
  speed: "più lento o più veloce",
  speed_then_normal: "velocità diversa, poi normale",
  blur_stages: "molto ovattato, poi poco, poi normale",
};

/**
 * Gli effetti di un brano dai valori del modulo, che possono essere incompleti: la quantità mancante vale quella piena e
 * il vecchio effetto singolo, se c'è ancora, conta come primo dell'elenco (come quando il server salva).
 */
export function effectsOf(song: Record<string, unknown>): EffectSetting[] {
  const list = Array.isArray(song.effects) ? (song.effects as Partial<EffectSetting>[]) : [];
  const legacy = LEGACY_AUDIO_EFFECTS.find((e) => e === song.effect);
  return [
    ...legacyEffectSettings(legacy),
    ...list.flatMap((e) => {
      if (!AUDIO_EFFECTS.some((t) => t === e?.type)) return [];
      const zone = effectZone(e);
      return [
        {
          type: e.type!,
          amount: typeof e.amount === "number" ? e.amount : EFFECT_AMOUNT.default,
          ...((SEEDED_EFFECTS as readonly string[]).includes(e.type!) ? { seed: typeof e.seed === "number" ? e.seed : EFFECT_SEED.default } : {}),
          ...(zone ?? {}),
        },
      ];
    }),
  ];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const seconds = (s: number) => `${s.toLocaleString("it-IT", { maximumFractionDigits: 1 })} s`;

/** Da dove viene il brano: il nome del file caricato o il video YouTube; `null` se manca (il brano non è valido). */
export function songSource(song: Record<string, unknown>, library: readonly MediaItem[]): { kind: "file" | "youtube"; label: string } | null {
  if (typeof song.audio === "string" && song.audio !== "") {
    return { kind: "file", label: library.find((m) => m.file === song.audio)?.name ?? "(file non trovato)" };
  }
  if (typeof song.youtube === "string" && song.youtube.trim() !== "") {
    const id = youtubeId(song.youtube);
    return { kind: "youtube", label: id ? `YouTube ${id}` : "link YouTube non riconosciuto" };
  }
  return null;
}

/**
 * Le impostazioni «avanzate» di un brano in una riga di brevi voci per la lista: solo ciò che è stato cambiato rispetto
 * al predefinito (partenza, ascolto, effetti, categorie, punti), così un brano normale non ne ha nessuna.
 */
export function songSummary(song: Record<string, unknown>): string[] {
  const out: string[] = [];
  const start = num(song.startSeconds);
  if (start) out.push(`parte da ${seconds(start)}`);
  const mode = (Object.keys(MODE_NAMES) as PlaybackMode[]).find((m) => m === song.playback);
  const plainContinuous = mode === "continuous" && (num(song.clipSeconds) ?? ROUND_LISTEN_DEFAULTS.clipSeconds) === ROUND_LISTEN_DEFAULTS.clipSeconds;
  if (mode && !plainContinuous) {
    const clip = num(song.clipSeconds);
    const loops = Array.isArray(song.loopSeconds) ? song.loopSeconds.filter((v): v is number => typeof v === "number") : [];
    const speed = num(song.speed);
    const detail = mode === "loops" && loops.length > 0 ? ` (${loops.map((v) => v.toLocaleString("it-IT")).join(" · ")} s)` : (mode === "speed" || mode === "speed_then_normal") && speed ? ` (×${speed.toLocaleString("it-IT")})` : "";
    out.push(`ascolto ${MODE_NAMES[mode]}${detail}${clip && mode !== "loops" ? `, ${seconds(clip)}` : ""}`);
  } else if (!mode && num(song.clipSeconds)) {
    out.push(`ascolto ${seconds(num(song.clipSeconds)!)}`);
  }
  const effects = effectsOf(song);
  if (effects.length > 0) out.push(`effetti: ${effects.map((e) => `${EFFECT_SHORT_NAMES[e.type]} ${e.amount}%${e.seed !== undefined && e.seed !== EFFECT_SEED.default ? ` #${e.seed}` : ""}${e.from !== undefined && e.to !== undefined ? ` (${e.from}–${e.to} s)` : ""}`).join(" + ")}`);
  const categories = Array.isArray(song.categories) ? song.categories.filter((c): c is string => typeof c === "string" && c.trim() !== "") : [];
  if (categories.length > 0) out.push(`categorie: ${categories.join(", ")}`);
  const points = num(song.points);
  if (points) out.push(`${points} punti`);
  return out;
}

/**
 * L'ascolto si decide brano per brano, quindi ogni brano porta i suoi valori e il pannello li mostra tutti. Un brano che
 * segue ancora il round («Come nel round», o senza modalità) riceve ciò che il round gli dava, così suona come prima; a un
 * brano con una modalità propria si riempiono solo i valori che mancano (durata dell'ascolto; spezzoni e pausa se è a
 * spezzoni) con quelli del round o i predefiniti. Se non c'è nulla da riempire restituisce lo stesso oggetto.
 */
export function materializeListening(song: Record<string, unknown>, round: Record<string, unknown>): Record<string, unknown> {
  const own = song.playback !== undefined && song.playback !== "inherit";
  const mode = own ? song.playback : round.playback === "loops" ? "loops" : "continuous";
  const patch: Record<string, unknown> = own ? {} : { playback: mode };
  if (mode === "loops") {
    const roundLoops = Array.isArray(round.loopSeconds) ? round.loopSeconds.filter((v): v is number => typeof v === "number") : [];
    const ownLoops = Array.isArray(song.loopSeconds) ? song.loopSeconds.filter((v): v is number => typeof v === "number") : [];
    if (ownLoops.length === 0) patch.loopSeconds = roundLoops.length > 0 ? roundLoops : ROUND_LISTEN_DEFAULTS.loopSeconds;
    if (num(song.loopPauseSeconds) === undefined) patch.loopPauseSeconds = num(round.loopPauseSeconds) ?? ROUND_LISTEN_DEFAULTS.loopPauseSeconds;
  } else if (num(song.clipSeconds) === undefined) {
    patch.clipSeconds = num(round.clipSeconds) ?? ROUND_LISTEN_DEFAULTS.clipSeconds;
  }
  return Object.keys(patch).length === 0 ? song : { ...song, ...patch };
}
