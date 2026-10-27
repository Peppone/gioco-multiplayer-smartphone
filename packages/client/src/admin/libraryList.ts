import type { InstanceView, MinigameTypeView } from "@gioco/shared";
import { normalize } from "./eventList";

/** Famiglie in cui la libreria raggruppa i tipi di minigioco. L'ordine di questo elenco è quello in cui compaiono. */
export const CATEGORIES = ["quiz", "squadre", "coop", "azione", "content", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  quiz: "Quiz e domande",
  squadre: "Squadre e deduzione",
  coop: "Cooperativi",
  azione: "Azione e sfide",
  content: "Contenuti riusabili",
  other: "Altri",
};

export const CATEGORY_ICON: Record<Category, string> = {
  quiz: "❓",
  squadre: "🕵️",
  coop: "🤝",
  azione: "⚡",
  content: "📦",
  other: "🎲",
};

/** Famiglia di ogni tipo noto; un tipo nuovo, non ancora elencato qui, finisce in «Altri» (i contenuti restano sempre a parte). */
const CATEGORY_OF: Record<string, Category> = {
  "quiz-multipla": "quiz",
  "vero-falso": "quiz",
  stima: "quiz",
  sondaggio: "quiz",
  scalata: "quiz",
  buzzer: "quiz",
  "indovina-canzone": "quiz",
  "reazione-a-catena": "quiz",
  "agenti-segreti": "squadre",
  "lunghezza-onda": "squadre",
  "pianeta-nascosto": "squadre",
  "parole-mannare": "squadre",
  "stanze-segrete": "squadre",
  "stanze-col-botto": "squadre",
  artificieri: "coop",
  "pilota-cieco": "coop",
  "plancia-comando": "coop",
  "zombie-hunt": "azione",
  "caccia-fantasmi": "azione",
  "knight-duel": "azione",
  "shadow-tournament": "azione",
};

export function categoryOf(type: Pick<MinigameTypeView, "id" | "kind"> | undefined): Category {
  if (!type) return "other";
  if (type.kind === "content") return "content";
  return CATEGORY_OF[type.id] ?? "other";
}

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });
const byTitle = (a: string, b: string) => collator.compare(a, b);

/** Tipi ordinati per famiglia e poi per nome: servono ai pulsanti «+ Nuovo». */
export function groupTypes(types: MinigameTypeView[]): { category: Category; label: string; types: MinigameTypeView[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    types: types.filter((t) => categoryOf(t) === category).sort((a, b) => byTitle(a.title, b.title)),
  })).filter((g) => g.types.length > 0);
}

/** Un'istanza corrisponde se ogni parola cercata compare nel suo titolo, nel nome del tipo o nel tema. */
export function matchesInstance(instance: InstanceView, type: MinigameTypeView | undefined, themeLabel: string, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize([instance.title, type?.title ?? instance.typeId, themeLabel].join("\n"));
  return words.every((w) => haystack.includes(w));
}

export interface InstanceGroup {
  category: Category;
  label: string;
  instances: InstanceView[];
}

/** Conteggio per famiglia, sulle istanze che passano la ricerca: serve ai pulsanti-filtro. */
export function countByCategory(
  instances: InstanceView[],
  typeOf: (id: string) => MinigameTypeView | undefined,
  themeLabel: (i: InstanceView) => string,
  query: string,
): Record<Category, number> {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const i of instances) if (matchesInstance(i, typeOf(i.typeId), themeLabel(i), query)) counts[categoryOf(typeOf(i.typeId))]++;
  return counts;
}

/**
 * Istanze filtrate e raggruppate per famiglia; dentro ogni famiglia stanno vicine quelle dello stesso tipo (per nome del
 * tipo) e poi in ordine alfabetico di titolo. `only` limita a una sola famiglia; le famiglie vuote non compaiono.
 */
export function groupInstances(
  instances: InstanceView[],
  typeOf: (id: string) => MinigameTypeView | undefined,
  themeLabel: (i: InstanceView) => string,
  query: string,
  only: Category | "all" = "all",
): InstanceGroup[] {
  const typeTitle = (i: InstanceView) => typeOf(i.typeId)?.title ?? i.typeId;
  const sorted = [...instances].sort((a, b) => byTitle(typeTitle(a), typeTitle(b)) || byTitle(a.title, b.title));
  return CATEGORIES.filter((c) => only === "all" || c === only)
    .map((category): InstanceGroup => ({
      category,
      label: CATEGORY_LABEL[category],
      instances: sorted.filter((i) => categoryOf(typeOf(i.typeId)) === category && matchesInstance(i, typeOf(i.typeId), themeLabel(i), query)),
    }))
    .filter((g) => g.instances.length > 0);
}
