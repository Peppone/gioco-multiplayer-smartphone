import { useContext, useEffect, useState } from "react";
import { RootChangeCtx, RootCtx } from "./SchemaForm";
import type { JsonSchema } from "./logic";
import {
  CATEGORY_MAX_LENGTH,
  OTHER_CATEGORY,
  SONG_CATEGORY_MAX,
  addCategory,
  categoryList,
  categoryProblem,
  removeCategory,
  renameCategory,
  syncCatalog,
  toggleSongCategory,
  uncategorizedCount,
} from "./categories";

const plural = (n: number) => `${n} ${n === 1 ? "brano" : "brani"}`;

/** Una categoria del catalogo: il nome si cambia sul posto (Invio o fuori dal campo) e vale anche nei brani e nei round. */
function CategoryRow({ name, songs, index }: { name: string; songs: number; index: number }) {
  const root = useContext(RootCtx);
  const setRoot = useContext(RootChangeCtx);
  const [draft, setDraft] = useState(name);
  const problem = draft.trim() === name ? null : categoryProblem(root, draft, name);

  const commit = () => {
    if (draft.trim() === name) return;
    const next = renameCategory(root, name, draft);
    if (next) setRoot(next);
  };

  return (
    <li className="category-row" data-category={name}>
      <input
        aria-label={`Nome della categoria ${index + 1}`}
        maxLength={CATEGORY_MAX_LENGTH}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => (problem === null ? commit() : setDraft(name))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(name);
        }}
      />
      <small className="muted category-count">{plural(songs)}</small>
      <button type="button" onClick={() => setRoot(removeCategory(root, name))} aria-label={`Elimina la categoria ${name}`}>✕</button>
      {problem && <small className="hint bad" role="alert">{problem}</small>}
    </li>
  );
}

/**
 * Gestore delle categorie del quiz: l'elenco di tutte le categorie con il numero di brani, per aggiungere, rinominare
 * (cambia anche nei brani e nei round) ed eliminare (i brani restano, senza quella categoria). I brani le scelgono da qui.
 */
export function CategoryManager({ schema }: { schema: JsonSchema }) {
  const root = useContext(RootCtx);
  const setRoot = useContext(RootChangeCtx);
  const [name, setName] = useState("");

  // Le categorie dei brani salvati prima del gestore entrano nel catalogo.
  useEffect(() => {
    const next = syncCatalog(root);
    if (next !== root) setRoot(next);
  });

  const list = categoryList(root);
  const loose = uncategorizedCount(root);
  const problem = name.trim() === "" ? null : categoryProblem(root, name);
  const add = () => {
    const next = addCategory(root, name);
    if (!next) return;
    setRoot(next);
    setName("");
  };

  return (
    <fieldset className="field category-manager" data-count={list.length}>
      <legend>
        {schema.title ?? "Categorie"} <small className="muted">({list.length})</small>
      </legend>
      {schema.description && <small className="muted hint">{schema.description}</small>}
      {list.length === 0 && <small className="muted">Nessuna categoria: aggiungine una, poi assegnala ai brani dal pannello «Avanzato».</small>}
      <ul className="category-list" aria-label="Categorie del quiz">
        {list.map((c, i) => (
          <CategoryRow key={c.name} name={c.name} songs={c.songs} index={i} />
        ))}
      </ul>
      {loose > 0 && list.length > 0 && <small className="muted">{plural(loose)} senza categoria: stanno in «{OTHER_CATEGORY}».</small>}
      <div className="category-add">
        <input
          aria-label="Nome della nuova categoria"
          placeholder="Nuova categoria (es. Anni 80)"
          maxLength={CATEGORY_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" disabled={name.trim() === "" || problem !== null} onClick={add}>+ Aggiungi categoria</button>
      </div>
      {problem && <small className="hint bad" role="alert">{problem}</small>}
    </fieldset>
  );
}

/** Le categorie di un brano: una casella per ogni categoria del quiz, più il campo per crearne una nuova al volo. */
export function SongCategoryPicker({ song, onChange }: { song: Record<string, unknown>; onChange: (song: Record<string, unknown>) => void }) {
  const root = useContext(RootCtx);
  const [name, setName] = useState("");
  const list = categoryList(root);
  const mine = new Set(((Array.isArray(song.categories) ? song.categories : []) as unknown[]).filter((c): c is string => typeof c === "string").map((c) => c.trim().toLowerCase()));
  const full = mine.size >= SONG_CATEGORY_MAX;
  const exists = list.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  // Il nome nuovo entra nel brano subito e nel catalogo con la sincronizzazione del gestore.
  const add = () => {
    if (name.trim() === "" || name.trim().length > CATEGORY_MAX_LENGTH || full) return;
    onChange(toggleSongCategory(song, exists?.name ?? name, true));
    setName("");
  };

  return (
    <div className="field song-categories">
      {list.length === 0 && <small className="muted">Nessuna categoria nel quiz: creane una qui sotto o nel gestore delle categorie.</small>}
      <div className="song-category-list" role="group" aria-label="Categorie del brano">
        {list.map((c) => (
          <label key={c.name} className={`check${mine.has(c.name.toLowerCase()) ? " on" : ""}`}>
            <input
              type="checkbox"
              checked={mine.has(c.name.toLowerCase())}
              disabled={full && !mine.has(c.name.toLowerCase())}
              onChange={(e) => onChange(toggleSongCategory(song, c.name, e.target.checked))}
            />
            {c.name}
          </label>
        ))}
      </div>
      <div className="category-add">
        <input
          aria-label="Nuova categoria per questo brano"
          placeholder="Nuova categoria"
          maxLength={CATEGORY_MAX_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" disabled={name.trim() === "" || full} onClick={add}>+ Aggiungi al brano</button>
      </div>
      <small className="muted">
        {full ? `Al massimo ${SONG_CATEGORY_MAX} categorie per brano. ` : ""}Senza categorie il brano sta in «{OTHER_CATEGORY}».
      </small>
    </div>
  );
}

/** La categoria di un round con la categoria fissa: si sceglie tra quelle del quiz (con il numero di brani). */
export function CategoryPickField({ schema, value, onChange, labelText }: { schema: JsonSchema; value: unknown; onChange: (value: unknown) => void; labelText: string }) {
  const root = useContext(RootCtx);
  const list = categoryList(root);
  const current = typeof value === "string" ? value : "";
  const known = list.some((c) => c.name.toLowerCase() === current.toLowerCase());
  return (
    <label className="field">
      <span className="label">{labelText}</span>
      <select aria-label={labelText} value={current} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}>
        <option value="">Scegli…</option>
        {current !== "" && !known && <option value={current}>{current} (non più nel quiz)</option>}
        {list.map((c) => (
          <option key={c.name} value={c.name}>{c.name} ({plural(c.songs)})</option>
        ))}
        {uncategorizedCount(root) > 0 && <option value={OTHER_CATEGORY}>{OTHER_CATEGORY} ({plural(uncategorizedCount(root))})</option>}
      </select>
      {schema.description && <small className="muted hint">{schema.description}</small>}
    </label>
  );
}
