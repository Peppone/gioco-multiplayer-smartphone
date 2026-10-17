/**
 * Simulazione di bilanciamento di «Shadow Tournament». Si lancia con `pnpm balance:shadow`.
 *
 * Fa giocare il VERO codice del plugin (nessun server) a giocatori simulati che scelgono le carte a caso e
 * rispondono dopo ~`thinkSec` secondi. Misura:
 *  - la durata (turni e minuti) per 4, 8, 16 e 30 giocatori;
 *  - quante volte si usa ciascuna azione;
 *  - se uno stile di gioco domina: metà dei giocatori adotta lo stile provato, l'altra metà gioca «bilanciato», e si
 *    guarda la quota di tornei vinti dal primo gruppo (a parità di abilità dovrebbe stare vicino al 50%).
 *
 * Le carte sono scelte a caso: la bravura nel leggere l'avversario non c'è, quindi i numeri dicono se le REGOLE (token,
 * azioni, mazzi) favoriscono uno stile, non quanto si diverte chi gioca davvero. Obiettivi: torneo a 30 ≤ 30 minuti,
 * nessuno stile sopra il 60% di vittorie, chi sceglie sempre Leggendario non domina.
 */
import { BALANCED, type Style, simulateTournament } from "../../../packages/minigames/src/shadow-tournament/simulate.js";

const THINK_SEC = 5;

function duration(): void {
  console.log("\nDurata (giocatori che pensano ~%d s)", THINK_SEC);
  for (const players of [4, 8, 16, 30]) {
    const trials = players >= 30 ? 8 : 20;
    let turns = 0, seconds = 0, worst = 0;
    const usage: Record<string, number> = {};
    for (let t = 0; t < trials; t++) {
      const r = simulateTournament({ players, seed: players * 1000 + t, thinkSec: THINK_SEC });
      turns += r.turns;
      seconds += r.seconds;
      worst = Math.max(worst, r.seconds);
      for (const [k, v] of Object.entries(r.usage)) usage[k] = (usage[k] ?? 0) + v;
    }
    const perTournament = Object.entries(usage)
      .map(([k, v]) => `${k} ${(v / trials).toFixed(1)}`)
      .join(", ");
    console.log(
      `  ${String(players).padStart(2)} giocatori: ${(turns / trials).toFixed(1)} turni, ${(seconds / trials / 60).toFixed(1)} min in media (peggiore ${(worst / 60).toFixed(1)}) | per torneo: ${perTournament}`,
    );
  }
}

function dominance(name: string, style: Partial<Style>, players = 16, trials = 60): void {
  const styles = Array.from({ length: players }, (_, i) => (i < players / 2 ? style : {}));
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    const r = simulateTournament({ players, seed: 50_000 + t, thinkSec: 2, styles });
    const winner = r.state.finalOrder![0]!;
    if (Number(winner.slice(1)) < players / 2) wins++;
  }
  console.log(`  ${name.padEnd(34)} ${((wins / trials) * 100).toFixed(0)}% dei tornei vinti dal gruppo`);
}

duration();
console.log("\nStili contro «bilanciato» (50% = nessun vantaggio)");
dominance("sempre Leggendario", { legendary: 1 });
dominance("sempre Normale", { legendary: 0 });
dominance("Scommessa sempre", { bet: 1 });
dominance("mai Scommessa", { bet: 0 });
dominance("vita extra sempre", { extraLife: 1 });
dominance("mai vita extra", { extraLife: 0 });
dominance("Scudo sempre, mai Trappola", { shield: 1, trap: 0 });
dominance("Trappola sempre, mai Scudo", { shield: 0, trap: 1 });
dominance("risparmia (nessuna azione)", { bet: 0, extraLife: 0, shield: 0, trap: 0, swap: 0, counter: 0 });
void BALANCED;
