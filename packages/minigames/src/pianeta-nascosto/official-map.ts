import { z } from "zod";
import { type Clue, type ConferenceClue, type ResearchClue, clueHolds, clueLabel, isConferenceClue } from "./clues.js";
import { type Body, type Mode, type ObjectKind, type Seen, BODIES, modeOf, placementErrors } from "./sky.js";

/**
 * Lettura degli schemi dell'app ufficiale (un file JSON per codice partita, es. `J9B3.json`), per l'import locale
 * facoltativo del piano. Gli schemi non stanno nel progetto: li fornisce chi ha l'app. Funzioni pure: la lettura dei
 * file spetta a chi chiama.
 *
 * Formato: `obj` (settore → codice oggetto), `conf` (ricerche A–F e conferenze X1/X2, ognuna con `title` e `body`
 * `{ type, X, Y, N }`), `info` (fatti iniziali: serie A–E, ognuna con 3 blocchi di 4 fatti `{ settore: oggetto }`,
 * da leggere come «il settore non contiene l'oggetto»), `solo` facoltativo (mosse del bot dell'app: ignorato, il
 * nostro bot è diverso).
 */

const OBJECT_CODES: Record<number, ObjectKind> = { 0: "empty", 1: "asteroid", 2: "dwarf", 3: "comet", 4: "gas", 9: "planetX" };

const codeSchema = z.number().int();

const rawMapSchema = z.object({
  obj: z.record(z.string().regex(/^\d+$/), codeSchema),
  conf: z.record(
    z.string(),
    z.object({
      title: z.array(codeSchema),
      body: z.object({ type: z.string(), X: codeSchema.nullable(), Y: codeSchema.nullable(), N: codeSchema.nullable().optional() }),
    }),
  ),
  info: z.record(z.string(), z.record(z.string(), z.array(z.record(z.string().regex(/^\d+$/), codeSchema)))),
  solo: z.unknown().optional(),
});

type RawBody = z.infer<typeof rawMapSchema>["conf"][string]["body"];

export const RESEARCH_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
export type ResearchLetter = (typeof RESEARCH_LETTERS)[number];

export interface StartingFact {
  sector: number;
  /** Il corpo celeste che quel settore non contiene. */
  absent: Body;
}

export interface ImportedSystem {
  code: string;
  mode: Mode;
  /** Il settore n è all'indice n − 1. */
  sky: ObjectKind[];
  research: { letter: ResearchLetter; clue: ResearchClue }[];
  conferences: { id: "X1" | "X2"; clue: ConferenceClue }[];
  /** Fatti iniziali: una serie per osservatorio (fino a 5), 3 blocchi da 4 fatti; il livello ne usa 3, 2, 1 o 0. */
  facts: StartingFact[][][];
}

/** `warnings`: incoerenze innocue dello schema (es. etichetta diversa dalla regola: vale la regola). */
export type ParseResult = { ok: true; system: ImportedSystem; warnings: string[] } | { ok: false; errors: string[] };

/** Il codice partita dal nome del file (`J9B3.json` → `J9B3`), oppure null se il nome non è uno schema. */
export function officialCodeFromFileName(fileName: string): string | null {
  const m = /^([A-Z0-9]{4})\.json$/i.exec(fileName.replace(/^.*[\\/]/, ""));
  return m ? m[1]!.toUpperCase() : null;
}

/** Converte il `body` di una regola dell'app nella nostra regola strutturata (null se il tipo non è noto). */
function toClue(body: RawBody, object: (code: number | null) => ObjectKind | null): Clue | null {
  const a = object(body.X);
  const b = object(body.Y);
  const n = body.N ?? null;
  const isBody = (k: ObjectKind | null): k is Body => k !== null && (BODIES as ObjectKind[]).includes(k);
  const isSeen = (k: ObjectKind | null): k is Seen => isBody(k) || k === "empty";
  const subject = isBody(a) ? a : null;
  const pair = <K extends string>(kind: K) => (subject && isSeen(b) ? { kind, a: subject, b } : null);
  const pairN = <K extends string>(kind: K) => (subject && isSeen(b) && n !== null ? { kind, a: subject, b, n } : null);
  const toX = a === "planetX" && isSeen(b);
  switch (body.type) {
    case "confClue1PlusXAdjacentY":
      return pair("someAdjacent");
    case "confClueNoXWithin1Y":
      return pair("noneAdjacent");
    case "confClueAllXWithin1Y":
      return pair("allAdjacent");
    case "confClueAllXWithinNY":
      return pairN("allWithin");
    case "confClueNoXWithinNY":
      return pairN("noneWithin");
    case "confClue1PlusXOppositeY":
      return pair("someOpposite");
    case "confClueNoXOppositeY":
      return pair("noneOpposite");
    case "confClueAllXOppositeY":
      return pair("allOpposite");
    case "confClueAllXWithinN":
      return subject && n !== null ? { kind: "band", a: subject, n } : null;
    case "confClueAllXConsecutive":
      return subject ? { kind: "allConsecutive", a: subject } : null;
    case "confClueNXConsecutive":
      return subject && n !== null ? { kind: "someConsecutive", a: subject, n } : null;
    case "confClue9WithinNY":
      return toX && n !== null ? { kind: "xWithin", b: b as Seen, n } : null;
    case "confClue9NotWithinNY":
      return toX && n !== null ? { kind: "xNotWithin", b: b as Seen, n } : null;
    // Nell'app è sempre «non è adiacente», anche quando N vale 2.
    case "confClue9NotWithin1Y":
      return toX ? { kind: "xNotAdjacent", b: b as Seen } : null;
    case "confClue9NotOppositeY":
      return toX ? { kind: "xNotOpposite", b: b as Seen } : null;
    default:
      return null;
  }
}

/**
 * Legge e controlla uno schema dell'app: formato, regole di posizione, regole vere nel sistema, etichette coerenti,
 * fatti iniziali veri. Uno schema con un solo errore viene rifiutato per intero.
 */
export function parseOfficialMap(code: string, json: unknown): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!/^[A-Z0-9]{4}$/.test(code)) errors.push(`codice partita non valido: «${code}»`);
  const parsed = rawMapSchema.safeParse(json);
  if (!parsed.success) return { ok: false, errors: [...errors, ...parsed.error.issues.map((i) => `formato: ${i.path.join(".")} ${i.message}`)] };
  const raw = parsed.data;

  const object = (c: number | null): ObjectKind | null => (c === null ? null : (OBJECT_CODES[c] ?? null));

  // Sistema solare: settori da 1 a N, tutti presenti.
  const size = Object.keys(raw.obj).length;
  const mode = modeOf(size);
  if (!mode) return { ok: false, errors: [...errors, `numero di settori non valido: ${size}`] };
  const sky: ObjectKind[] = [];
  let skyOk = true;
  for (let s = 1; s <= size; s++) {
    const kind = object(raw.obj[String(s)] ?? null);
    if (!kind) {
      errors.push(`settore ${s}: oggetto mancante o sconosciuto`);
      skyOk = false;
    }
    sky.push(kind ?? "empty");
  }
  if (skyOk) {
    const placement = placementErrors(sky);
    errors.push(...placement.map((e) => `regole di posizione: ${e}`));
    skyOk = placement.length === 0;
  }

  // Ricerche A–F e conferenze (X1, più X2 in Esperto).
  const expected = [...RESEARCH_LETTERS, ...(mode === "expert" ? ["X1", "X2"] : ["X1"])];
  const extra = Object.keys(raw.conf).filter((k) => !expected.includes(k));
  if (extra.length > 0) errors.push(`regole inattese: ${extra.join(", ")}`);
  const research: ImportedSystem["research"] = [];
  const conferences: ImportedSystem["conferences"] = [];
  for (const key of expected) {
    const entry = raw.conf[key];
    if (!entry) {
      errors.push(`${key}: mancante`);
      continue;
    }
    const clue = toClue(entry.body, object);
    if (!clue) {
      errors.push(`${key}: regola non riconosciuta (${entry.body.type})`);
      continue;
    }
    const conference = key.startsWith("X");
    if (conference !== isConferenceClue(clue)) {
      errors.push(`${key}: ${conference ? "una conferenza deve riguardare il Pianeta X" : "una ricerca non può riguardare il Pianeta X"}`);
      continue;
    }
    const title = [...new Set(entry.title.map(object))];
    const label = clueLabel(clue);
    if (title.length !== label.length || !label.every((k) => title.includes(k))) {
      warnings.push(`${key}: l'etichetta dell'app non corrisponde alla regola, si usa quella ricavata dalla regola`);
    }
    if (skyOk && !clueHolds(clue, sky)) errors.push(`${key}: la regola non vale nel sistema`);
    if (conference) conferences.push({ id: key as "X1" | "X2", clue: clue as ConferenceClue });
    else research.push({ letter: key as ResearchLetter, clue: clue as ResearchClue });
  }

  // Fatti iniziali: ogni serie ha 3 blocchi da 4 fatti, tutti veri e solo sui quattro corpi celesti.
  const facts: StartingFact[][][] = [];
  for (const [slot, blocks] of Object.entries(raw.info).sort(([x], [y]) => x.localeCompare(y))) {
    const series: StartingFact[][] = [];
    for (const blockKey of ["1", "2", "3"]) {
      const block = blocks[blockKey];
      if (!block || block.length !== 4) {
        errors.push(`fatti ${slot}.${blockKey}: servono 4 fatti`);
        continue;
      }
      series.push(
        block.map((entry) => {
          const [sectorText, code] = Object.entries(entry)[0] ?? ["0", -1];
          const sector = Number(sectorText);
          const absent = object(code);
          if (Object.keys(entry).length !== 1 || sector < 1 || sector > size || !absent || !(BODIES as ObjectKind[]).includes(absent)) {
            errors.push(`fatti ${slot}.${blockKey}: fatto non valido ${JSON.stringify(entry)}`);
          } else if (skyOk && sky[sector - 1] === absent) {
            errors.push(`fatti ${slot}.${blockKey}: il settore ${sector} contiene proprio ${absent}`);
          }
          return { sector, absent: absent as Body };
        }),
      );
    }
    facts.push(series);
  }
  if (facts.length === 0) errors.push("nessun fatto iniziale");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, system: { code, mode, sky, research, conferences, facts }, warnings };
}
