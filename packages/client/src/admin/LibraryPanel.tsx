import { useCallback, useEffect, useState } from "react";
import type { InstanceView, MinigameTypeView } from "@gioco/shared";
import { ApiError, api, errorMessage } from "./api";

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

/** Libreria delle istanze di minigioco. L'editor a form arriverà in F4: per ora la config è JSON. */
export function LibraryPanel({ onAuthLost }: { onAuthLost: () => void }) {
  const [types, setTypes] = useState<MinigameTypeView[]>([]);
  const [instances, setInstances] = useState<InstanceView[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [typeId, setTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [configText, setConfigText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, i] = await Promise.all([
        api<MinigameTypeView[]>("GET", "/minigame-types"),
        api<InstanceView[]>("GET", "/instances"),
      ]);
      setTypes(t);
      setInstances(i);
      setTypeId((cur) => cur || t[0]?.id || "");
    } catch (e) {
      setError(errorMessage(e));
      onAuthLost();
    }
  }, [onAuthLost]);

  useEffect(() => void load(), [load]);

  // Cambiando tipo (in creazione) si precompila un esempio valido.
  useEffect(() => {
    if (editing) return;
    const t = types.find((x) => x.id === typeId);
    if (t) setConfigText(pretty(t.sampleConfig));
  }, [typeId, types, editing]);

  const reset = () => {
    setEditing(null);
    setTitle("");
    const t = types.find((x) => x.id === typeId);
    setConfigText(t ? pretty(t.sampleConfig) : "");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let config: unknown;
    try {
      config = JSON.parse(configText);
    } catch {
      return setError("La configurazione non è un JSON valido.");
    }
    try {
      if (editing) await api("PUT", `/instances/${editing}`, { typeId, title, config });
      else await api("POST", "/instances", { typeId, title, config });
      reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid" ? `Configurazione non valida: ${err.detail ?? ""}` : errorMessage(err));
    }
  };

  const edit = (i: InstanceView) => {
    setEditing(i.id);
    setTypeId(i.typeId);
    setTitle(i.title);
    setConfigText(pretty(i.config));
  };

  const remove = async (i: InstanceView) => {
    if (!confirm(`Eliminare «${i.title}»?`)) return;
    setError(null);
    try {
      await api("DELETE", `/instances/${i.id}`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const typeTitle = (id: string) => types.find((t) => t.id === id)?.title ?? id;

  return (
    <section className="panel">
      <h2>Libreria minigiochi</h2>
      <form className="profile-form wide" onSubmit={submit}>
        <h3>{editing ? "Modifica istanza" : "Nuova istanza"}</h3>
        <div className="row">
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={editing !== null}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo (es. Quiz anni 80)" maxLength={80} required />
        </div>
        <textarea value={configText} onChange={(e) => setConfigText(e.target.value)} rows={14} spellCheck={false} />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="primary" type="submit">{editing ? "Salva" : "Crea"}</button>
          {editing && <button type="button" onClick={reset}>Annulla</button>}
        </div>
      </form>

      <ul className="list">
        {instances.map((i) => (
          <li key={i.id}>
            <span>{i.title} <small className="muted">· {typeTitle(i.typeId)}</small></span>
            <span className="row">
              <button onClick={() => edit(i)}>Modifica</button>
              <button onClick={() => void remove(i)}>Elimina</button>
            </span>
          </li>
        ))}
        {instances.length === 0 && <li className="muted">Nessuna istanza: creane una qui sopra.</li>}
      </ul>
    </section>
  );
}
