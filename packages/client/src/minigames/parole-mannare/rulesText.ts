import { duration } from "../caccia-fantasmi/rulesText";
import type { Role, Rules } from "./types";

export interface RulesSection {
  title: string;
  /** Un paragrafo per voce. */
  lines: string[];
}

/**
 * Le regole in parole, con i numeri di questa partita. «Per te» dipende dal ruolo (null = ancora non assegnato).
 * Se si cambiano le regole del gioco va aggiornato anche questo testo (il test controlla che i numeri compaiano).
 */
export function rulesSections(role: Role | null, isMayor: boolean, r: Rules): RulesSection[] {
  const wolves = r.werewolves === 1 ? "1 Lupo" : `${r.werewolves} Lupi`;
  const maybe = r.maybePool === null ? "illimitati" : r.maybePool === 0 ? "non ci sono" : `${r.maybePool} in tutto`;
  const sections: RulesSection[] = [];

  if (isMayor || role) {
    const mine: string[] = [];
    if (isMayor) {
      mine.push("Sei il SINDACO. Scegli una parola tra quelle proposte, poi rispondi alle domande dei compagni (a voce) assegnando i gettoni dal telefono.");
      mine.push("Trascina un nome su un gettone o un gettone su un nome; oppure tocca prima l'uno e poi l'altro. «Annulla» toglie l'ultimo gettone dato, ma non restituisce tempo.");
    }
    if (role === "werewolf") mine.push("Sei un LUPO. Conosci la parola e gli altri Lupi. Fai in modo che il villaggio non la indovini, senza farti scoprire. Se la indovinano, tu e i Lupi cercate di trovare il Veggente.");
    if (role === "seer") mine.push("Sei il VEGGENTE. Conosci la parola: aiuta il villaggio senza farti riconoscere dai Lupi, che se la parola viene indovinata cercheranno proprio te.");
    if (role === "villager") mine.push("Sei un PAESANO. Non sai la parola: fai domande al Sindaco e osserva chi cerca di sviare.");
    sections.push({ title: "Per te", lines: mine });
  }

  sections.push(
    {
      title: "Lo scopo",
      lines: [
        `In ${r.players} giocatori ci sono ${wolves} e un Veggente. Il Sindaco ha scelto una parola segreta: il villaggio deve indovinarla entro ${duration(r.questionSeconds)}.`,
        "Le domande si fanno ad alta voce («È un animale?»): il telefono serve solo al Sindaco per rispondere.",
      ],
    },
    {
      title: "I gettoni",
      lines: [
        `✅ Sì e ❌ No escono da una riserva comune di ${r.yesNoPool}: quando finisce, le domande terminano.`,
        `❓ Forse: ${maybe}. 🟡 Ci sei quasi (${r.closeTokens}) e 🔴 Lontanissimo (${r.farTokens}) si possono dare una sola volta e si aggiungono alla risposta.`,
        "🎯 Esatto: la parola è stata indovinata.",
      ],
    },
    {
      title: "Se indovinate la parola",
      lines: [`I Lupi si rivelano e hanno ${duration(r.seerHuntSeconds)} per scegliere insieme il Veggente. Se lo trovano vincono i Lupi, altrimenti il villaggio.`],
    },
    {
      title: "Se non la indovinate",
      lines: [
        `La parola viene mostrata e tutti votano chi è il Lupo entro ${duration(r.voteSeconds)}. Se il più votato è un Lupo vince il villaggio, altrimenti i Lupi.`,
        `In caso di pareggio c'è un ballottaggio di ${duration(r.runoffSeconds)} tra i giocatori pari. Se finisce di nuovo pari, vincono i Lupi.`,
      ],
    },
  );
  return sections;
}
