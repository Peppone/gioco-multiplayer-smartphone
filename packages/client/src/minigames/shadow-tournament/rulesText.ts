/** Le regole di Shadow Tournament spiegate nell'app (schermo e telefono). I numeri arrivano dalla configurazione. */

export interface Costs {
  bet: number;
  shield: number;
  trap: number;
  swap: number;
  counter: number;
  extraLife?: number;
}

export interface Section {
  title: string;
  lines: string[];
}

const tokens = (n: number) => `${n} token`;

export function rulesSections(costs: Costs, maxTokens: number): Section[] {
  return [
    {
      title: "Obiettivo",
      lines: [
        "È un torneo a eliminazione: resta in gioco l'ultimo. Ti sfidi a coppie in «scontri»; ogni scontro è una serie di «scambi».",
        "Hai uno stato W (nessuna sconfitta). Se perdi uno scontro diventi L; se perdi ancora, sei eliminato.",
      ],
    },
    {
      title: "Lo scambio",
      lines: [
        "Ognuno sceglie in segreto una carta e si rivelano insieme: Attacco batte Raggiro, Raggiro batte Difesa, Difesa batte Attacco.",
        "Chi perde lo scambio perde 1 vita. Stessa carta: pareggio, non succede nulla e si rigioca.",
        "Lo scontro finisce quando uno resta senza vite. Si parte da 3 vite a ogni scontro.",
      ],
    },
    {
      title: "I token",
      lines: [
        `Il token è la moneta del gioco (al massimo ${maxTokens}; quelli in più si perdono). Si spende per le azioni, una sola per scambio.`,
        `Vita extra (${tokens(costs.extraLife ?? 2)}, prima dello scontro): parti con una vita in più.`,
        `Scommessa (${tokens(costs.bet)}, prima, con la carta): se vinci lo scambio, l'avversario perde 1 vita in più.`,
        `Scudo (${tokens(costs.shield)}, dopo la rivelazione, se hai perso): non perdi la vita.`,
        `Trappola (${tokens(costs.trap)}, dopo la rivelazione, chiunque): nello scambio dopo l'avversario non può giocare la carta che ha appena giocato.`,
        `Cambia carta (${tokens(costs.swap)}, se hai perso o pareggiato): cambi la tua carta. L'avversario può pagare ${tokens(costs.counter)} per annullare e far rigiocare lo scambio.`,
      ],
    },
    {
      title: "Dopo lo scontro",
      lines: [
        "Chi vince pesca una carta ricompensa: dal mazzo Normale (sicuro, rende poco) o dal Leggendario (rende di più, ma può costare).",
        "Le carte possono dare o togliere token e vite nel prossimo scontro.",
      ],
    },
    {
      title: "Numero dispari",
      lines: [
        "Se sono in numero dispari, uno resta solo: sceglie il Bye (salta il turno) o l'NPC (affronta un avversario controllato da un eliminato, o dal computer). Perdere contro l'NPC conta come una sconfitta.",
      ],
    },
    {
      title: "Se sei eliminato",
      lines: ["Puoi fare l'NPC quando ti estraggono e pronosticare chi vince lo scontro in evidenza: ogni pronostico giusto vale punti."],
    },
  ];
}
