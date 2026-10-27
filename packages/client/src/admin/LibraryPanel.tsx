import { useCallback, useEffect, useMemo, useState } from "react";
import type { InstanceView, MinigameTypeView, TestSessionInfo, ThemeId } from "@gioco/shared";
import { ApiError, api, errorMessage } from "./api";
import { CATEGORIES, CATEGORY_ICON, CATEGORY_LABEL, type Category, countByCategory, groupInstances, groupTypes } from "./libraryList";
import { PianetaSchemiPanel } from "./PianetaSchemiPanel";
import { SchemaForm } from "./schema-form/SchemaForm";
import { type JsonSchema, defaultValue, parseImport, serializeInstance } from "./schema-form/logic";

const THEMES: { id: ThemeId; label: string }[] = [
  { id: "gameshow", label: "Game show" },
  { id: "pixel", label: "Pixel art" },
  { id: "manga", label: "Manga" },
  { id: "retro80", label: "Retro anni 80" },
  { id: "boom", label: "Boom" },
];

const themeLabel = (i: InstanceView) => THEMES.find((t) => t.id === i.theme)?.label ?? i.theme;

const pretty =(v: unknown) => JSON.stringify(v, null, 2);

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "istanza";

interface Draft {
  id: string | null; // null = nuova istanza
  typeId: string;
  title: string;
  theme: ThemeId;
  config: unknown;
}

/** Telefoni di prova proposti per un minigioco: sei, entro i suoi limiti. */
const suggestedPlayers = (t: MinigameTypeView | undefined): number => Math.min(Math.max(6, t?.minPlayers ?? 1), t?.maxPlayers ?? 30, 30);

/** Libreria delle istanze di minigioco: form generato dal `configSchema` del plugin, import/export JSON, prova rapida. */
export function LibraryPanel({ onAuthLost, onTest }: { onAuthLost: () => void; onTest: (session: TestSessionInfo) => void }) {
  const [types, setTypes] = useState<MinigameTypeView[]>([]);
  const [instances, setInstances] = useState<InstanceView[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Istanza di cui si sta preparando la prova rapida, con i suoi parametri. */
  const [testing, setTesting] = useState<{ id: string; players: number; teams: boolean; busy: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, i] = await Promise.all([
        api<MinigameTypeView[]>("GET", "/minigame-types"),
        api<InstanceView[]>("GET", "/instances"),
      ]);
      setTypes(t);
      setInstances(i);
    } catch (e) {
      setError(errorMessage(e));
      onAuthLost();
    }
  }, [onAuthLost]);

  useEffect(() => void load(), [load]);

  const typeOf = (id: string) => types.find((t) => t.id === id);

  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<Category | "all">("all");
  // Rifare i raggruppamenti serve solo quando cambiano i dati o i filtri.
  const typeGroups = useMemo(() => groupTypes(types), [types]);
  const counts = useMemo(
    () => countByCategory(instances, (id) => types.find((t) => t.id === id), themeLabel, query),
    [instances, types, query],
  );
  const groups = useMemo(
    () => groupInstances(instances, (id) => types.find((t) => t.id === id), themeLabel, query, only),
    [instances, types, query, only],
  );
  const totalCount = CATEGORIES.reduce((n, c) => n + counts[c], 0);

  const newDraft = (typeId: string) => {
    const t = typeOf(typeId);
    if (!t) return;
    // Parte dall'esempio del plugin: è già valido e mostra come compilare i campi.
    setDraft({ id: null, typeId, title: "", theme: t.defaultTheme, config: structuredClone(t.draftConfig ?? t.sampleConfig) });
    setMode("form");
    setError(null);
    setNotice(null);
  };

  const openInstance = (i: InstanceView) => {
    setDraft({ id: i.id, typeId: i.typeId, title: i.title, theme: i.theme, config: structuredClone(i.config) });
    setMode("form");
    setError(null);
    setNotice(null);
  };

  const switchMode = (next: "form" | "json") => {
    if (!draft || next === mode) return;
    setError(null);
    if (next === "json") {
      setJsonText(pretty(draft.config));
    } else {
      try {
        setDraft({ ...draft, config: JSON.parse(jsonText) });
      } catch {
        return setError("Il JSON non è valido: correggilo prima di tornare al form.");
      }
    }
    setMode(next);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    setNotice(null);
    let config = draft.config;
    if (mode === "json") {
      try {
        config = JSON.parse(jsonText);
      } catch {
        return setError("Il JSON non è valido.");
      }
    }
    const body = { typeId: draft.typeId, title: draft.title, theme: draft.theme, config };
    try {
      if (draft.id) await api("PUT", `/instances/${draft.id}`, body);
      else await api("POST", "/instances", body);
      setNotice("Salvato.");
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "invalid" ? `Controlla i dati: ${err.detail ?? ""}` : errorMessage(err));
    }
  };

  const remove = async (i: InstanceView) => {
    if (!confirm(`Eliminare «${i.title}»?`)) return;
    setError(null);
    try {
      await api("DELETE", `/instances/${i.id}`);
      if (draft?.id === i.id) setDraft(null);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const duplicate = async (i: InstanceView) => {
    setError(null);
    try {
      await api("POST", "/instances", { typeId: i.typeId, title: `${i.title} (copia)`, theme: i.theme, config: i.config });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const startTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testing) return;
    setError(null);
    setTesting({ ...testing, busy: true });
    try {
      const session = await api<TestSessionInfo>("POST", "/test-session", { instanceId: testing.id, players: testing.players, teams: testing.teams });
      setTesting(null);
      onTest(session);
    } catch (err) {
      setTesting((t) => t && { ...t, busy: false });
      setError(errorMessage(err));
    }
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setNotice(null);
    let created = 0;
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      const parsed = parseImport(await file.text());
      if (!parsed.ok) {
        problems.push(`${file.name}: ${parsed.error}`);
        continue;
      }
      for (const inst of parsed.instances) {
        try {
          await api("POST", "/instances", inst);
          created++;
        } catch (err) {
          problems.push(`«${inst.title}»: ${errorMessage(err)}`);
        }
      }
    }
    await load();
    setNotice(`Importate ${created} istanze.`);
    if (problems.length) setError(problems.join(" · "));
  };

  const current = draft ? typeOf(draft.typeId) : undefined;

  return (
    <section className="panel library">
      <h2>Libreria minigiochi</h2>

      <details className="lib-create" open>
        <summary>Crea una nuova istanza</summary>
        {typeGroups.map((g) => (
          <div key={g.category} className="lib-create-group" role="group" aria-label={g.label}>
            <span className="lib-create-label">{CATEGORY_ICON[g.category]} {g.label}</span>
            <span className="row">
              {g.types.map((t) => (
                <button key={t.id} className="primary" onClick={() => newDraft(t.id)}>+ {t.title}</button>
              ))}
            </span>
          </div>
        ))}
      </details>

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {draft && current && (
        <form className="editor" onSubmit={save}>
          <h3>{draft.id ? "Modifica" : "Nuova istanza"}: {current.title}</h3>
          <div className="row">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Titolo (es. Quiz anni 80)"
              maxLength={80}
              required
            />
            <select value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value as ThemeId })} aria-label="Tema">
              {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div className="row tabs">
            <button type="button" className={mode === "form" ? "primary" : ""} onClick={() => switchMode("form")}>Modulo</button>
            <button type="button" className={mode === "json" ? "primary" : ""} onClick={() => switchMode("json")}>JSON avanzato</button>
          </div>

          {draft.typeId === "pianeta-nascosto" && <PianetaSchemiPanel onAuthLost={onAuthLost} />}

          {mode === "form" ? (
            <SchemaForm
              schema={current.configJsonSchema as JsonSchema}
              value={draft.config}
              onChange={(config) => setDraft({ ...draft, config })}
              context={{
                teams: [],
                players: [],
                // Il duello sceglie i minigiochi e il mazzo tra le istanze; non può contenere un altro duello.
                instances: instances
                  .filter((i) => i.typeId !== draft.typeId)
                  .map((i) => ({ id: i.id, title: i.title, kind: typeOf(i.typeId)?.kind === "content" ? "content" : "minigame", typeId: i.typeId })),
              }}
            />
          ) : (
            <textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} rows={18} spellCheck={false} />
          )}

          <div className="row">
            <button className="primary" type="submit">Salva</button>
            <button type="button" onClick={() => setDraft(null)}>Annulla</button>
          </div>
        </form>
      )}

      <div className="lib-browser">
        <div className="row lib-toolbar">
          <input
            type="search"
            className="lib-search"
            aria-label="Cerca un'istanza"
            placeholder="Cerca per titolo, minigioco o tema…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="file-btn">
            Importa JSON
            <input type="file" accept="application/json,.json" multiple hidden onChange={(e) => { void importFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <button
            disabled={instances.length === 0}
            onClick={() => download("libreria-gioco-ros.json", pretty(instances.map((i) => JSON.parse(serializeInstance(i)))))}
          >
            Esporta tutto
          </button>
        </div>
        <div className="chips filters" role="group" aria-label="Famiglia di minigioco">
          <button type="button" className={`chip-btn${only === "all" ? " on" : ""}`} aria-pressed={only === "all"} onClick={() => setOnly("all")}>
            Tutte <small>{totalCount}</small>
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip-btn${only === c ? " on" : ""}`}
              aria-pressed={only === c}
              disabled={counts[c] === 0 && only !== c}
              onClick={() => setOnly(only === c ? "all" : c)}
            >
              {CATEGORY_ICON[c]} {CATEGORY_LABEL[c]} <small>{counts[c]}</small>
            </button>
          ))}
        </div>
      </div>

      {groups.map((g) => (
      <section key={g.category} className="lib-group" aria-label={g.label}>
      {(only === "all" || query.trim() !== "") && <h4>{CATEGORY_ICON[g.category]} {g.label} ({g.instances.length})</h4>}
      <ul className="list library-list">
        {g.instances.map((i) => {
          const type = typeOf(i.typeId);
          return (
          <li key={i.id} className="lib-card">
            <span className="lib-title">
              <strong>{i.title}</strong>{" "}
              <small className="muted">· {type?.title ?? i.typeId} · {themeLabel(i)}</small>
            </span>
            <span className="row">
              {type?.kind === "minigame" && (
                <button
                  className="primary"
                  aria-label={`Prova ${i.title}`}
                  title="Provalo subito con giocatori finti, senza preparare serata e partita"
                  onClick={() => setTesting(testing?.id === i.id ? null : { id: i.id, players: suggestedPlayers(type), teams: true, busy: false })}
                >
                  🧪 Prova
                </button>
              )}
              <button onClick={() => openInstance(i)}>Modifica</button>
              <button onClick={() => void duplicate(i)}>Duplica</button>
              <button onClick={() => download(`${slug(i.title)}.json`, serializeInstance(i))}>Esporta</button>
              <button onClick={() => void remove(i)}>Elimina</button>
            </span>
            {testing?.id === i.id && (
              <form className="test-form" onSubmit={startTest} aria-label={`Prova di ${i.title}`}>
                <label>
                  Telefoni di prova{" "}
                  <input
                    type="number"
                    min={type?.minPlayers ?? 1}
                    max={Math.min(type?.maxPlayers ?? 30, 30)}
                    value={testing.players}
                    onChange={(e) => setTesting({ ...testing, players: Number(e.target.value) })}
                    required
                  />
                </label>
                <label className="check">
                  <input type="checkbox" checked={testing.teams} onChange={(e) => setTesting({ ...testing, teams: e.target.checked })} /> Due squadre
                </label>
                <button className="primary" type="submit" disabled={testing.busy}>{testing.busy ? "Avvio…" : "Avvia la prova"}</button>
                <button type="button" onClick={() => setTesting(null)}>Annulla</button>
                <small className="muted">Senza preparare serata e partita: giocatori finti, nessun punto salvato.</small>
              </form>
            )}
          </li>
          );
        })}
      </ul>
      </section>
      ))}
      {groups.length === 0 && (
        <p className="muted">{instances.length === 0 ? "Nessuna istanza: creane una con i pulsanti in alto." : "Nessuna istanza corrisponde alla ricerca."}</p>
      )}
    </section>
  );
}
