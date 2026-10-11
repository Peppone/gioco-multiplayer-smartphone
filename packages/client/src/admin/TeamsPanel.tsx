import { useCallback, useEffect, useState } from "react";
import type { TeamView } from "@gioco/shared";
import { api, errorMessage } from "./api";

const EMBLEMS = ["🔥", "⚡", "🌊", "🌿", "🦅", "🐺", "👑", "🛡️"];
const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"];

export function TeamsPanel({ onAuthLost }: { onAuthLost: () => void }) {
  const [teams, setTeams] = useState<TeamView[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [emblem, setEmblem] = useState(EMBLEMS[0]!);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTeams(await api<TeamView[]>("GET", "/teams"));
    } catch (e) {
      setError(errorMessage(e));
      onAuthLost();
    }
  }, [onAuthLost]);

  useEffect(() => void load(), [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("POST", "/teams", { name, color, emblem });
      setName("");
    });
  };

  return (
    <section className="panel">
      <h2>Squadre</h2>
      <form className="row" onSubmit={add}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome squadra" maxLength={24} required />
        <select value={emblem} onChange={(e) => setEmblem(e.target.value)}>
          {EMBLEMS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colore" />
        <button className="primary" type="submit">Aggiungi</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul className="list">
        {teams.map((t) => (
          <li key={t.id} style={{ borderLeft: `6px solid ${t.color}` }}>
            <span>{t.emblem} {t.name}</span>
            <button onClick={() => confirm(`Eliminare la squadra ${t.name}?`) && void run(() => api("DELETE", `/teams/${t.id}`))}>
              Elimina
            </button>
          </li>
        ))}
        {teams.length === 0 && <li className="muted">Nessuna squadra: creane almeno due.</li>}
      </ul>
    </section>
  );
}
