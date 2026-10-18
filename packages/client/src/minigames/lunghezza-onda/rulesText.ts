import { duration } from "../caccia-fantasmi/rulesText";
import type { Role, Rules } from "./types";

export interface RulesSection {
  title: string;
  /** Un paragrafo per voce. */
  lines: string[];
}

/**
 * Le regole in parole, con i numeri di questa partita. «Per te» dipende dal ruolo nel turno in corso.
 * Se si cambiano le regole del gioco va aggiornato anche questo testo (il test controlla che i numeri compaiano).
 */
export function rulesSections(role: Role | null, r: Rules): RulesSection[] {
  const teams = r.mode === "squadre";
  const center = 4 * r.unitPoints;
  const sections: RulesSection[] = [];

  const mine: string[] = [];
  if (role === "psychic") {
    mine.push("Sei il SENSITIVO di questo turno. Scegli uno dei due spettri: sul telefono vedi dove cade il bersaglio.");
    mine.push("Scrivi un indizio che secondo te sta proprio in quel punto dello spettro. Niente numeri, niente sinonimi degli estremi, e niente facce mentre gli altri ragionano!");
  }
  if (role === "guesser") mine.push(teams ? "Tocca alla tua squadra: sposta il quadrante dove pensi che sia il bersaglio e confermalo. Vale la posizione di mezzo (la mediana) della squadra." : "Sposta il quadrante dove pensi che sia il bersaglio e confermalo. Puoi cambiare idea finché c'è tempo.");
  if (role === "counter") mine.push("Tocca a un'altra squadra. Quando avrà deciso, scommetti con i tuoi compagni: il bersaglio è più a sinistra o più a destra della sua lancetta?");
  if (mine.length > 0) sections.push({ title: "Per te", lines: mine });

  sections.push({
    title: "Lo scopo",
    lines: [
      "Su uno spettro tra due estremi («Freddo ↔ Caldo») c'è un bersaglio nascosto. A turno, un Sensitivo lo vede e dà un indizio; gli altri spostano il quadrante per indovinare il punto.",
      `Avete ${duration(r.guessSeconds)} per indovinare${r.clueSeconds > 0 ? `; il Sensitivo ha ${duration(r.clueSeconds)} per l'indizio, altrimenti il turno salta` : ""}.`,
    ],
  });

  if (teams) {
    sections.push(
      {
        title: "I punti",
        lines: [
          "Il bersaglio ha cinque fasce: 4 punti al centro, 3 e 2 ai lati. La squadra di turno prende i punti della fascia dove cade la sua lancetta.",
          `Le altre squadre scommettono se il centro del bersaglio sta più a sinistra o più a destra: chi ha ragione prende ${r.counterPoints === 1 ? "1 punto" : `${r.counterPoints} punti`}, ma niente se la squadra di turno ha fatto 4.`,
          `In classifica ogni punto vale ${r.unitPoints} per ogni membro della squadra.`,
        ],
      },
      {
        title: "La fine",
        lines: [
          `Vince la prima squadra che arriva a ${r.targetScore} punti, oppure chi ne ha di più dopo ${r.turns} turni.`,
          ...(r.catchUp ? ["Recupero: se la squadra di turno fa 4 punti ed è ancora dietro, gioca subito un altro turno (una sola volta di fila)."] : []),
        ],
      },
    );
  } else {
    sections.push({
      title: "I punti",
      lines: [
        `Ognuno indovina per sé: ${center} punti al centro del bersaglio, ${3 * r.unitPoints} e ${2 * r.unitPoints} nelle fasce ai lati, niente fuori.`,
        "Il Sensitivo prende la media dei punti di chi ha giocato: conviene dare indizi chiari!",
        `Si giocano ${r.turns} turni, ognuno con un Sensitivo diverso.`,
      ],
    });
  }
  return sections;
}
