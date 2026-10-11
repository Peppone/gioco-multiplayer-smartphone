import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminPlayerDetail } from "@gioco/shared";
import { api, errorMessage } from "./api";

/** Elenco dei giocatori registrati, con il PIN per ricordarlo a chi lo dimentica (nascosto finché non lo si mostra). */
export function PlayersPanel({ onAuthLost }: { onAuthLost: () => void }) {
  const [list, setList] = useState<AdminPlayerDetail[]>([]);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api<AdminPlayerDetail[]>("GET", "/players/details"));
    } catch (e) {
      setError(errorMessage(e));
      onAuthLost();
    }
  }, [onAuthLost]);

  useEffect(() => void load(), [load]);

  const toggle = (id: string) =>
    setShown((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const resetPin = async (p: AdminPlayerDetail) => {
    if (!confirm(`Generare un nuovo PIN per ${p.nickname}? Quello vecchio non varrà più.`)) return;
    setError(null);
    try {
      const updated = await api<AdminPlayerDetail>("POST", `/players/${p.id}/reset-pin`);
      setList((l) => l.map((x) => (x.id === p.id ? updated : x)));
      setShown((s) => new Set(s).add(p.id)); // il nuovo PIN si legge subito
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? list.filter((p) => p.nickname.toLowerCase().includes(q)) : list;
  }, [list, search]);

  return (
    <section className="panel">
      <h2>Giocatori <small className="muted">({list.length})</small></h2>
      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per nickname" aria-label="Cerca giocatore" />
      {error && <p className="error">{error}</p>}
      <ul className="list players">
        {visible.map((p) => (
          <li key={p.id} style={{ borderLeft: `6px solid ${p.color}` }}>
            <span>{p.avatar} {p.nickname}</span>
            <span className="row">
              {p.pin === null ? (
                <small className="muted">PIN non disponibile (profilo creato prima)</small>
              ) : (
                <>
                  <code aria-label={`PIN di ${p.nickname}`}>{shown.has(p.id) ? p.pin : "••••"}</code>
                  <button type="button" onClick={() => toggle(p.id)}>{shown.has(p.id) ? "Nascondi" : "Mostra PIN"}</button>
                </>
              )}
              <button type="button" onClick={() => void resetPin(p)}>Nuovo PIN</button>
            </span>
          </li>
        ))}
        {list.length === 0 && <li className="muted">Nessun giocatore registrato.</li>}
        {list.length > 0 && visible.length === 0 && <li className="muted">Nessun giocatore con questo nome.</li>}
      </ul>
    </section>
  );
}
