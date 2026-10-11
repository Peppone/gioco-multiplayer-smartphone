import { z } from "zod";
import { AUDIO_EFFECTS, MEDIA_FILE_PATTERN, type MinigameType, type ParticipantInfo, fairTime, youtubeId } from "@gioco/shared";
import { GRACE_MS, addTo, rankByPoints, speedPoints, totalsToScores } from "../util.js";

/** Finestra di raccolta delle prenotazioni dopo la prima (come nel buzzer). */
export const COLLECT_WINDOW_MS = 250;

export const indovinaCanzoneConfigSchema = z.object({
  songs: z
    .array(
      z.object({
        audio: z
          .string()
          .regex(MEDIA_FILE_PATTERN)
          .optional()
          .meta({ title: "Brano", description: "File audio caricato dalla regia (mp3, m4a, ogg, wav…). In alternativa usa il link YouTube", widget: "audio" }),
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
            description: "Rende il brano meno riconoscibile. Funziona solo con i file caricati, non con YouTube. «Senza voce» toglie ciò che è al centro del suono (di solito la voce, ma anche parte di basso e batteria) e va bene solo per brani stereo",
            enumLabels: {
              none: "Nessuno",
              blur: "Sfocato (suono ovattato)",
              heavy_blur: "Molto sfocato",
              no_voice: "Senza voce (solo base musicale)",
            },
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
    .default(30)
    .meta({ title: "Durata dell'ascolto (secondi)", description: "Se nessuno indovina entro questo tempo la musica si ferma" }),
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
});

export type IndovinaCanzoneConfig = z.infer<typeof indovinaCanzoneConfigSchema>;

const inputSchema = z.object({ type: z.literal("buzz") });
const commandSchema = z.object({ type: z.enum(["start", "correct", "wrong", "resume", "skip", "next"]) });

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

export interface IndovinaCanzoneState {
  cfg: IndovinaCanzoneConfig;
  participants: ParticipantInfo[];
  index: number;
  /**
   * idle: brano scelto, musica ferma · playing: la musica suona, ci si prenota · collecting: prima
   * prenotazione ricevuta, finestra aperta · answering: risponde `queue[current]` · paused: tutti i
   * prenotati hanno sbagliato, la musica è ferma in attesa della regia · resolved · done.
   */
  phase: "idle" | "playing" | "collecting" | "answering" | "paused" | "resolved" | "done";
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
}

const byMerit = (a: Press, b: Press) =>
  a.time - b.time || a.receivedAt - b.receivedAt || a.playerId.localeCompare(b.playerId);

const nick = (s: IndovinaCanzoneState, id: string | null | undefined) =>
  s.participants.find((p) => p.id === id)?.nickname ?? null;

const clipMs = (s: IndovinaCanzoneState) => s.cfg.clipSeconds * 1000;
const song = (s: IndovinaCanzoneState) => s.cfg.songs[s.index]!;
const maxPointsOf = (s: IndovinaCanzoneState) => song(s).points ?? s.cfg.maxPoints;
/** Ora server in cui la musica arriva alla fine dell'ascolto, se riparte da `segmentStart`. */
const stopAt = (s: IndovinaCanzoneState) => s.segmentStart + clipMs(s) - s.offsetMs;

function nextSong(s: IndovinaCanzoneState): IndovinaCanzoneState {
  if (s.index + 1 >= s.cfg.songs.length) return { ...s, phase: "done" };
  return { ...s, index: s.index + 1, phase: "idle", offsetMs: 0, pausedMs: 0, queue: [], current: 0, locked: [], outcome: null };
}

export const indovinaCanzone: MinigameType<IndovinaCanzoneConfig, IndovinaCanzoneState, Input, Command> = {
  id: "indovina-canzone",
  title: "Indovina la canzone",
  defaultTheme: "gameshow",
  configSchema: indovinaCanzoneConfigSchema as unknown as z.ZodType<IndovinaCanzoneConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    songs: [
      { audio: "00000000-0000-4000-8000-000000000000.mp3", answer: "Titolo - Artista", startSeconds: 0, effect: "none" },
    ],
    clipSeconds: 30,
    maxPoints: 100,
    minPoints: 30,
    wrongPenalty: 50,
  },
  // Il nuovo brano parte senza sorgente: la regia sceglie un file oppure scrive un link YouTube.
  draftConfig: {
    songs: [{ answer: "", startSeconds: 0, effect: "none" }],
    clipSeconds: 30,
    maxPoints: 100,
    minPoints: 30,
    wrongPenalty: 50,
  },

  init(config, ctx) {
    return {
      cfg: config,
      participants: ctx.players,
      index: 0,
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
    };
  },

  onInput(s, playerId, _input, meta) {
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
    return s;
  },

  onHostCommand(s, { type }, now) {
    switch (type) {
      case "start":
        return s.phase === "idle"
          ? { ...s, phase: "playing", segmentStart: now, offsetMs: 0, pausedMs: 0 }
          : s;
      case "resume":
        return s.phase === "paused" ? { ...s, phase: "playing", segmentStart: now, offsetMs: s.pausedMs } : s;
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
        return s.phase === "resolved" || s.phase === "done"
          ? s
          : { ...s, phase: "resolved", outcome: { playerId: null, points: 0 } };
      case "next":
        return s.phase === "resolved" ? nextSong(s) : s;
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
    const answeringId = s.phase === "answering" ? s.queue[s.current]?.playerId : undefined;
    const playing = s.phase === "playing";
    return {
      phase: s.phase,
      index: s.index,
      total: s.cfg.songs.length,
      music: {
        file: song(s).audio || null,
        youtubeId: song(s).youtube ? youtubeId(song(s).youtube!) : null,
        startSeconds: song(s).startSeconds,
        effect: song(s).effect,
        playing,
        /** Dove si trova la musica: se suona, parte da `offsetMs` all'ora server `segmentStart`. */
        offsetMs: playing ? s.offsetMs : s.pausedMs,
        segmentStart: s.segmentStart,
        stopAt: playing ? stopAt(s) : null,
        clipMs: clipMs(s),
      },
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
    return {
      phase: s.phase,
      canBuzz: (s.phase === "playing" || s.phase === "collecting") && !s.locked.includes(playerId),
      buzzed: s.locked.includes(playerId),
      isAnswering: answeringId === playerId,
      position: position >= 0 ? position - s.current : null,
      won: s.outcome?.playerId === playerId,
    };
  },

  hostView(s) {
    const q = s.cfg.songs[s.index];
    const answering = s.phase === "answering";
    return {
      info: {
        phase: s.phase,
        index: s.index,
        total: s.cfg.songs.length,
        answer: q?.answer,
        points: q ? maxPointsOf(s) : 0,
        answering: answering ? nick(s, s.queue[s.current]?.playerId) : null,
        queue: answering ? s.queue.map((p) => nick(s, p.playerId)) : [],
      },
      actions: [
        { id: "start", label: "Fai partire la musica", enabled: s.phase === "idle" },
        { id: "correct", label: "Risposta corretta", enabled: answering },
        { id: "wrong", label: "Risposta sbagliata", enabled: answering, danger: true },
        { id: "resume", label: "Riprendi la musica", enabled: s.phase === "paused" },
        { id: "skip", label: "Salta il brano", enabled: ["idle", "playing", "collecting", "answering", "paused"].includes(s.phase), danger: true },
        {
          id: "next",
          label: s.index + 1 >= s.cfg.songs.length ? "Concludi" : "Prossimo brano",
          enabled: s.phase === "resolved",
        },
      ],
    };
  },
};
