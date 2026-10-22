import { useState } from "react";
import type { TempTeam, TempTeamsInput } from "@gioco/shared";
import { type DraftTeam, MAX_TEMP_TEAMS, addTeam, fromTemp, moveMember, problem, removeTeam, splitRandom, toInput, toggleCaptain } from "./tempTeams";

interface Person {
  id: string;
  nickname: string;
  avatar: string;
}

/**
 * Squadre temporanee ad hoc: la regia le prepara (a sorte o a mano) e sostituiscono le squadre della serata nei round
 * a squadre, finché non le toglie. I punti restano dei giocatori e delle squadre della serata.
 */
export function TempTeamsPanel({
  people,
  temp,
  inRound,
  onApply,
}: {
  /** Giocatori della serata. */
  people: Person[];
  temp: TempTeam[] | undefined;
  inRound: boolean;
  /** Risponde se la regia ha accettato le squadre: se no, la bozza resta per correggerla. */
  onApply: (teams: TempTeamsInput | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<DraftTeam[] | null>(null);
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const who = new Map(people.map((p) => [p.id, p]));
  const name = (id: string) => who.get(id)?.nickname ?? "?";

  const apply = async (teams: TempTeamsInput | null) => {
    setBusy(true);
    try {
      if (await onApply(teams)) setDraft(null);
    } finally {
      setBusy(false);
    }
  };
  const sort = (c: number) => setDraft(splitRandom(people.map((p) => p.id), c));

  const placed = new Set(draft?.flatMap((t) => t.members));
  const loose = people.filter((p) => !placed.has(p.id));
  const issue = draft ? problem(draft) : null;

  return (
    <section className="panel temp-teams">
      <h3>Squadre temporanee</h3>
      <p className="muted">
        Per i round a squadre puoi sostituire le squadre della serata con altre, formate al volo. Valgono dal prossimo round
        {inRound ? " (il round in corso ha già le sue)" : ""} e finché non le togli. I punti restano ai giocatori e alle loro squadre della serata.
      </p>

      {!draft && temp && (
        <>
          <ul className="list">
            {temp.map((t) => (
              <li key={t.id}>
                <span>
                  <b style={{ color: t.color }}>● {t.name}</b>{" "}
                  <small className="muted">
                    {t.members.map((id) => `${id === t.captain ? "👑 " : ""}${name(id)}`).join(", ")}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <div className="row">
            <button onClick={() => setDraft(fromTemp(temp))}>Modifica</button>
            <button disabled={busy} onClick={() => void apply(null)}>Torna alle squadre della serata</button>
          </div>
        </>
      )}

      {!draft && !temp && (
        <div className="row">
          <label>
            Squadre{" "}
            <input type="number" aria-label="Numero di squadre" min={1} max={MAX_TEMP_TEAMS} value={count} style={{ width: "4rem" }} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
          <button className="primary" disabled={people.length === 0} onClick={() => sort(count)}>Sorteggia</button>
          <button disabled={people.length === 0} onClick={() => setDraft(splitRandom([], 2))}>Prepara a mano</button>
        </div>
      )}

      {draft && (
        <>
          <div className="row">
            <label>
              Squadre{" "}
              <input type="number" aria-label="Numero di squadre" min={1} max={MAX_TEMP_TEAMS} value={count} style={{ width: "4rem" }} onChange={(e) => setCount(Number(e.target.value))} />
            </label>
            <button onClick={() => sort(count)}>Sorteggia di nuovo</button>
            <button disabled={draft.length >= MAX_TEMP_TEAMS} onClick={() => setDraft(addTeam(draft))}>+ Squadra</button>
          </div>

          {draft.map((team, ti) => (
            <fieldset key={ti} className="temp-team">
              <legend style={{ color: team.color }}>● Squadra {ti + 1}</legend>
              <div className="row">
                <input
                  aria-label={`Nome della squadra ${ti + 1}`}
                  value={team.name}
                  maxLength={24}
                  onChange={(e) => setDraft(draft.map((t, i) => (i === ti ? { ...t, name: e.target.value } : t)))}
                />
                <input
                  type="color"
                  aria-label={`Colore della squadra ${ti + 1}`}
                  value={team.color}
                  onChange={(e) => setDraft(draft.map((t, i) => (i === ti ? { ...t, color: e.target.value } : t)))}
                />
                <button aria-label={`Elimina la squadra ${ti + 1}`} onClick={() => setDraft(removeTeam(draft, ti))}>✕</button>
              </div>
              <ul className="list">
                {team.members.map((id) => (
                  <li key={id}>
                    <span>{who.get(id)?.avatar} {name(id)}</span>
                    <span className="row">
                      <button
                        aria-pressed={team.captain === id}
                        aria-label={`Capitano della squadra ${ti + 1}: ${name(id)}`}
                        title="Capitano"
                        className={team.captain === id ? "primary" : ""}
                        onClick={() => setDraft(toggleCaptain(draft, ti, id))}
                      >
                        👑
                      </button>
                      <select aria-label={`Squadra temporanea di ${name(id)}`} value={String(ti)} onChange={(e) => setDraft(moveMember(draft, id, e.target.value === "" ? null : Number(e.target.value)))}>
                        {draft.map((t, i) => <option key={i} value={i}>{t.name || `Squadra ${i + 1}`}</option>)}
                        <option value="">Senza squadra</option>
                      </select>
                    </span>
                  </li>
                ))}
                {team.members.length === 0 && <li className="muted">Nessun giocatore.</li>}
              </ul>
            </fieldset>
          ))}

          {loose.length > 0 && (
            <fieldset className="temp-team">
              <legend>Senza squadra ({loose.length})</legend>
              <ul className="list">
                {loose.map((p) => (
                  <li key={p.id}>
                    <span>{p.avatar} {p.nickname}</span>
                    <select aria-label={`Squadra temporanea di ${p.nickname}`} value="" onChange={(e) => e.target.value !== "" && setDraft(moveMember(draft, p.id, Number(e.target.value)))}>
                      <option value="">Senza squadra</option>
                      {draft.map((t, i) => <option key={i} value={i}>{t.name || `Squadra ${i + 1}`}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {issue && <p className="error">{issue}</p>}
          <div className="row">
            <button className="primary" disabled={busy || issue !== null} onClick={() => void apply(toInput(draft))}>Applica</button>
            <button disabled={busy} onClick={() => setDraft(null)}>Annulla</button>
          </div>
        </>
      )}
    </section>
  );
}
