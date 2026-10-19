import { sampleShadowConfig } from "../../../packages/minigames/src/shadow-tournament/config.js";
import type { AdminApi } from "./api.js";

/** Contenuti di prova con tempi brevi: servono a far girare molti minigiochi in poco tempo. */
const ROUND_CONFIGS: { typeId: string; title: string; config: unknown }[] = [
  {
    typeId: "quiz-multipla",
    title: "Quiz di prova",
    config: { questions: [{ text: "Domanda 1?", options: ["a", "b", "c", "d"], correctIndex: 1, timeSec: 20 }, { text: "Domanda 2?", options: ["a", "b"], correctIndex: 0, timeSec: 20 }] },
  },
  {
    typeId: "buzzer",
    title: "Buzzer di prova",
    config: { questions: [{ text: "Chi?", answer: "Lui" }, { text: "Dove?", answer: "Qui", points: 150 }], defaultPoints: 100, wrongPenalty: 50 },
  },
  {
    typeId: "vero-falso",
    title: "Raffica di prova",
    config: { statements: [{ text: "Uno.", answer: true }, { text: "Due.", answer: false }, { text: "Tre.", answer: true }], timeSec: 6, revealSec: 1 },
  },
  { typeId: "stima", title: "Stima di prova", config: { questions: [{ text: "Quanto?", answer: 500, unit: "m", min: 0, max: 1000 }], timeSec: 20 } },
  {
    typeId: "sondaggio",
    title: "Sondaggio di prova",
    config: { questions: [{ text: "Sì o no?", kind: "options", options: ["Sì", "No"] }, { text: "Chi?", kind: "players" }], timeSec: 20 },
  },
];

export interface EventSetup {
  eventId: string;
  teamIds: [string, string];
}

/** Crea due squadre e una serata, e distribuisce i giocatori a metà tra le due squadre. */
export async function setupEvent(api: AdminApi, playerIds: string[], label = "Stress"): Promise<EventSetup> {
  const stamp = Date.now().toString(36);
  const t1 = await api.post("/teams", { name: `Rossi ${label} ${stamp}`, color: "#ef4444", emblem: "🔥" });
  const t2 = await api.post("/teams", { name: `Blu ${label} ${stamp}`, color: "#3b82f6", emblem: "🌊" });
  const ev = await api.post("/events", { name: `Serata ${label} ${stamp}` });
  await api.put(`/events/${ev.id}/teams`, { teamIds: [t1.id, t2.id] });
  for (const [i, id] of playerIds.entries()) await api.put(`/events/${ev.id}/players/${id}`, { teamId: i % 2 === 0 ? t1.id : t2.id });
  return { eventId: ev.id, teamIds: [t1.id, t2.id] };
}

/** Partita classica con un round per ogni tipo di minigioco. */
export async function classicMatch(api: AdminApi, eventId: string): Promise<{ matchId: string; rounds: number }> {
  const match = await api.post(`/events/${eventId}/matches`, { name: "Partita classica" });
  for (const r of ROUND_CONFIGS) {
    const inst = await api.post("/instances", r);
    await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  }
  return { matchId: match.id, rounds: ROUND_CONFIGS.length };
}

/** Partita con un round-duello tra le due squadre della serata, con un quiz e una raffica come minigiochi. */
export async function duelMatch(api: AdminApi, setup: EventSetup): Promise<{ matchId: string }> {
  const match = await api.post(`/events/${setup.eventId}/matches`, { name: "Duello" });
  const pool: string[] = [];
  for (const r of ROUND_CONFIGS.filter((c) => c.typeId === "vero-falso" || c.typeId === "quiz-multipla")) pool.push((await api.post("/instances", { ...r, title: `${r.title} (duello)` })).id);
  const duel = await api.post("/instances", {
    typeId: "knight-duel",
    title: "Duello",
    config: { pool, hp: 12, minigamesPerBattle: 1, maxBattles: 2, draftSeconds: 20, battleSeconds: 20 },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: duel.id });
  return { matchId: match.id };
}

/** Partita con il solo round «Stanze Segrete» (sessione con Game Master): pause dei messaggi azzerate per la raffica. */
export async function stanzeMatch(api: AdminApi, eventId: string): Promise<{ matchId: string }> {
  const match = await api.post(`/events/${eventId}/matches`, { name: "Stanze Segrete" });
  const inst = await api.post("/instances", {
    typeId: "stanze-segrete",
    title: "Complesso di prova",
    config: {
      rows: 3,
      cols: 3,
      rooms: ["A", "C", "S", "T", "I", "U", "R", "O", "M"].map((letter) => ({ letter, note: "" })),
      anchor: 0,
      words: ["MORTA", "USCITA"],
      solution: "USCITA",
      defaultSightSec: 3,
      messageCooldownSec: 0,
    },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  return { matchId: match.id };
}

/** Partita con il solo round «Shadow Tournament», con tempi brevi e 2 vite per scontro (un torneo da 30 dura pochi minuti). */
export async function shadowMatch(api: AdminApi, eventId: string): Promise<{ matchId: string }> {
  const match = await api.post(`/events/${eventId}/matches`, { name: "Shadow Tournament" });
  const inst = await api.post("/instances", {
    typeId: "shadow-tournament",
    title: "Torneo di prova",
    config: { normalDeck: sampleShadowConfig.normalDeck, legendaryDeck: sampleShadowConfig.legendaryDeck, introSec: 2, startLives: 2, extraLifeSec: 6, chooseSec: 6, reactSec: 4, showSec: 1, rewardSec: 6, byeSec: 6, turnPauseSec: 2 },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  return { matchId: match.id };
}

/** Partita con il solo round «Parole Mannare»: tempi brevi e riserva di Sì/No piccola, così il Sindaco simulato finisce in fretta. */
export async function paroleMatch(api: AdminApi, eventId: string): Promise<{ matchId: string }> {
  const match = await api.post(`/events/${eventId}/matches`, { name: "Parole Mannare" });
  const inst = await api.post("/instances", {
    typeId: "parole-mannare",
    title: "Parole di prova",
    config: { wordPickSeconds: 10, nightSeconds: 8, questionSeconds: 90, yesNoPool: 20, maybePool: 6, correctGraceSeconds: 2, seerHuntSeconds: 15, voteSeconds: 20, runoffSeconds: 10 },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  return { matchId: match.id };
}

/** Partita con il solo round «Stanze col botto»: tre round brevi e attese ridotte, così i bot arrivano alla rivelazione in fretta. */
export async function bottoMatch(api: AdminApi, eventId: string): Promise<{ matchId: string }> {
  const match = await api.post(`/events/${eventId}/matches`, { name: "Stanze col botto" });
  const round = { seconds: 12, hostages6to10: 1, hostages11to21: 2, hostages22plus: 3 };
  const inst = await api.post("/instances", {
    typeId: "stanze-col-botto",
    title: "Botto di prova",
    config: { roundMode: "custom", customRounds: [round, round, round], lockSeconds: 6, hostageSeconds: 8, startAfterFirstSeconds: 2, startAfterExchangeSeconds: 5, gambleSeconds: 6 },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  return { matchId: match.id };
}

/** Partita con il solo round «Agenti Segreti»: tempi brevi e al massimo 16 turni, così i bot arrivano alla fine in fretta. */
export async function agentiMatch(api: AdminApi, eventId: string): Promise<{ matchId: string }> {
  const match = await api.post(`/events/${eventId}/matches`, { name: "Agenti Segreti" });
  // Le parole sono nel database: la lista che il server crea al primo avvio.
  const lists = await api.get<{ id: string; typeId: string; title: string }[]>("/instances");
  const wordList = lists.find((i) => i.typeId === "word-list" && i.title === "Parole di Agenti Segreti")?.id;
  if (!wordList) throw new Error("manca la lista «Parole di Agenti Segreti» nel database");
  const inst = await api.post("/instances", {
    typeId: "agenti-segreti",
    title: "Agenti di prova",
    config: { wordList, clueSeconds: 15, guessSeconds: 15, maxTurns: 16 },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  return { matchId: match.id };
}

/** Partita con un round di «Lunghezza d'Onda» nella modalità indicata: tempi brevi, pochi turni. */
export async function ondaMatch(api: AdminApi, eventId: string, mode: "tutti" | "squadre"): Promise<{ matchId: string }> {
  const match = await api.post(`/events/${eventId}/matches`, { name: `Lunghezza d'Onda (${mode})` });
  const inst = await api.post("/instances", {
    typeId: "lunghezza-onda",
    title: `Onda di prova (${mode})`,
    config: { mode, turns: mode === "tutti" ? 4 : 6, targetScore: 8, pickSeconds: 5, clueSeconds: 8, guessSeconds: 10, counterSeconds: 6 },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  return { matchId: match.id };
}

/**
 * Partita con il solo round «Artificieri»: i giocatori vengono ridistribuiti in squadre da 5 (come consiglia la guida:
 * da 3 a 6), con scommesse e timer brevi. Niente pulsante da tenere premuto: i bot non sanno rilasciarlo a tempo.
 */
export async function artificieriMatch(api: AdminApi, setup: EventSetup, playerIds: string[]): Promise<{ matchId: string; teams: number }> {
  const stamp = Date.now().toString(36);
  const teams = Math.max(1, Math.ceil(playerIds.length / 5));
  const colors = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#14b8a6", "#ec4899", "#6366f1"];
  const teamIds: string[] = [];
  for (let i = 0; i < teams; i++) teamIds.push((await api.post("/teams", { name: `Squadra ${i + 1} ${stamp}`, color: colors[i % colors.length], emblem: "💣" })).id);
  await api.put(`/events/${setup.eventId}/teams`, { teamIds });
  for (const [i, id] of playerIds.entries()) await api.put(`/events/${setup.eventId}/players/${id}`, { teamId: teamIds[i % teams] });

  const match = await api.post(`/events/${setup.eventId}/matches`, { name: "Artificieri" });
  const lists = await api.get<{ id: string; typeId: string; title: string }[]>("/instances");
  const wordList = lists.find((i) => i.typeId === "word-list" && i.title === "Parole di Agenti Segreti")?.id;
  if (!wordList) throw new Error("manca la lista «Parole di Agenti Segreti» nel database");
  const inst = await api.post("/instances", {
    typeId: "artificieri",
    title: "Bombe di prova",
    config: { difficulty: "media", modules: 4, seconds: 240, betSeconds: 10, wordList, enabledModules: { wires: true, button: false, symbols: true, colors: true, maze: true, word: true } },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  return { matchId: match.id, teams };
}

/**
 * Partita con il solo round «Pilota alla cieca»: i giocatori vengono ridistribuiti in 4 squadre (o meno, con pochi
 * giocatori) che corrono insieme sulla TV, con livelli brevi.
 */
export async function pilotaMatch(api: AdminApi, setup: EventSetup, playerIds: string[]): Promise<{ matchId: string; teams: number; levels: number }> {
  const stamp = Date.now().toString(36);
  const teams = playerIds.length < 4 ? 1 : Math.min(4, Math.max(2, Math.floor(playerIds.length / 3)));
  const colors = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];
  const teamIds: string[] = [];
  for (let i = 0; i < teams; i++) teamIds.push((await api.post("/teams", { name: `Squadra ${i + 1} ${stamp}`, color: colors[i % colors.length], emblem: "🧭" })).id);
  await api.put(`/events/${setup.eventId}/teams`, { teamIds });
  for (const [i, id] of playerIds.entries()) await api.put(`/events/${setup.eventId}/players/${id}`, { teamId: teamIds[i % teams] });
  const levels = 2;
  const match = await api.post(`/events/${setup.eventId}/matches`, { name: "Pilota alla cieca" });
  const inst = await api.post("/instances", {
    typeId: "pilota-cieco",
    title: "Labirinti di prova",
    config: { mode: "insieme", levels, size: "piccolo", mineDensity: 8, doors: 3, keys: 1, patrols: true, levelSeconds: 90, stepMs: 300, penaltyMs: 1500 },
  });
  await api.post(`/matches/${match.id}/rounds`, { instanceId: inst.id });
  return { matchId: match.id, teams, levels };
}
