import { duration } from "../caccia-fantasmi/rulesText";
import type { Settings } from "./types";

export type RulesRole = "defuser" | "expert" | "bettor";

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
export function rulesSections(role: RulesRole | null, r: Settings): RulesSection[] {
  const sections: RulesSection[] = [];

  if (role === "defuser") {
    sections.push({
      title: "Per te",
      lines: [
        "Sei l'ARTIFICIERE: la bomba è sulla TV e tu la guardi, ma non sai come si disinnesca. I tuoi compagni hanno il manuale e sono girati di spalle.",
        "Descrivi a voce ciò che vedi (colori, simboli, lettere, numero di serie, batterie…) e fai quello che ti dicono. Sul telefono hai solo i comandi: a ogni modulo corrisponde una scheda numerata.",
        "Il pulsante «Tieni premuto» si rilascia quando il manuale lo dice: alza il dito al momento giusto.",
      ],
    });
  }
  if (role === "expert") {
    sections.push({
      title: "Per te",
      lines: [
        "Sei un ESPERTO: dài le spalle alla TV e non la guardi mai. Sul telefono hai alcune pagine del manuale: gli altri esperti hanno le altre, quindi dovete parlare tutti.",
        "Chiedi all'artificiere di descrivere i moduli, cerca la regola giusta e dettagli cosa fare. Sotto le schede vedi chi ha le pagine che non hai.",
      ],
    });
  }
  if (role === "bettor") {
    sections.push({
      title: "Per te",
      lines: [
        r.betSeconds > 0
          ? `Non tocca alla tua squadra: prima del via hai ${duration(r.betSeconds)} per scommettere se la bomba sarà «disinnescata» o «esplode». Poi guardi la TV e fai il tifo.`
          : "Non tocca alla tua squadra: guarda la TV e fai il tifo.",
        r.betPoints > 0 ? `Se indovini l'esito prendi ${plural(r.betPoints, "punto", "punti")}.` : "Le scommesse non danno punti in questa partita.",
      ],
    });
  }

  sections.push(
    {
      title: "Lo scopo",
      lines: [
        `Gioca una squadra alla volta (${plural(r.bombsPerTeam, "bomba", "bombe")} a testa). L'artificiere ha davanti una bomba con ${r.modules} moduli da disinnescare, e un timer di ${duration(r.seconds)}.`,
        "Chi vede la bomba non conosce le regole, chi conosce le regole non vede la bomba: l'unico canale è la voce.",
      ],
    },
    {
      title: "Errori ed esplosione",
      lines: [
        `Ogni azione sbagliata è un errore. Con ${plural(r.maxStrikes, "errore", "errori")} la bomba esplode${r.speedUpOnStrike ? "; dopo ogni errore il timer corre più veloce (25% in più per errore)" : ""}.`,
        "Se il timer arriva a zero la bomba esplode lo stesso. Il bordo della bomba (numero di serie, batterie, spie e porte) serve a molte regole.",
      ],
    },
    {
      title: "Punti",
      lines: [
        `Ogni membro della squadra di turno prende ${plural(r.modulePoints, "punto", "punti")} per ogni modulo disinnescato, anche se la bomba poi esplode.`,
        r.defusePoints > 0 || r.timeBonus > 0
          ? `Se la bomba è disinnescata prende anche ${plural(r.defusePoints, "punto", "punti")}${r.timeBonus > 0 ? `, più ${plural(r.timeBonus, "punto", "punti")} per ogni secondo rimasto sul timer` : ""}.`
          : "Disinnescare la bomba non dà punti in più.",
        r.betPoints > 0 && r.betSeconds > 0 ? `Chi scommette giusto prende ${plural(r.betPoints, "punto", "punti")}.` : "Le scommesse non danno punti.",
      ],
    },
  );
  return sections;
}
