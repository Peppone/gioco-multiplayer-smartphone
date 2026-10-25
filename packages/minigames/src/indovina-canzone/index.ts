import { z } from "zod";
import {
  AUDIO_EFFECTS,
  LISTEN_DEFAULTS,
  MEDIA_FILE_PATTERN,
  type MinigameType,
  type ParticipantInfo,
  PLAYBACK_MODES,
  ROUND_LISTEN_DEFAULTS,
  SPEED_MAX,
  SPEED_MIN,
  type TeamInfo,
  fairTime,
  listeningSettledMs,
  resolveListening,
  youtubeId,
} from "@gioco/shared";
import { GRACE_MS, addTo, rankByPoints, speedPoints, totalsToScores } from "../util.js";

/** Finestra di raccolta delle prenotazioni dopo la prima (come nel buzzer). */
export const COLLECT_WINDOW_MS = 250;

/**
 * Negli ascolti a spezzoni l'ascolto comincia questo tempo dopo il comando: così lo schermo, anche con un po' di latenza
 * (tunnel, rete cellulare), ha il tempo di avviare il primo spezzone intero. Nell'ascolto continuo non serve.
 */
export const LOOP_LEAD_MS = 400;

/** I brani senza categoria, quando i capisquadra scelgono la categoria, stanno in questa. */
export const OTHER_CATEGORY = "Altri brani";
const OTHER_KEY = "\u0000altri";

/** Come si ascolta un brano: la sua scelta, o «inherit» = la modalità del round. */
const SONG_LISTEN_MODES = ["inherit", ...PLAYBACK_MODES] as const;
/** Modalità che elaborano l'audio nel browser: servono i file caricati (non YouTube). */
const NEEDS_FILE = ["speed", "speed_then_normal", "blur_stages"] as const;
/** Campi di ascolto di un brano nuovo: segue il round, con i valori predefiniti di ogni modalità pronti da usare. */
const SONG_LISTEN_DEFAULTS = {
  playback: "inherit" as const,
  loopSeconds: [] as number[],
  speed: LISTEN_DEFAULTS.speed,
  keepPitch: LISTEN_DEFAULTS.keepPitch,
  normalAfterSeconds: LISTEN_DEFAULTS.normalAfterSeconds,
  speedTransitionSeconds: LISTEN_DEFAULTS.speedTransitionSeconds,
  stage1Seconds: LISTEN_DEFAULTS.stage1Seconds,
  stage2Seconds: LISTEN_DEFAULTS.stage2Seconds,
  stageTransitionSeconds: LISTEN_DEFAULTS.stageTransitionSeconds,
};
/** Il campo compare nell'editor solo con queste modalità (`showWhen` è un suggerimento di interfaccia, come `widget`). */
const showWhen = (...modes: (typeof SONG_LISTEN_MODES)[number][]) => ({ showWhen: { field: "playback", in: modes } });

export const indovinaCanzoneConfigSchema = z
  .object({
    songs: z
      .array(
        z
          .object({
            audio: z
              .string()
              .regex(MEDIA_FILE_PATTERN)
              .optional()
              .meta({ title: "Brano", description: "File caricato dalla regia (mp3, m4a, ogg, wav… o un video mp4, di cui si usa solo l'audio). In alternativa usa il link YouTube", widget: "audio" }),
            youtube: z
              .string()
              .trim()
              .max(200)
              .optional()
              .meta({
                title: "Link YouTube",
                description: "In alternativa al file: si usa l'audio del video, che resta nascosto. Serve internet sul PC dello schermo e il video deve poter essere incorporato",
              }),
            /** Visibile solo alla regia, che convalida la risposta data a voce. */
            answer: z
              .string()
              .trim()
              .min(1)
              .max(120)
              .meta({ title: "Titolo e artista (solo regia)", description: "Si mostra a schermo solo a domanda chiusa" }),
            /** Una o più: servono quando i capisquadra scelgono la categoria del prossimo brano. */
            categories: z
              .array(z.string().trim().min(1).max(30))
              .max(5)
              .default([])
              .meta({
                title: "Categorie",
                description: "Anche più di una (es. «Anni 80» e «Rock»). Servono se i capisquadra scelgono la categoria; senza, il brano è in «Altri brani»",
                widget: "lines",
              }),
            startSeconds: z
              .number()
              .min(0)
              .max(3_600)
              .default(0)
              .meta({ title: "Parti da (secondi)", description: "Punto del brano da cui far partire la musica" }),
            effect: z
              .enum(AUDIO_EFFECTS)
              .default("none")
              .meta({
                title: "Effetto sull'audio",
                description: "Rende il brano meno riconoscibile. Funziona solo con i file caricati, non con YouTube. «Senza voce» toglie ciò che è al centro del suono (di solito la voce, ma anche parte di basso e batteria) e va bene solo per brani stereo. Con «Svela gradualmente» l'effetto si attenua mano a mano che passa il tempo",
                enumLabels: {
                  none: "Nessuno",
                  blur: "Sfocato (suono ovattato)",
                  heavy_blur: "Molto sfocato",
                  no_voice: "Senza voce (solo base musicale)",
                },
              }),
            playback: z
              .enum(SONG_LISTEN_MODES)
              .default("inherit")
              .meta({
                title: "Modalità di ascolto del brano",
                description:
                  "Si sceglie brano per brano. «Come nel round» usa «Come si ascolta» del round. Velocità e ovattato a fasi funzionano solo con i file caricati, non con YouTube; con l'ovattato a fasi l'«Effetto sull'audio» del brano non vale",
                enumLabels: {
                  inherit: "Come nel round",
                  continuous: "Continuo",
                  loops: "A spezzoni crescenti",
                  speed: "Più lento o più veloce",
                  speed_then_normal: "Velocità diversa all'inizio, poi normale",
                  blur_stages: "Molto ovattato, poi poco, poi normale",
                },
              }),
            clipSeconds: z
              .number()
              .int()
              .min(3)
              .max(120)
              .optional()
              .meta({
                title: "Durata dell'ascolto di questo brano (secondi)",
                description: "Vuoto = quella del round. Per il tempo ascoltato, non per la posizione nel brano: a velocità doppia 30 s fanno sentire un minuto di musica",
                ...showWhen("inherit", "continuous", "speed", "speed_then_normal", "blur_stages"),
              }),
            loopSeconds: z
              .array(z.number().min(0.1).max(60))
              .max(12)
              .default([])
              .meta({
                title: "Durata degli spezzoni di questo brano (secondi)",
                description: "Nell'ordine in cui si ascoltano. Vuoto = quelli del round",
                itemLabel: "Spezzone del brano",
                ...showWhen("loops"),
              }),
            loopPauseSeconds: z
              .number()
              .min(0.2)
              .max(10)
              .optional()
              .meta({ title: "Pausa tra gli spezzoni di questo brano (secondi)", description: "Vuoto = quella del round", ...showWhen("loops") }),
            speed: z
              .number()
              .min(SPEED_MIN)
              .max(SPEED_MAX)
              .default(LISTEN_DEFAULTS.speed)
              .meta({
                title: "Velocità del brano",
                description: `1 = normale, sotto 1 più lento (0,5 = metà), sopra 1 più veloce (2 = doppia). Da ${SPEED_MIN} a ${SPEED_MAX}`,
                ...showWhen("speed", "speed_then_normal"),
              }),
            keepPitch: z
              .boolean()
              .default(LISTEN_DEFAULTS.keepPitch)
              .meta({
                title: "Mantieni l'intonazione (cambia solo la velocità, non la voce)",
                description: "Se lo togli il brano suona più grave quando è lento e più acuto quando è veloce, come un disco a un'altra velocità",
                ...showWhen("speed", "speed_then_normal"),
              }),
            normalAfterSeconds: z
              .number()
              .min(1)
              .max(120)
              .default(LISTEN_DEFAULTS.normalAfterSeconds)
              .meta({
                title: "Dopo quanti secondi torna la velocità normale",
                description: "Tempo ascoltato dall'inizio: allora comincia il passaggio alla velocità normale",
                ...showWhen("speed_then_normal"),
              }),
            speedTransitionSeconds: z
              .number()
              .min(0)
              .max(30)
              .default(LISTEN_DEFAULTS.speedTransitionSeconds)
              .meta({
                title: "Durata del passaggio alla velocità normale (secondi)",
                description: "La velocità cambia in modo morbido. 0 = di colpo",
                ...showWhen("speed_then_normal"),
              }),
            stage1Seconds: z
              .number()
              .min(1)
              .max(120)
              .default(LISTEN_DEFAULTS.stage1Seconds)
              .meta({ title: "Secondi di suono molto ovattato", description: "Prima fase, all'inizio dell'ascolto", ...showWhen("blur_stages") }),
            stage2Seconds: z
              .number()
              .min(0)
              .max(120)
              .default(LISTEN_DEFAULTS.stage2Seconds)
              .meta({ title: "Secondi di suono poco ovattato", description: "Seconda fase, passaggi esclusi. Dopo, il brano è normale", ...showWhen("blur_stages") }),
            stageTransitionSeconds: z
              .number()
              .min(0)
              .max(30)
              .default(LISTEN_DEFAULTS.stageTransitionSeconds)
              .meta({
                title: "Durata di ogni passaggio tra le fasi (secondi)",
                description: "Il suono cambia in modo morbido, non di colpo. 0 = di colpo. Il brano torna normale dopo: fase 1 + fase 2 + due passaggi",
                ...showWhen("blur_stages"),
              }),
            points: z
              .number()
              .int()
              .min(1)
              .max(10_000)
              .optional()
              .meta({ title: "Punti massimi", description: "Vuoto = punti massimi predefiniti" }),
          })
          // Una sola sorgente per brano: o il file o un link YouTube valido.
          .superRefine((song, ctx) => {
            if (song.audio && song.youtube) {
              ctx.addIssue({ code: "custom", message: "Il brano ha sia un file audio sia un link YouTube: tienine solo uno" });
            } else if (!song.audio && !song.youtube) {
              ctx.addIssue({ code: "custom", message: "Il brano non ha né un file audio né un link YouTube" });
            } else if (song.youtube && youtubeId(song.youtube) === null) {
              ctx.addIssue({ code: "custom", message: `Link YouTube non riconosciuto: «${song.youtube.slice(0, 60)}»`, path: ["youtube"] });
            }
          })
          // Gli effetti elaborano l'audio nel browser: l'audio di YouTube sta in un iframe e non è accessibile.
          .refine((song) => song.effect === "none" || !song.youtube, {
            message: "Gli effetti sull'audio funzionano solo con i file caricati, non con i link YouTube",
          })
          // Velocità e fasi cambiano il suono nel browser, come gli effetti.
          .refine((song) => !song.youtube || !(NEEDS_FILE as readonly string[]).includes(song.playback), {
            message: "Velocità e ovattato a fasi funzionano solo con i file caricati, non con i link YouTube",
            path: ["playback"],
          }),
      )
      .min(1)
      .max(50)
      .meta({ title: "Brani", itemLabel: "Brano" }),
    clipSeconds: z
      .number()
      .int()
      .min(3)
      .max(120)
      .default(ROUND_LISTEN_DEFAULTS.clipSeconds)
      .meta({ title: "Durata dell'ascolto (secondi)", description: "Predefinita dei brani (ognuno può avere la sua). Se nessuno indovina entro questo tempo la musica si ferma. Con gli spezzoni vale la durata totale degli spezzoni" }),
    playback: z
      .enum(["continuous", "loops"])
      .default(ROUND_LISTEN_DEFAULTS.playback)
      .meta({
        title: "Come si ascolta",
        description: "Predefinito dei brani: ogni brano può scegliere la sua modalità (anche più lento, più veloce o ovattato a fasi). A spezzoni il brano riparte sempre dall'inizio e dura di più a ogni giro, con una pausa in mezzo: ci si può prenotare anche durante le pause",
        enumLabels: { continuous: "Continuo", loops: "A spezzoni crescenti (es. 0,5 s, pausa, 1 s, pausa, 2 s…)" },
      }),
    loopSeconds: z
      .array(z.number().min(0.1).max(60))
      .min(1)
      .max(12)
      .default(ROUND_LISTEN_DEFAULTS.loopSeconds)
      .meta({ title: "Durata degli spezzoni (secondi)", description: "Predefiniti dei brani a spezzoni, nell'ordine in cui si ascoltano", itemLabel: "Spezzone" }),
    loopPauseSeconds: z
      .number()
      .min(0.2)
      .max(10)
      .default(ROUND_LISTEN_DEFAULTS.loopPauseSeconds)
      .meta({ title: "Pausa tra gli spezzoni (secondi)", description: "Predefinita dei brani a spezzoni" }),
    progressive: z
      .boolean()
      .default(false)
      .meta({ title: "Svela gradualmente il suono: l'effetto di ogni brano si attenua col tempo, fino al brano intero" }),
    clearAtPercent: z
      .number()
      .int()
      .min(20)
      .max(100)
      .default(100)
      .meta({ title: "Suono nitido al (% dell'ascolto)", description: "Solo con «Svela gradualmente». 100 = nitido solo alla fine; 80 = gli ultimi 20% si sentono interi" }),
    pickCategory: z
      .boolean()
      .default(false)
      .meta({ title: "I capisquadra scelgono la categoria del prossimo brano, a turno" }),
    pickSeconds: z
      .number()
      .int()
      .min(5)
      .max(120)
      .default(20)
      .meta({ title: "Tempo per scegliere (secondi)", description: "Solo se si sceglie la categoria. Scaduto, la categoria è estratta a sorte (la regia può sceglierla prima)" }),
    maxPoints: z
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(100)
      .meta({ title: "Punti massimi predefiniti", description: "Vale se si indovina subito, appena parte la musica" }),
    minPoints: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .default(30)
      .meta({ title: "Punti minimi", description: "Vale se si indovina all'ultimo istante: più si ascolta, meno si vince" }),
    wrongPenalty: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .default(50)
      .meta({ title: "Penalità per risposta sbagliata", description: "0 = nessuna penalità" }),
  })
  .refine((cfg) => !cfg.progressive || cfg.songs.some((s) => s.effect !== "none"), {
    message: "«Svela gradualmente» non ha effetto se nessun brano ha un effetto sull'audio: sceglilo nei brani",
    path: ["progressive"],
  })
  .refine((cfg) => !cfg.pickCategory || cfg.songs.some((s) => s.categories.length > 0), {
    message: "Per far scegliere la categoria almeno un brano deve averne una",
    path: ["pickCategory"],
  })
  // Se il suono torna normale dopo la fine dell'ascolto non si sentirebbe mai com'è il brano: meglio dirlo al salvataggio.
  .superRefine((cfg, ctx) => {
    cfg.songs.forEach((song, i) => {
      const listening = resolveListening(cfg, song);
      const settled = listeningSettledMs(listening);
      if (settled !== null && settled > listening.clipMs) {
        ctx.addIssue({
          code: "custom",
          path: ["songs", i, "playback"],
          message: `Brano ${i + 1}: il suono torna normale dopo ${settled / 1000} s, ma l'ascolto dura ${listening.clipMs / 1000} s: allunga l'ascolto o accorcia le fasi`,
        });
      }
    });
  });

export type IndovinaCanzoneConfig = z.infer<typeof indovinaCanzoneConfigSchema>;

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("buzz") }),
  /** Il capitano della squadra di turno sceglie la categoria (`key`: la categoria in minuscolo, come nell'elenco ricevuto). */
  z.object({ type: z.literal("pick"), category: z.string().max(60) }),
]);
const PLAIN_COMMANDS = ["start", "correct", "wrong", "resume", "skip", "next"] as const;
/** `pick:<categoria>` è la scelta della regia al posto del capitano. */
const commandSchema = z.object({
  type: z.string().refine((t) => (PLAIN_COMMANDS as readonly string[]).includes(t) || /^pick:.{1,60}$/.test(t)),
});

type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

interface Press {
  playerId: string;
  /** Ora equa (corretta per latenza) della pressione. */
  time: number;
  receivedAt: number;
  /** Quanta musica aveva ascoltato (ms dall'inizio dell'ascolto) quando ha premuto. */
  heardMs: number;
}

/** Una squadra che può scegliere la categoria, con il suo capitano. */
interface Chooser {
  teamId: string;
  name: string;
  color: string | null;
  captainId: string;
}

export interface IndovinaCanzoneState {
  cfg: IndovinaCanzoneConfig;
  participants: ParticipantInfo[];
  seed: number;
  /** Brano corrente (valido tranne in fase `choosing`, quando non è ancora stato scelto). */
  index: number;
  /** Brani già assegnati, il corrente compreso: indici in `cfg.songs`, in ordine di ascolto. */
  used: number[];
  /**
   * choosing: i capisquadra scelgono la categoria · idle: brano scelto, musica ferma · playing: la musica suona, ci si prenota ·
   * collecting: prima prenotazione ricevuta, finestra aperta · answering: risponde `queue[current]` · paused: tutti i
   * prenotati hanno sbagliato, la musica è ferma in attesa della regia · resolved · done.
   */
  phase: "choosing" | "idle" | "playing" | "collecting" | "answering" | "paused" | "resolved" | "done";
  /** Ora server in cui la musica è (ri)partita e posizione (ms) da cui è ripartita. */
  segmentStart: number;
  offsetMs: number;
  /** Posizione (ms) a cui la musica si è fermata (valida quando non è in riproduzione). */
  pausedMs: number;
  collectUntil: number;
  queue: Press[];
  current: number;
  /** Chi si è già prenotato per questo brano: non può ripremere (anche se ha sbagliato). */
  locked: string[];
  outcome: { playerId: string | null; points: number } | null;
  totals: Record<string, number>;
  /** Squadre con giocatori, in ordine di turno nella scelta della categoria. */
  choosers: Chooser[];
  /** Quante scelte di categoria sono state fatte: dice a quale squadra tocca. */
  picks: number;
  pickDeadline: number;
  /** Categoria scelta per il brano corrente (nome da mostrare), se si sceglie la categoria. */
  category: string | null;
}

const byMerit = (a: Press, b: Press) =>
  a.time - b.time || a.receivedAt - b.receivedAt || a.playerId.localeCompare(b.playerId);

const nick = (s: IndovinaCanzoneState, id: string | null | undefined) =>
  s.participants.find((p) => p.id === id)?.nickname ?? null;

type Song = IndovinaCanzoneConfig["songs"][number];

const song = (s: IndovinaCanzoneState) => s.cfg.songs[s.index]!;
/** Come si ascolta il brano corrente: la modalità del brano, oppure quella del round. */
const listening = (s: IndovinaCanzoneState) => resolveListening(s.cfg, song(s));
/** Durata dell'ascolto del brano corrente (tempo ascoltato): i secondi scelti, oppure il totale degli spezzoni. */
const clipMs = (s: IndovinaCanzoneState) => listening(s).clipMs;
/** Anticipo con cui parte (o riparte) l'ascolto dopo il comando della regia. */
const leadMs = (s: IndovinaCanzoneState) => (listening(s).mode === "loops" ? LOOP_LEAD_MS : 0);
const maxPointsOf = (s: IndovinaCanzoneState) => song(s).points ?? s.cfg.maxPoints;
/** Ora server in cui la musica arriva alla fine dell'ascolto, se riparte da `segmentStart`. */
const stopAt = (s: IndovinaCanzoneState) => s.segmentStart + clipMs(s) - s.offsetMs;

// ---- Categorie e scelta ----

const keyOf = (name: string) => name.trim().toLowerCase();
/** Le categorie di un brano (senza doppioni, maiuscole a parte); senza categorie sta in «Altri brani». */
function categoriesOf(song: Song): { key: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const name of song.categories) if (!seen.has(keyOf(name))) seen.set(keyOf(name), name);
  return seen.size > 0 ? [...seen].map(([key, name]) => ({ key, name })) : [{ key: OTHER_KEY, name: OTHER_CATEGORY }];
}

export interface CategoryOption {
  key: string;
  name: string;
  /** Brani non ancora suonati in questa categoria. */
  left: number;
}

/** Categorie con almeno un brano ancora da suonare, nell'ordine in cui compaiono nei brani. */
function availableCategories(s: IndovinaCanzoneState): CategoryOption[] {
  const out = new Map<string, CategoryOption>();
  s.cfg.songs.forEach((song, i) => {
    if (s.used.includes(i)) return;
    for (const c of categoriesOf(song)) {
      const entry = out.get(c.key) ?? { key: c.key, name: c.name, left: 0 };
      entry.left++;
      out.set(c.key, entry);
    }
  });
  return [...out.values()];
}

/** Numero pseudocasuale ripetibile da seme e contatore (stato puro e testabile). */
function mix(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Squadre con giocatori in ordine stabile; il capitano è quello designato, altrimenti il primo per nome. */
function formChoosers(players: ParticipantInfo[], teams: TeamInfo[]): Chooser[] {
  return teams
    .filter((t) => players.some((p) => p.teamId === t.id))
    .sort((a, b) => a.name.localeCompare(b.name, "it") || a.id.localeCompare(b.id))
    .map((t) => {
      const members = players.filter((p) => p.teamId === t.id).sort((a, b) => a.nickname.localeCompare(b.nickname, "it") || a.id.localeCompare(b.id));
      const captain = members.find((p) => p.captain) ?? members[0]!;
      return { teamId: t.id, name: t.name, color: t.color ?? null, captainId: captain.id };
    });
}

/** A chi tocca scegliere la categoria (nessuno se non ci sono squadre: sceglie la regia o la sorte). */
const chooserOf = (s: IndovinaCanzoneState): Chooser | null => (s.choosers.length > 0 ? s.choosers[s.picks % s.choosers.length]! : null);

/** Assegna un brano della categoria: tra quelli non ancora suonati ne estrae uno con il seme. */
function choose(s: IndovinaCanzoneState, key: string): IndovinaCanzoneState {
  const option = availableCategories(s).find((c) => c.key === key);
  if (!option) return s;
  const candidates = s.cfg.songs.flatMap((song, i) => (!s.used.includes(i) && categoriesOf(song).some((c) => c.key === key) ? [i] : []));
  const index = candidates[mix(s.seed, s.picks) % candidates.length]!;
  return { ...startSong(s, index), category: option.name, picks: s.picks + 1 };
}

function startSong(s: IndovinaCanzoneState, index: number): IndovinaCanzoneState {
  return { ...s, index, used: [...s.used, index], phase: "idle", offsetMs: 0, pausedMs: 0, queue: [], current: 0, locked: [], outcome: null, category: null };
}

/** Passa al brano successivo: in ordine, oppure fermandosi a far scegliere la categoria. */
function advance(s: IndovinaCanzoneState, now: number): IndovinaCanzoneState {
  if (s.used.length >= s.cfg.songs.length) return { ...s, phase: "done" };
  if (!s.cfg.pickCategory) return startSong(s, s.used.length);
  const options = availableCategories(s);
  if (options.length === 1) return choose(s, options[0]!.key); // niente da scegliere
  return { ...s, phase: "choosing", queue: [], current: 0, locked: [], outcome: null, category: null, pickDeadline: now + s.cfg.pickSeconds * 1000 };
}

export const indovinaCanzone: MinigameType<IndovinaCanzoneConfig, IndovinaCanzoneState, Input, Command> = {
  id: "indovina-canzone",
  title: "Indovina la canzone",
  defaultTheme: "gameshow",
  // Con la scelta della categoria i capisquadra contano: la regia può sostituire le squadre con squadre temporanee.
  teamBased: true,
  configSchema: indovinaCanzoneConfigSchema as unknown as z.ZodType<IndovinaCanzoneConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    songs: [
      { audio: "00000000-0000-4000-8000-000000000000.mp3", answer: "Titolo - Artista", categories: [], startSeconds: 0, effect: "none", ...SONG_LISTEN_DEFAULTS },
    ],
    clipSeconds: 30,
    playback: "continuous",
    loopSeconds: [0.5, 1, 2, 4, 8],
    loopPauseSeconds: 1.5,
    progressive: false,
    clearAtPercent: 100,
    pickCategory: false,
    pickSeconds: 20,
    maxPoints: 100,
    minPoints: 30,
    wrongPenalty: 50,
  },
  // Il nuovo brano parte senza sorgente: la regia sceglie un file oppure scrive un link YouTube.
  draftConfig: {
    songs: [{ answer: "", categories: [], startSeconds: 0, effect: "none", ...SONG_LISTEN_DEFAULTS }],
    clipSeconds: 30,
    playback: "continuous",
    loopSeconds: [0.5, 1, 2, 4, 8],
    loopPauseSeconds: 1.5,
    progressive: false,
    clearAtPercent: 100,
    pickCategory: false,
    pickSeconds: 20,
    maxPoints: 100,
    minPoints: 30,
    wrongPenalty: 50,
  },

  init(config, ctx, now) {
    // Le istanze salvate prima delle categorie e degli spezzoni non hanno i campi nuovi: si completano con i predefiniti.
    const completed = indovinaCanzoneConfigSchema.safeParse(config);
    const base: IndovinaCanzoneState = {
      cfg: completed.success ? completed.data : config,
      participants: ctx.players,
      seed: ctx.seed,
      index: 0,
      used: [],
      phase: "idle",
      segmentStart: 0,
      offsetMs: 0,
      pausedMs: 0,
      collectUntil: 0,
      queue: [],
      current: 0,
      locked: [],
      outcome: null,
      totals: {},
      choosers: formChoosers(ctx.players, ctx.teams),
      picks: 0,
      pickDeadline: 0,
      category: null,
    };
    return advance(base, now);
  },

  onInput(s, playerId, input, meta) {
    if (input.type === "pick") {
      // Solo il capitano della squadra di turno, e solo mentre si sceglie.
      if (s.phase !== "choosing" || chooserOf(s)?.captainId !== playerId) return s;
      return choose(s, input.category);
    }

    if (s.phase !== "playing" && s.phase !== "collecting") return s;
    if (!s.participants.some((p) => p.id === playerId)) return s;
    if (s.locked.includes(playerId)) return s;

    const time = fairTime({
      claimed: meta.claimedTime,
      receivedAt: meta.receivedAt,
      rtt: meta.rtt,
      openedAt: s.segmentStart,
    });
    const press: Press = {
      playerId,
      receivedAt: meta.receivedAt,
      time,
      heardMs: Math.min(clipMs(s), Math.max(0, s.offsetMs + (time - s.segmentStart))),
    };
    const locked = [...s.locked, playerId];
    if (s.phase === "playing") {
      return { ...s, phase: "collecting", collectUntil: meta.receivedAt + COLLECT_WINDOW_MS, queue: [press], current: 0, locked };
    }
    return { ...s, queue: [...s.queue, press], locked };
  },

  onTick(s, now) {
    if (s.phase === "collecting" && now >= s.collectUntil) {
      const queue = [...s.queue].sort(byMerit);
      // La musica riparte dal momento della prima prenotazione, non da quando il server l'ha saputo.
      return { ...s, phase: "answering", queue, current: 0, pausedMs: queue[0]!.heardMs };
    }
    // Fine dell'ascolto: un po' di tolleranza per le prenotazioni in volo.
    if (s.phase === "playing" && now >= stopAt(s) + GRACE_MS) {
      return { ...s, phase: "resolved", pausedMs: clipMs(s), outcome: { playerId: null, points: 0 } };
    }
    // Tempo scaduto per scegliere: la categoria è estratta a sorte.
    if (s.phase === "choosing" && now >= s.pickDeadline) {
      const options = availableCategories(s);
      return choose(s, options[mix(s.seed, s.picks + 1_000) % options.length]!.key);
    }
    return s;
  },

  onHostCommand(s, { type }, now) {
    if (type.startsWith("pick:")) return s.phase === "choosing" ? choose(s, type.slice("pick:".length)) : s;
    switch (type) {
      case "start":
        return s.phase === "idle"
          ? { ...s, phase: "playing", segmentStart: now + leadMs(s), offsetMs: 0, pausedMs: 0 }
          : s;
      case "resume":
        return s.phase === "paused" ? { ...s, phase: "playing", segmentStart: now + leadMs(s), offsetMs: s.pausedMs } : s;
      case "correct": {
        if (s.phase !== "answering") return s;
        const press = s.queue[s.current]!;
        const points = speedPoints(Math.min(s.cfg.minPoints, maxPointsOf(s)), maxPointsOf(s), 0, clipMs(s), press.heardMs);
        return { ...s, phase: "resolved", totals: addTo(s.totals, press.playerId, points), outcome: { playerId: press.playerId, points } };
      }
      case "wrong": {
        if (s.phase !== "answering") return s;
        const who = s.queue[s.current]!.playerId;
        const totals = s.cfg.wrongPenalty > 0 ? addTo(s.totals, who, -s.cfg.wrongPenalty) : s.totals;
        const current = s.current + 1;
        if (current < s.queue.length) return { ...s, current, totals };
        // Nessun altro prenotato: se qualcuno può ancora giocare la regia fa ripartire la musica.
        const everyoneLocked = s.participants.every((p) => s.locked.includes(p.id));
        if (everyoneLocked || s.pausedMs >= clipMs(s)) {
          return { ...s, phase: "resolved", totals, queue: [], current: 0, outcome: { playerId: null, points: 0 } };
        }
        return { ...s, phase: "paused", totals, queue: [], current: 0 };
      }
      case "skip":
        return s.phase === "resolved" || s.phase === "done" || s.phase === "choosing"
          ? s
          : { ...s, phase: "resolved", outcome: { playerId: null, points: 0 } };
      case "next":
        return s.phase === "resolved" ? advance(s, now) : s;
      default:
        return s;
    }
  },

  isFinished: (s) => s.phase === "done",
  result: (s) =>
    rankByPoints(
      s.totals,
      s.participants.map((p) => p.id),
    ),
  scores: (s) => totalsToScores(s.totals, "Indovina la canzone"),

  // Titolo e artista compaiono solo a brano chiuso; il file audio solo sullo schermo condiviso.
  screenView(s) {
    if (s.phase === "done") return { phase: "done" as const };
    const choosing = s.phase === "choosing";
    const answeringId = s.phase === "answering" ? s.queue[s.current]?.playerId : undefined;
    const playing = s.phase === "playing";
    const chooser = choosing ? chooserOf(s) : null;
    const listen = choosing ? null : listening(s);
    return {
      phase: s.phase,
      index: choosing ? s.used.length : s.used.length - 1,
      total: s.cfg.songs.length,
      // Finché la categoria non è scelta non si sa quale brano suonerà: nessun file, nessuna anticipazione.
      music:
        choosing || !listen
          ? null
          : {
              file: song(s).audio || null,
              youtubeId: song(s).youtube ? youtubeId(song(s).youtube!) : null,
              startSeconds: song(s).startSeconds,
              // Con l'ovattato a fasi il filtro lo guidano le fasi: l'effetto del brano non vale.
              effect: listen.stages ? ("heavy_blur" as const) : song(s).effect,
              playing,
              /** Dove si trova la musica: se suona, parte da `offsetMs` (tempo ascoltato) all'ora server `segmentStart`. */
              offsetMs: playing ? s.offsetMs : s.pausedMs,
              segmentStart: s.segmentStart,
              stopAt: playing ? stopAt(s) : null,
              clipMs: listen.clipMs,
              /** Come si ascolta: lo schermo ricava da qui posizione, velocità e filtro dal tempo ascoltato. */
              mode: listen.mode,
              loop: listen.loop,
              rate: listen.rate,
              keepPitch: listen.keepPitch,
              stages: listen.stages,
              /** Percentuale dell'ascolto a cui il suono è nitido; assente se l'effetto non si attenua. */
              clearAtPercent: s.cfg.progressive && !listen.stages ? s.cfg.clearAtPercent : null,
            },
      category: s.category,
      choosing: choosing
        ? {
            team: chooser ? { id: chooser.teamId, name: chooser.name, color: chooser.color } : null,
            captain: chooser ? { playerId: chooser.captainId, nickname: nick(s, chooser.captainId) } : null,
            openedAt: s.pickDeadline - s.cfg.pickSeconds * 1000,
            deadline: s.pickDeadline,
            options: availableCategories(s).map(({ key, name, left }) => ({ key, name, left })),
          }
        : null,
      answering: answeringId ? { playerId: answeringId, nickname: nick(s, answeringId) } : null,
      queue: s.phase === "answering" ? s.queue.map((p) => ({ playerId: p.playerId, nickname: nick(s, p.playerId) })) : [],
      current: s.current,
      winner: s.outcome ? { playerId: s.outcome.playerId, nickname: nick(s, s.outcome.playerId), points: s.outcome.points } : null,
      reveal: s.phase === "resolved" ? song(s).answer : null,
    };
  },

  // Il telefono non riceve né il file né il titolo: la musica si ascolta dallo schermo.
  viewFor(s, playerId) {
    if (s.phase === "done") return { phase: "done" as const };
    const answeringId = s.phase === "answering" ? s.queue[s.current]?.playerId : undefined;
    const position = s.phase === "answering" ? s.queue.findIndex((p) => p.playerId === playerId) : -1;
    const chooser = s.phase === "choosing" ? chooserOf(s) : null;
    const picker = !!chooser && chooser.captainId === playerId;
    return {
      phase: s.phase,
      canBuzz: (s.phase === "playing" || s.phase === "collecting") && !s.locked.includes(playerId),
      buzzed: s.locked.includes(playerId),
      isAnswering: answeringId === playerId,
      position: position >= 0 ? position - s.current : null,
      won: s.outcome?.playerId === playerId,
      // Solo il capitano di turno riceve le categorie tra cui scegliere; gli altri vedono chi sceglie.
      pick: picker ? { openedAt: s.pickDeadline - s.cfg.pickSeconds * 1000, deadline: s.pickDeadline, options:availableCategories(s).map(({ key, name, left }) => ({ key, name, left })) } : null,
      chooserName: chooser ? chooser.name : null,
      category: s.category,
    };
  },

  hostView(s) {
    const choosing = s.phase === "choosing";
    const done = s.phase === "done";
    const q = done || choosing ? undefined : s.cfg.songs[s.index];
    const answering = s.phase === "answering";
    const chooser = choosing ? chooserOf(s) : null;
    const pickActions = choosing
      ? availableCategories(s).map((c) => ({ id: `pick:${c.key}`, label: `Scegli «${c.name}» (${c.left})`, enabled: true }))
      : [];
    return {
      info: {
        phase: s.phase,
        index: choosing ? s.used.length : Math.max(0, s.used.length - 1),
        total: s.cfg.songs.length,
        answer: q?.answer,
        category: s.category,
        chooser: chooser ? `${chooser.name} (${nick(s, chooser.captainId)})` : choosing ? "nessuna squadra: sceglie la regia o la sorte" : null,
        points: q ? maxPointsOf(s) : 0,
        answering: answering ? nick(s, s.queue[s.current]?.playerId) : null,
        queue: answering ? s.queue.map((p) => nick(s, p.playerId)) : [],
      },
      actions: [
        ...pickActions,
        { id: "start", label: "Fai partire la musica", enabled: s.phase === "idle" },
        { id: "correct", label: "Risposta corretta", enabled: answering },
        { id: "wrong", label: "Risposta sbagliata", enabled: answering, danger: true },
        { id: "resume", label: "Riprendi la musica", enabled: s.phase === "paused" },
        { id: "skip", label: "Salta il brano", enabled: ["idle", "playing", "collecting", "answering", "paused"].includes(s.phase), danger: true },
        {
          id: "next",
          label: s.used.length >= s.cfg.songs.length ? "Concludi" : "Prossimo brano",
          enabled: s.phase === "resolved",
        },
      ],
    };
  },
};
