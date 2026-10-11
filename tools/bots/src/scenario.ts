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
