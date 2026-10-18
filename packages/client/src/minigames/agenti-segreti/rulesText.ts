import { duration } from "../caccia-fantasmi/rulesText";
import type { Role, Rules } from "./types";

export interface RulesSection {
  title: string;
  /** Un paragrafo per voce. */
  lines: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Le regole in parole, con i numeri di questa partita. «Per te» dipende dal ruolo.
 * Se si cambiano le regole del gioco va aggiornato anche questo testo (il test controlla che i numeri compaiano).
 */
export function rulesSections(role: Role | null, r: Rules): RulesSection[] {
  const cards = r.gridSize === "4x4" ? 16 : 25;
  const sections: RulesSection[] = [];

  if (role === "spymaster") {
    sections.push({
      title: "Per te",
      lines: [
        "Sei il CAPO-SPIA: solo tu (e l'altro Capo-spia) vedi la mappa segreta, cioè di chi è ogni carta. Tocca «Nascondi» quando qualcuno si avvicina.",
        "Al tuo turno scrivi una parola sola e un numero: quante carte della tua squadra si collegano all'indizio. Non puoi usare parole della griglia.",
        "Mentre la squadra vota non dire niente e non fare facce!",
      ],
    });
  }
  if (role === "agent") {
    sections.push({
      title: "Per te",
      lines: ["Sei un AGENTE. Al turno della tua squadra ascolta l'indizio del tuo Capo-spia, discutetene a voce e vota sul telefono la carta da scoprire. «Conferma» chiude la tua scelta."],
    });
  }

  sections.push(
    {
      title: "Lo scopo",
      lines: [
        `Sulla TV ci sono ${cards} parole. Dietro ognuna c'è un agente dei Rossi o dei Blu, un civile innocente${r.assassins > 0 ? ` o ${r.assassins === 1 ? "l'assassino" : "un assassino"}` : ""}.`,
        `La squadra che inizia ha ${r.first} agenti da trovare, l'altra ${r.second}; i civili sono ${r.civilians}${r.assassins > 0 ? ` e ${r.assassins === 1 ? "c'è 1 assassino" : `ci sono ${r.assassins} assassini`}` : ""}. Vince chi scopre per primo tutti i propri agenti.`,
      ],
    },
    {
      title: "L'indizio",
      lines: [
        `Il Capo-spia di turno scrive una parola e un numero da 1 a 9${r.allowZeroInfinity ? " (oppure 0 o ∞: allora la squadra può scoprire quante carte vuole)" : ""}.`,
        r.clueSeconds > 0 ? `Ha ${duration(r.clueSeconds)}: allo scadere il turno passa.` : "Non c'è limite di tempo per l'indizio.",
      ],
    },
    {
      title: "Il voto",
      lines: [
        `La squadra vota una carta alla volta${r.guessSeconds > 0 ? ` (${duration(r.guessSeconds)} per ogni voto)` : ""}: si scopre la più votata. Con un pareggio, o senza voti, non si scopre nulla e il turno passa.`,
        "Un agente della tua squadra: potete continuare, fino al numero dell'indizio più uno. Un civile o un agente avversario: il turno passa (e l'agente resta all'avversario).",
        ...(r.assassins > 0 ? ["L'assassino: la tua squadra perde subito!"] : []),
        "Dopo la prima carta scoperta potete votare «Passa» per fermarvi.",
      ],
    },
    {
      title: "La fine e i punti",
      lines: [
        ...(r.maxTurns > 0 ? [`Si giocano al massimo ${plural(r.maxTurns, "turno", "turni")}: alla fine vince chi ha meno agenti da trovare.`] : []),
        `Chi vince prende ${plural(r.win, "punto", "punti")} a testa, Capo-spia compreso${r.perAgent > 0 ? `; in più ${plural(r.perAgent, "punto", "punti")} per ogni agente della propria squadra scoperto` : ""}.`,
      ],
    },
  );
  return sections;
}
