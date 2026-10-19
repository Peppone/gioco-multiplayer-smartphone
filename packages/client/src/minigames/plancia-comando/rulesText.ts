import { duration } from "../caccia-fantasmi/rulesText";
import type { Settings } from "./types";

export interface RulesSection {
  title: string;
  /** Un paragrafo per voce. */
  lines: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Le regole in parole, con i numeri di questa partita. Se si cambiano le regole del gioco va aggiornato anche questo testo
 * (il test controlla che i numeri compaiano).
 */
export function rulesSections(r: Settings, inactive = false): RulesSection[] {
  const sections: RulesSection[] = [];
  if (inactive) sections.push({ title: "Per te", lines: ["La regia ha segnato il tuo telefono come fuori uso: non hai né comandi né ordini, e gli ordini dei compagni riguardano solo i loro pannelli. Aiuta a voce."] });
  sections.push(
    {
      title: "Lo scopo",
      lines: [
        `${r.mode === "squadre" ? "Ogni squadra è l'equipaggio di un'astronave e si gareggia" : "Siete tutti nello stesso equipaggio e giocate contro il tempo"}: ${plural(r.sectors, "settore", "settori")} da ${duration(r.sectorSeconds)}. A ogni settore pannelli nuovi e ordini più rapidi.`,
        "Ognuno ha un pannello di comandi dai nomi assurdi, e in alto un ORDINE a tempo. L'ordine quasi sempre riguarda un comando di un compagno (e ogni tanto uno tuo): leggilo ad alta voce!",
      ],
    },
    {
      title: "Come si gioca",
      lines: [
        "Quando un compagno sente il tuo ordine porta quel comando al valore giusto: pulsante da premere, interruttore da accendere o spegnere, cursore da 0 a 5, selettore da impostare su una parola. Appena è fatto l'ordine è eseguito e ne arriva un altro.",
        "Gli ordini non danno punti per la rapidità: conta solo farli prima che scada la barra. Se sul telefono cambi un comando che nessuno ha chiesto non succede nulla.",
      ],
    },
    {
      title: "Scafo e tempo",
      lines: [
        `Il primo ordine dura ${duration(r.orderSeconds)} e a ogni settore il 10% in meno, fino a ${duration(r.minOrderSeconds)}. Un ordine scaduto danneggia lo scafo del ${r.damagePerMiss}%: a zero l'astronave si ferma.`,
        r.events ? "Ogni tanto: ALLARME GENERALE (tutti premono il pulsante rosso entro 5 secondi: se manca uno, si perde scafo) e BLACKOUT (per 8 secondi alcuni pannelli mostrano solo le iniziali dei nomi)." : "Niente eventi in questa partita.",
      ],
    },
    {
      title: "Punti",
      lines: [
        `${plural(r.stepPoints, "punto", "punti")} per ogni ordine eseguito, e fino a ${r.hullBonus} in proporzione allo scafo rimasto, a ogni membro dell'equipaggio.`,
        r.mode === "squadre" && r.podiumPoints.length > 0 ? `Tra le squadre vince chi è arrivato più lontano per membro (non per totale, così le squadre piccole non sono svantaggiate): ${r.podiumPoints.join(", ")} punti secondo il piazzamento.` : "Non c'è podio: conta quanto lontano arrivate insieme.",
      ],
    },
  );
  return sections;
}
