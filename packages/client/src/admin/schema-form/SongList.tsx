import { useContext, useEffect, useRef, useState } from "react";
import { type MediaItem, youtubeId } from "@gioco/shared";
import { api, errorMessage, uploadAudio } from "../api";
import { AudioPreview } from "./AudioPreview";
import { SongCategoryPicker } from "./CategoryManager";
import { AudioField, Field, ObjectFields, RootCtx } from "./SchemaForm";
import { type JsonSchema, defaultValue, moveItem, setKey } from "./logic";
import { effectsOf, materializeListening, songSource, songSummary, titleFromFile } from "./songs";

/** Campi dell'ascolto del brano: dove parte, quanto dura e in che modo (le modalità mostrano solo i loro). */
const LISTEN_KEYS = [
  "startSeconds",
  "playback",
  "clipSeconds",
  "loopSeconds",
  "loopPauseSeconds",
  "speed",
  "keepPitch",
  "normalAfterSeconds",
  "speedTransitionSeconds",
  "stage1Seconds",
  "stage2Seconds",
  "stageTransitionSeconds",
];

type Song = Record<string, unknown>;

/**
 * Elenco dei brani di «Indovina la canzone». Ogni riga mostra la sorgente (file o YouTube), il titolo con l'artista e un
 * riassunto di ciò che è stato impostato; tutto il resto (partenza e ascolto, effetti, camuffamento, categorie, punti) sta
 * nel pannello «Avanzato» del brano. Si aggiunge un brano caricando uno o più file, scegliendo un file già caricato o
 * incollando link YouTube.
 */
export function SongList({ schema, value, onChange }: { schema: JsonSchema; value: unknown; onChange: (value: unknown) => void }) {
  const list = (Array.isArray(value) ? value : []) as Song[];
  const itemSchema = schema.items ?? {};
  const max = schema.maxItems ?? Infinity;
  const min = schema.minItems ?? 0;
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<string | null>(null);
  // I caricamenti finiscono a brano modificato nel frattempo: si aggiunge sempre all'elenco di adesso.
  const latest = useRef(list);
  latest.current = list;

  useEffect(() => {
    api<MediaItem[]>("GET", "/media").then(setLibrary, () => undefined);
  }, []);

  // L'ascolto si decide brano per brano: chi seguiva ancora il round (brani salvati prima, brani nuovi) riceve i suoi valori.
  const round = useContext(RootCtx);
  useEffect(() => {
    const next = list.map((song) => materializeListening(song, round));
    if (next.some((song, i) => song !== list[i])) onChange(next);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Aggiunge brani dalle loro sorgenti ({ audio } o { youtube }). Prima si riempiono le righe che non ne hanno ancora una
   * (quella vuota con cui nasce un nuovo elenco, con il titolo già scritto), poi se ne aggiungono di nuove.
   */
  const add = (sources: Partial<Song>[]) => {
    const next = [...latest.current];
    const created: Song[] = [];
    for (const source of sources) {
      const empty = next.findIndex((s) => songSource(s, []) === null);
      // Il titolo già scritto non si tocca: il nome del file è solo una proposta.
      if (empty >= 0) next[empty] = { ...next[empty], ...source, ...(String(next[empty]!.answer ?? "").trim() !== "" ? { answer: next[empty]!.answer } : {}) };
      else created.push({ ...(defaultValue(itemSchema) as Song), ...source });
    }
    const room = Math.max(0, max - next.length);
    onChange([...next, ...created.slice(0, room)]);
    if (created.length > room) setError(`Al massimo ${max} brani: gli ultimi ${created.length - room} non sono stati aggiunti.`);
  };

  const upload = async (files: File[]) => {
    setBusy(true);
    setError("");
    const created: Partial<Song>[] = [];
    const problems: string[] = [];
    for (const file of files) {
      try {
        const item = await uploadAudio(file);
        setLibrary((l) => [item, ...l.filter((m) => m.file !== item.file)]);
        created.push({ audio: item.file, answer: titleFromFile(item.name) });
      } catch (e) {
        problems.push(`${file.name}: ${errorMessage(e)}`);
      }
    }
    if (created.length > 0) add(created);
    if (problems.length > 0) setError(problems.join(" · "));
    setBusy(false);
  };

  const addLinks = () => {
    const lines = (links ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
    const bad = lines.filter((l) => youtubeId(l) === null);
    if (lines.length === 0) return;
    if (bad.length > 0) {
      setError(`Link YouTube non riconosciuto: «${bad[0]!.slice(0, 60)}»`);
      return;
    }
    setError("");
    add(lines.map((youtube) => ({ youtube })));
    setLinks(null);
  };

  const update = (i: number, song: Song) => onChange(list.map((s, j) => (j === i ? song : s)));
  const full = list.length >= max;

  return (
    <fieldset className="field array song-list" data-count={list.length}>
      <legend>
        {schema.title ?? "Brani"} <small className="muted">({list.length})</small>
      </legend>
      {list.length === 0 && <small className="muted">Nessun brano: aggiungi un file o un link YouTube.</small>}
      {list.map((song, i) => {
        const source = songSource(song, library);
        const summary = songSummary(song);
        const answer = typeof song.answer === "string" ? song.answer : "";
        return (
          <div key={i} className="song-row" data-source={source?.kind ?? "none"}>
            <span className="song-num">{i + 1}</span>
            <div className="song-main">
              <input
                className="song-answer"
                aria-label={`Titolo e artista (solo regia) del brano ${i + 1}`}
                placeholder="Titolo e artista (solo regia)"
                maxLength={120}
                value={answer}
                onChange={(e) => update(i, setKey(song, "answer", e.target.value))}
              />
              <small className={`song-source${source ? "" : " bad"}`}>
                {source ? `${source.kind === "file" ? "File" : "▶"} ${source.label}` : "Manca il brano: apri «Avanzato» e scegli un file o un link"}
              </small>
              <ul className="song-chips" aria-label={`Impostazioni del brano ${i + 1}`}>
                {summary.length === 0 ? <li className="muted">impostazioni predefinite</li> : summary.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
            <span className="tools">
              <button type="button" onClick={() => setOpen(i)} aria-label={`Avanzato: brano ${i + 1}`}>Avanzato…</button>
              <button type="button" disabled={i === 0} onClick={() => onChange(moveItem(list, i, -1))} aria-label={`Sposta su il brano ${i + 1}`}>↑</button>
              <button type="button" disabled={i === list.length - 1} onClick={() => onChange(moveItem(list, i, 1))} aria-label={`Sposta giù il brano ${i + 1}`}>↓</button>
              <button type="button" disabled={list.length <= min} onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Elimina il brano ${i + 1}`}>✕</button>
            </span>
          </div>
        );
      })}

      <div className="song-add">
        <label className={`file-btn${busy || full ? " disabled" : ""}`}>
          {busy ? "Caricamento in corso…" : "+ Aggiungi file"}
          <input
            type="file"
            multiple
            hidden
            accept="audio/*,video/mp4,.mp4"
            aria-label="Aggiungi file"
            disabled={busy || full}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length > 0) void upload(files);
            }}
          />
        </label>
        <button type="button" disabled={full} aria-expanded={links !== null} onClick={() => setLinks(links === null ? "" : null)}>+ Aggiungi link YouTube</button>
        {library.length > 0 && (
          <select
            aria-label="Aggiungi un file già caricato"
            disabled={full}
            value=""
            onChange={(e) => e.target.value !== "" && add([{ audio: e.target.value, answer: titleFromFile(library.find((m) => m.file === e.target.value)?.name ?? "") }])}
          >
            <option value="">+ Aggiungi un file già caricato…</option>
            {library.map((m) => <option key={m.file} value={m.file}>{m.name}</option>)}
          </select>
        )}
      </div>
      {links !== null && (
        <div className="song-links">
          <textarea aria-label="Link YouTube da aggiungere" rows={3} placeholder="Un link YouTube per riga" value={links} onChange={(e) => setLinks(e.target.value)} />
          <button type="button" disabled={links.trim() === ""} onClick={addLinks}>Aggiungi i link</button>
          <small className="muted">Si usa l'audio del video, che resta nascosto. Serve internet sul PC dello schermo e il video deve poter essere incorporato.</small>
        </div>
      )}
      {error && <small className="hint bad" role="alert">{error}</small>}

      {open !== null && list[open] && (
        <AdvancedDialog
          key={open}
          index={open}
          inLibrary={typeof list[open]!.audio === "string" && library.some((m) => m.file === list[open]!.audio)}
          schema={itemSchema}
          song={list[open]!}
          onChange={(song) => update(open, song)}
          onClose={() => setOpen(null)}
        />
      )}
    </fieldset>
  );
}

/** Pannello «Avanzato» di un brano: tutto ciò che non è il titolo, in sezioni. Le modifiche valgono subito; «Fatto» chiude. */
function AdvancedDialog({ index, inLibrary, schema, song, onChange, onClose }: { index: number; inLibrary: boolean; schema: JsonSchema; song: Song; onChange: (song: Song) => void; onClose: () => void }) {
  const round = useContext(RootCtx);
  const done = useRef<HTMLButtonElement>(null);
  const props = schema.properties ?? {};
  const file = typeof song.audio === "string" && song.audio !== "" ? song.audio : null;
  const isYoutube = typeof song.youtube === "string" && song.youtube !== "";
  const answer = typeof song.answer === "string" && song.answer !== "" ? song.answer : "senza titolo";

  // Il gestore di chiusura cambia a ogni disegno: si legge da un riferimento, così il fuoco non torna su «Fatto» a ogni modifica.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    done.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const section = (title: string, children: React.ReactNode, hint?: string) => (
    <section className="song-section" data-section={title}>
      <h4>{title}</h4>
      {hint && <small className="muted">{hint}</small>}
      {children}
    </section>
  );
  const only = (keys: string[]) => <ObjectFields schema={schema} value={song} onChange={(v) => onChange(v as Song)} only={keys} />;
  const fieldOf = (key: string, label?: string) => (
    <Field schema={props[key]!} value={song[key] ?? props[key]!.default} label={label ?? props[key]!.title ?? key} required={false} siblings={song} onChange={(v) => onChange(setKey(song, key, v))} />
  );

  return (
    <div className="song-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="song-dialog" role="dialog" aria-modal="true" aria-label={`Avanzato: brano ${index + 1}`}>
        {/* In alto e sempre visibile: si ascolta il brano (con gli effetti) da qualunque sezione, senza risalire */}
        <div className="song-dialog-top">
          <header>
            <h3>Brano {index + 1} · {answer}</h3>
            <button type="button" ref={done} onClick={onClose}>Fatto</button>
          </header>
          {!isYoutube && file && inLibrary && <AudioPreview key={file} file={file} effects={effectsOf(song)} song={song} round={round} />}
        </div>

        {section(
          "Sorgente",
          <>
            {!isYoutube && (
              <AudioField schema={props.audio ?? {}} value={song.audio} onChange={(v, fileName) => {
                if (v === undefined) return onChange(setKey(song, "audio", undefined));
                const chosen = setKey(setKey(song, "audio", v), "youtube", undefined);
                // Un titolo vuoto si riempie con il nome del file scelto.
                const proposal = fileName ? titleFromFile(fileName) : "";
                onChange(proposal !== "" && String(song.answer ?? "").trim() === "" ? setKey(chosen, "answer", proposal) : chosen);
              }} labelText="Brano" siblings={song} showPreview={false} />
            )}
            {!file && (
              <label className="field">
                <span className="label">{isYoutube ? "Link YouTube" : "oppure un link YouTube"}</span>
                <input
                  aria-label="Link YouTube (facoltativo)"
                  maxLength={200}
                  placeholder="https://youtu.be/…"
                  value={typeof song.youtube === "string" ? song.youtube : ""}
                  onChange={(e) => onChange(e.target.value === "" ? setKey(song, "youtube", undefined) : setKey(setKey(song, "audio", undefined), "youtube", e.target.value))}
                />
              </label>
            )}
            {isYoutube && youtubeId(String(song.youtube)) === null && <small className="hint bad" role="alert">Link YouTube non riconosciuto</small>}
            {isYoutube && (
              <small className="muted">Con YouTube non si possono usare effetti, velocità, ovattato a fasi né camuffamento: l'audio sta in un video incorporato. Per usarli, cancella il link e carica un file.</small>
            )}
          </>,
        )}

        {section("Categorie", <SongCategoryPicker song={song} onChange={onChange} />, "Si scelgono tra le categorie del quiz (gestore delle categorie, sopra l'elenco dei brani). Un brano può averne fino a 5.")}
        {section("Partenza e ascolto", only(LISTEN_KEYS), "Il punto da cui parte il brano e come lo si ascolta in partita: solo per questo brano.")}
        {section(
          "Effetti sull'audio",
          isYoutube ? <small className="muted">Non disponibili con YouTube.</small> : only(["effect", "effects"]),
          "Filtri (sfocato, telefono, eco…) e camuffamenti (al contrario a pezzi, spettro capovolto, sillabe mescolate) stanno nella stessa lista, in serie nell'ordine delle card. L'anteprima li suona tutti.",
        )}
        {section(
          "Svela gradualmente",
          isYoutube ? <small className="muted">Non disponibile con YouTube.</small> : only(["progressive", "clearAtPercent"]),
          "Gli effetti di questo brano si attenuano col passare dell'ascolto, fino al brano intero. Il tempo che conta è quello ascoltato: se la musica si ferma il suono resta com'era.",
        )}
        {section("Punti", fieldOf("points"))}
      </div>
    </div>
  );
}
