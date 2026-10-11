/** Sottoinsieme di JSON Schema prodotto da `z.toJSONSchema` per i `configSchema` dei minigiochi. */
export interface JsonSchema {
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean";
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  /** Suggerimenti di interfaccia aggiunti dai plugin con `.meta()`. */
  widget?: "textarea" | "optionIndex";
  optionsKey?: string;
  itemLabel?: string;
}

/** Valore iniziale per un nuovo elemento: rispetta default, minimi e campi obbligatori. */
export function defaultValue(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.enum?.length) return schema.enum[0];
  switch (schema.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const key of schema.required ?? []) {
        const prop = schema.properties?.[key];
        if (prop) out[key] = defaultValue(prop);
      }
      return out;
    }
    case "array":
      return Array.from({ length: schema.minItems ?? 0 }, () => defaultValue(schema.items ?? {}));
    case "integer":
    case "number":
      return Math.max(schema.minimum ?? 0, 0);
    case "boolean":
      return false;
    default:
      return "";
  }
}

/** Sposta un elemento di una posizione (`-1` su, `+1` giù); restituisce un nuovo array. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[to]] = [copy[to]!, copy[index]!];
  return copy;
}

/** Aggiorna `key` di un oggetto; con `undefined` la chiave viene rimossa (campo opzionale svuotato). */
export function setKey(obj: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const copy = { ...obj };
  if (value === undefined) delete copy[key];
  else copy[key] = value;
  return copy;
}

// ---- Import / export di un'istanza ----

export const EXPORT_KIND = "gioco-ros/instance";

export interface ExportedInstance {
  kind: typeof EXPORT_KIND;
  version: 1;
  typeId: string;
  title: string;
  theme?: string;
  config: unknown;
}

export function serializeInstance(i: { typeId: string; title: string; theme?: string; config: unknown }): string {
  const out: ExportedInstance = {
    kind: EXPORT_KIND,
    version: 1,
    typeId: i.typeId,
    title: i.title,
    theme: i.theme,
    config: i.config,
  };
  return JSON.stringify(out, null, 2);
}

export type ImportResult =
  | { ok: true; instances: { typeId: string; title: string; theme?: string; config: unknown }[] }
  | { ok: false; error: string };

/** Accetta un file di un'istanza o di una libreria intera (array); la validazione vera la fa il server. */
export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Il file non è un JSON valido." };
  }
  const list = Array.isArray(data) ? data : [data];
  const instances: { typeId: string; title: string; theme?: string; config: unknown }[] = [];
  for (const item of list) {
    const o = item as Partial<ExportedInstance> | null;
    if (!o || typeof o !== "object" || o.kind !== EXPORT_KIND) {
      return { ok: false, error: "Il file non è un export di Gioco Ros." };
    }
    if (typeof o.typeId !== "string" || typeof o.title !== "string" || o.config === undefined) {
      return { ok: false, error: "Il file è incompleto (servono tipo, titolo e configurazione)." };
    }
    instances.push({ typeId: o.typeId, title: o.title, theme: o.theme, config: o.config });
  }
  if (instances.length === 0) return { ok: false, error: "Il file non contiene istanze." };
  return { ok: true, instances };
}
