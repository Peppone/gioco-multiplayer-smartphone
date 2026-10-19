import { duration } from "../caccia-fantasmi/rulesText";
import type { Layer, Settings } from "./types";

export type RulesRole = "pilot" | "navigator" | "spectator";

export interface RulesSection {
  title: string;
  /** Un paragrafo per voce. */
  lines: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const LAYER_NAME: Record<Layer, string> = { mines: "MINE", doors: "PORTE", keys: "CHIAVI", patrols: "PATTUGLIE" };

const LAYER_HELP: Record<Layer, string> = {
  mines: "dove sono le mine: il pilota non deve calpestarle",
  doors: "quando le porte sono aperte (il numero è tra quanti secondi cambiano)",
  keys: "dov'è la chiave che serve per aprire l'uscita",
  patrols: "dove passano le pattuglie, che si muovono avanti e indietro",
};

/**
 * Le regole in parole, con i numeri di questa partita. «Per te» dipende dal ruolo (e, per i navigatori, dagli strati).
 * Se si cambiano le regole del gioco va aggiornato anche questo testo (il test controlla che i numeri compaiano).
 */
export function rulesSections(role: RulesRole | null, r: Settings, layers: Layer[] = []): RulesSection[] {
  const sections: RulesSection[] = [];

  if (role === "pilot") {
    sections.push({
      title: "Per te",
      lines: [
        "Sei il PILOTA: guarda la TV e muovi la pedina con la croce. Vedi i muri, l'uscita e dove sono le porte, ma NON i pericoli: te li dicono i navigatori.",
        "Non guardare i telefoni dei compagni. Tenendo premuta una freccia ti muovi un passo dopo l'altro.",
      ],
    });
  }
  if (role === "navigator") {
    sections.push({
      title: "Per te",
      lines: [
        layers.length > 0
          ? `Sei un NAVIGATORE. Sulla mappa vedi i muri, il pilota dal vivo e un solo pezzo di informazione, il tuo: ${layers.map((l) => `${LAYER_NAME[l]} (${LAYER_HELP[l]})`).join("; ")}.`
          : "Sei un NAVIGATORE, ma in questo livello non hai uno strato: aiuta i compagni a mettere insieme le loro informazioni.",
        "Nessuno sa tutto: dillo a voce al pilota e ascolta gli altri («Non a destra, mina!»). «Nascondi» sfoca la mappa quando il pilota si avvicina.",
      ],
    });
  }
  if (role === "spectator") {
    sections.push({ title: "Per te", lines: ["Non corre la tua squadra in questa gara: guarda la TV e fai il tifo."] });
  }

  sections.push(
    {
      title: "Lo scopo",
      lines: [
        `${r.mode === "insieme" ? "Le squadre corrono insieme, ognuna nel suo labirinto (diverso ma equivalente)." : "Le squadre corrono una alla volta."} Si gioca ${plural(r.levels, "livello", "livelli")} da ${duration(r.levelSeconds)}, sempre più difficili. Il pilota cambia a ogni livello.`,
        r.keys > 0 ? `Per aprire l'uscita serve ${r.keys === 1 ? "la chiave" : `raccogliere tutte le ${r.keys} chiavi`}: poi si arriva all'uscita (la bandierina).` : "L'uscita è sempre aperta: basta arrivarci (la bandierina).",
      ],
    },
    {
      title: "Pericoli",
      lines: [
        `Una MINA o una PATTUGLIA rimanda il pilota all'ultimo punto di controllo (il rombo) e lo ferma ${duration(Math.round(r.penaltyMs / 1000))}. La mina diventa visibile a tutti.`,
        "Una PORTA chiusa è un urto: si resta fermi per 1 secondo. Le porte si aprono e chiudono a periodi regolari. I muri non fanno nulla.",
        `Tra un passo e l'altro passano almeno ${r.stepMs} millisecondi.`,
      ],
    },
    {
      title: "Punti",
      lines: [
        `Chi arriva prende ${r.finishPoints.map((p) => `${p}`).join(", ")} punti secondo l'ordine di arrivo (oltre la lista vale l'ultimo valore).`,
        `Chi non arriva prende fino a ${plural(r.distancePoints, "punto", "punti")}, in proporzione alla strada fatta.`,
        r.strikePenalty > 0 ? `Ogni mina o pattuglia costa ${plural(r.strikePenalty, "punto", "punti")} (mai sotto zero nel livello).` : "Mine e pattuglie non tolgono punti.",
        "I punti sono della squadra, e li prende ogni membro.",
      ],
    },
  );
  return sections;
}
