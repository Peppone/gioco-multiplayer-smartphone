import { type JsonSchema, defaultValue, moveItem, setKey } from "./logic";

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
            <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
              {schema.enum.map((o) => <option key={String(o)}>{String(o)}</option>)}
            </select>
          </label>
        );
      }
      return (
        <label className="field">
          <span className="label">{labelText}</span>
          {schema.widget === "textarea" ? (
            <textarea rows={2} value={String(value ?? "")} maxLength={schema.maxLength} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input value={String(value ?? "")} maxLength={schema.maxLength} onChange={(e) => onChange(e.target.value)} />
          )}
          <Hint schema={schema} />
        </label>
      );
  }
}

function ArrayField({ schema, value, onChange, label, required }: FieldProps) {
  const list = Array.isArray(value) ? value : [];
  const itemSchema = schema.items ?? {};
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
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="schema-form">
      <ObjectFields schema={schema} value={(value as Record<string, unknown>) ?? {}} onChange={onChange} />
    </div>
  );
}
