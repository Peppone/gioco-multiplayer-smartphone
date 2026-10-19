import { createContext, useContext, useEffect, useState } from "react";
import type { MediaItem } from "@gioco/shared";
import { api, errorMessage, uploadAudio } from "../api";
import { type JsonSchema, defaultValue, moveItem, setKey } from "./logic";

/** Dati esterni al modulo, per i widget che scelgono elementi esistenti (sfidanti, istanze della libreria). */
export interface FormContext {
  teams: { id: string; name: string }[];
  players: { id: string; nickname: string }[];
  instances: { id: string; title: string; kind: "minigame" | "content"; typeId: string }[];
}
const FormCtx = createContext<FormContext>({ teams: [], players: [], instances: [] });

interface FieldProps {
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
  required: boolean;
  /** Valori dei campi fratelli, per i widget che dipendono da altri campi (es. scelta tra le risposte). */
  siblings: Record<string, unknown>;
}

function Hint({ schema }: { schema: JsonSchema }) {
  return schema.description ? <small className="muted hint">{schema.description}</small> : null;
}

function Field({ schema, value, onChange, label, required, siblings }: FieldProps) {
  const labelText = `${label}${required ? "" : " (facoltativo)"}`;

  if ((schema.widget === "contestant" || schema.widget === "instance") && schema.type !== "array") {
    return <PickField schema={schema} value={value} onChange={onChange} labelText={labelText} required={required} siblings={siblings} />;
  }

  if (schema.widget === "audio") {
    return <AudioField schema={schema} value={value} onChange={onChange} labelText={labelText} />;
  }

  if (schema.widget === "optionIndex") {
    const options = (siblings[schema.optionsKey ?? ""] as string[] | undefined) ?? [];
    return (
      <div className="field">
        <span className="label">{labelText}</span>
        <div className="radios">
          {options.map((text, i) => (
            <label key={i} className={value === i ? "on" : ""}>
              <input type="radio" checked={value === i} onChange={() => onChange(i)} />
              {String.fromCharCode(65 + i)}: {text || <em className="muted">(vuota)</em>}
            </label>
          ))}
        </div>
      </div>
    );
  }

  switch (schema.type) {
    case "object":
      return (
        <fieldset className="field object">
          {label && <legend>{label}</legend>}
          <ObjectFields schema={schema} value={(value as Record<string, unknown>) ?? {}} onChange={onChange} />
        </fieldset>
      );

    case "array":
      return <ArrayField {...{ schema, value, onChange, label, required, siblings }} />;

    case "boolean":
      return (
        <label className="field check">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {label}
        </label>
      );

    case "integer":
    case "number":
      return (
        <label className="field">
          <span className="label">{labelText}</span>
          <input
            type="number"
            aria-label={labelText}
            inputMode="numeric"
            step={schema.type === "integer" ? 1 : "any"}
            min={schema.minimum}
            max={schema.maximum}
            value={typeof value === "number" ? value : ""}
            // Campo svuotato = valore assente: per i facoltativi vale il predefinito, per gli altri decide il server.
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
          <Hint schema={schema} />
        </label>
      );

    default:
      if (schema.enum) {
        return (
          <label className="field">
            <span className="label">{labelText}</span>
            <select aria-label={labelText} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
              {schema.enum.map((o) => (
                <option key={String(o)} value={String(o)}>{schema.enumLabels?.[String(o)] ?? String(o)}</option>
              ))}
            </select>
          </label>
        );
      }
      return (
        <label className="field">
          <span className="label">{labelText}</span>
          {schema.widget === "textarea" ? (
            <textarea aria-label={labelText} rows={2} value={String(value ?? "")} maxLength={schema.maxLength} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input aria-label={labelText} value={String(value ?? "")} maxLength={schema.maxLength} onChange={(e) => onChange(e.target.value)} />
          )}
          <Hint schema={schema} />
        </label>
      );
  }
}

/** Brano audio: si carica un file dal computer della regia oppure si sceglie tra quelli già caricati. */
function AudioField({ schema, value, onChange, labelText }: Pick<FieldProps, "schema" | "value" | "onChange"> & { labelText: string }) {
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = typeof value === "string" && value !== "" ? value : null;

  useEffect(() => {
    api<MediaItem[]>("GET", "/media").then(setLibrary, () => undefined);
  }, []);

  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      const item = await uploadAudio(picked);
      setLibrary((l) => [item, ...l]);
      onChange(item.file);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const current = library.find((m) => m.file === file);
  return (
    <div className="field audio-field">
      <span className="label">{labelText}</span>
      <input type="file" accept="audio/*" aria-label={`Carica ${labelText}`} disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      {busy && <small className="muted">Caricamento in corso…</small>}
      {library.length > 0 && (
        <select aria-label={`Scegli ${labelText} già caricato`} value={file ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}>
          <option value="">{file && !current ? "(file non trovato)" : "Scegli tra i brani caricati…"}</option>
          {library.map((m) => <option key={m.file} value={m.file}>{m.name}</option>)}
        </select>
      )}
      {file && current && <audio controls preload="none" src={`/media/${file}`} aria-label="Anteprima" />}
      {file && !current && <small className="hint" role="alert">Questo file non è nella mediateca (è un esempio): carica un brano oppure rimuovilo.</small>}
      {file && <button type="button" onClick={() => onChange(undefined)}>Rimuovi il file</button>}
      {error && <small className="hint" role="alert">{error}</small>}
      <Hint schema={schema} />
    </div>
  );
}

/** Selezione di un elemento esistente: uno sfidante della serata o un'istanza della libreria. */
function PickField({ schema, value, onChange, labelText, required, siblings }: Pick<FieldProps, "schema" | "value" | "onChange" | "required" | "siblings"> & { labelText: string }) {
  const ctx = useContext(FormCtx);
  let options: { id: string; label: string }[];
  if (schema.widget === "contestant") {
    options = siblings.kind === "players" ? ctx.players.map((p) => ({ id: p.id, label: p.nickname })) : ctx.teams.map((t) => ({ id: t.id, label: t.name }));
  } else {
    const wanted = schema.instanceKind === "deck" || schema.instanceKind === "word-list" ? "content" : "minigame";
    options = ctx.instances.filter((i) => i.kind === wanted && (wanted === "minigame" || i.typeId === schema.instanceKind)).map((i) => ({ id: i.id, label: i.title }));
  }
  return (
    <label className="field">
      <span className="label">{labelText}</span>
      <select aria-label={labelText} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value === "" && !required ? undefined : e.target.value)}>
        <option value="">{required ? "Scegli…" : "Predefinito"}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <Hint schema={schema} />
    </label>
  );
}

/** Righe di un elenco di testi: vuote e spazi agli estremi non contano. */
export const parseLines = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

/**
 * Elenco di testi brevi (es. parole) in un'area di testo, uno per riga: si aggiunge scrivendo o incollando un elenco
 * intero, si corregge sul posto. Sotto: quante sono, i doppioni (maiuscole e accenti a parte) e quelle troppo lunghe.
 */
function LinesField({ schema, value, onChange, label, required }: FieldProps) {
  const list = Array.isArray(value) ? (value as unknown[]).map(String) : [];
  // Il testo resta quello scritto (righe vuote comprese) finché corrisponde al valore: così si può andare a capo.
  const [text, setText] = useState(list.join("\n"));
  useEffect(() => {
    if (parseLines(text).join("\n") !== list.join("\n")) setText(list.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.join("\n")]);
  const key = (w: string) => w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const seen = new Set<string>();
  const dups = [...new Set(list.filter((w) => seen.has(key(w)) || !seen.add(key(w))))];
  const max = schema.items?.maxLength;
  const long = max ? list.filter((w) => w.length > max) : [];
  const labelText = `${label}${required ? "" : " (facoltativo)"}`;
  return (
    <div className="field lines">
      <span className="label">
        {labelText} <small className="muted" data-testid="lines-count">({list.length})</small>
      </span>
      <textarea
        aria-label={labelText}
        rows={Math.min(14, Math.max(4, list.length + 1))}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseLines(e.target.value));
        }}
      />
      <small className="muted hint">Una per riga{schema.description ? ` · ${schema.description}` : ""}</small>
      {list.length > 0 && (
        <button
          type="button"
          className="lines-export"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`${list.join("\n")}\n`], { type: "text/plain;charset=utf-8" }));
            const a = Object.assign(document.createElement("a"), { href: url, download: `${(label || "elenco").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt` });
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Scarica come testo (.txt)
        </button>
      )}
      {dups.length > 0 && <small className="hint" role="alert">Doppioni (contano una volta): {dups.slice(0, 8).join(", ")}{dups.length > 8 ? "…" : ""}</small>}
      {long.length > 0 && <small className="hint" role="alert">Più lunghe di {max} caratteri: {long.slice(0, 5).join(", ")}{long.length > 5 ? "…" : ""}</small>}
      {schema.maxItems !== undefined && list.length > schema.maxItems && <small className="hint" role="alert">Al massimo {schema.maxItems}</small>}
    </div>
  );
}

function ArrayField(props: FieldProps) {
  if (props.schema.widget === "lines") return <LinesField {...props} />;
  const { schema, value, onChange, label, required } = props;
  const list = Array.isArray(value) ? value : [];
  // Un widget dichiarato sull'array (es. «instance») vale per ciascun elemento.
  const itemSchema: JsonSchema = { ...(schema.items ?? {}), ...(schema.widget ? { widget: schema.widget, instanceKind: schema.instanceKind } : {}) };
  const min = schema.minItems ?? 0;
  const itemName = schema.itemLabel ?? "Elemento";
  const isObject = itemSchema.type === "object";

  return (
    <fieldset className="field array">
      <legend>
        {label}
        {!required && " (facoltativo)"} <small className="muted">({list.length})</small>
      </legend>
      {list.map((item, i) => (
        <div key={i} className={`item ${isObject ? "card" : "inline"}`}>
          <div className="item-head">
            {isObject && <b>{itemName} {i + 1}</b>}
            <span className="tools">
              <button type="button" disabled={i === 0} onClick={() => onChange(moveItem(list, i, -1))} aria-label="Sposta su">↑</button>
              <button type="button" disabled={i === list.length - 1} onClick={() => onChange(moveItem(list, i, 1))} aria-label="Sposta giù">↓</button>
              <button type="button" disabled={list.length <= min} onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Elimina">✕</button>
            </span>
          </div>
          <Field
            schema={itemSchema}
            value={item}
            label={isObject ? "" : `${itemName} ${i + 1}`}
            required
            siblings={isObject ? (item as Record<string, unknown>) : {}}
            onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))}
          />
        </div>
      ))}
      <button
        type="button"
        disabled={schema.maxItems !== undefined && list.length >= schema.maxItems}
        onClick={() => onChange([...list, defaultValue(itemSchema)])}
      >
        + Aggiungi {itemName.toLowerCase()}
      </button>
    </fieldset>
  );
}

function ObjectFields({
  schema,
  value,
  onChange,
}: {
  schema: JsonSchema;
  value: Record<string, unknown>;
  onChange: (v: unknown) => void;
}) {
  const required = new Set(schema.required ?? []);
  return (
    <>
      {Object.entries(schema.properties ?? {}).map(([key, prop]) => (
        <Field
          key={key}
          schema={prop}
          value={value[key] ?? prop.default}
          label={prop.title ?? key}
          required={required.has(key) || prop.default !== undefined}
          siblings={value}
          onChange={(v) => onChange(setKey(value, key, v))}
        />
      ))}
    </>
  );
}

/** Form generato da un JSON Schema (derivato dal `configSchema` zod del plugin). */
export function SchemaForm({
  schema,
  value,
  onChange,
  context,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  context?: FormContext;
}) {
  return (
    <FormCtx.Provider value={context ?? { teams: [], players: [], instances: [] }}>
      <div className="schema-form">
        <ObjectFields schema={schema} value={(value as Record<string, unknown>) ?? {}} onChange={onChange} />
      </div>
    </FormCtx.Provider>
  );
}
