import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { LeaderRow, Leaderboards } from "@gioco/shared";
import { AnimatedNumber } from "./AnimatedNumber";

function Table({ title, rows, limit }: { title: string; rows: LeaderRow[]; limit?: number }) {
  if (rows.length === 0) return null;
  return (
    <div className="lb-table">
      <h3>{title}</h3>
      <ol>
        {rows.slice(0, limit).map((r, i) => (
          // `layout` anima lo scambio di posizione quando cambia l'ordine.
          <motion.li
            key={r.id}
            layout
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 26, delay: i * 0.04 }}
            style={{ borderLeftColor: r.color }}
          >
            <span className="rank">{r.rank}</span>
            <span className="who">{r.avatar} {r.name}</span>
            <span className="pts"><AnimatedNumber value={r.points} /></span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Classifica a squadre e individuale. Con `previous` parte dalla situazione precedente e, dopo una
 * breve pausa, passa a quella nuova: i punti scorrono e le righe si riordinano con un'animazione.
 */
export function Leaderboard({ data, previous, limit }: { data: Leaderboards; previous?: Leaderboards; limit?: number }) {
  const [shown, setShown] = useState<Leaderboards>(previous ?? data);

  useEffect(() => {
    if (!previous) return setShown(data);
    const id = setTimeout(() => setShown(data), 900);
    return () => clearTimeout(id);
  }, [data, previous]);

  return (
    <div className="lb">
      <Table title="Squadre" rows={shown.teams} />
      <Table title="Giocatori" rows={shown.players} limit={limit} />
    </div>
  );
}
