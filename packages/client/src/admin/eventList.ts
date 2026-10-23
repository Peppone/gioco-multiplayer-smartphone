import type { EventListItem } from "@gioco/shared";

/**
 * Quanto è «viva» una serata: in corso (ha una partita avviata), attiva (segnata «in corso» dalla regia), bozza o chiusa.
 * L'ordine di questo elenco è anche quello in cui le serate compaiono.
 */
export const ACTIVITIES = ["running", "live", "draft", "closed"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABEL: Record<Activity, string> = {
  running: "In corso",
  live: "Attive",
  draft: "Bozze",
  closed: "Chiuse",
};

/** Etichetta al singolare, per il badge sulla singola serata. */
export const ACTIVITY_BADGE: Record<Activity, string> = {
  running: "▶ In corso",
  live: "Attiva",
  draft: "Bozza",
  closed: "Chiusa",
};

export function activityOf(event: EventListItem): Activity {
  if (event.matches.some((m) => m.status === "running")) return "running";
  return event.status === "live" ? "live" : event.status === "closed" ? "closed" : "draft";
}

/** Minuscolo e senza accenti: «Cena di Natale» si trova anche scrivendo «natàle». */
export const normalize = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Una serata corrisponde se ogni parola cercata compare nel suo nome o nel nome di una sua partita. */
export function matchesQuery(event: EventListItem, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize([event.name, ...event.matches.map((m) => m.name)].join("\n"));
  return words.every((w) => haystack.includes(w));
}

export interface EventGroup {
  activity: Activity;
  label: string;
  events: EventListItem[];
}

/** Conteggio per tipo, sulle serate che passano la ricerca: serve ai pulsanti-filtro. */
export function countByActivity(events: EventListItem[], query: string): Record<Activity, number> {
  const counts: Record<Activity, number> = { running: 0, live: 0, draft: 0, closed: 0 };
  for (const e of events) if (matchesQuery(e, query)) counts[activityOf(e)]++;
  return counts;
}

/**
 * Serate filtrate e raggruppate (in corso, attive, bozze, chiuse), ognuna dalla più recente. `only` limita a un solo
 * gruppo; i gruppi vuoti non compaiono.
 */
export function groupEvents(events: EventListItem[], query: string, only: Activity | "all" = "all"): EventGroup[] {
  const groups = ACTIVITIES.filter((a) => only === "all" || a === only).map((activity): EventGroup => ({ activity, label: ACTIVITY_LABEL[activity], events: [] }));
  for (const e of [...events].sort((a, b) => b.createdAt - a.createdAt)) {
    if (!matchesQuery(e, query)) continue;
    groups.find((g) => g.activity === activityOf(e))?.events.push(e);
  }
  return groups.filter((g) => g.events.length > 0);
}

export const MATCH_STATUS_LABEL = { pending: "da giocare", running: "in corso", done: "conclusa" } as const;
