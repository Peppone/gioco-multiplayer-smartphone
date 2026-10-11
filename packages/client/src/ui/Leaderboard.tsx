import type { LeaderRow, Leaderboards } from "@gioco/shared";

function Table({ title, rows, limit }: { title: string; rows: LeaderRow[]; limit?: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="lb-table">
      <h3>{title}</h3>
      <ol>
        {rows.slice(0, limit).map((r) => (
          <li key={r.id} style={{ borderLeftColor: r.color }}>
            <span className="rank">{r.rank}</span>
            <span className="who">{r.avatar} {r.name}</span>
            <span className="pts">{r.points}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Leaderboard({ data, limit }: { data: Leaderboards; limit?: number }) {
  return (
    <div className="lb">
      <Table title="Squadre" rows={data.teams} />
      <Table title="Giocatori" rows={data.players} limit={limit} />
    </div>
  );
}
