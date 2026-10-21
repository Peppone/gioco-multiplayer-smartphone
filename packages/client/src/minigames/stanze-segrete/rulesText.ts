import type { Rules } from "./types";

export interface RulesSection {
  title: string;
  paragraphs: string[];
}

/** Le regole spiegate nell'app, con i valori veri della partita (la pagina «Regole» del telefono). */
export function rulesSections(r: Rules): RulesSection[] {
  return [
    {
      title: "L'idea",
      paragraphs: [
        r.rows !== undefined && r.cols !== undefined
          ? `Siete chiusi in un complesso di ${r.rows * r.cols} stanze (${r.rows} × ${r.cols}) e dovete trovare l'uscita. Ogni stanza nasconde una lettera.`
          : "Siete chiusi in un complesso di stanze e dovete trovare l'uscita. Ogni stanza nasconde una lettera. La mappa la mostra il Game Master quando vuole.",
        "Il Game Master è una persona, non il telefono: racconta la storia e decide cosa potete fare e quando.",
      ],
    },
    {
      title: "Cosa puoi fare",
      paragraphs: [
        "Non puoi fare nulla finché il Game Master non te lo permette. Quando ti abilita, sul telefono compare il pulsante giusto; quando te lo toglie, sparisce.",
        "Un permesso può durare poco o avere un numero limitato di usi: il conto alla rovescia è sul pulsante.",
      ],
    },
    {
      title: "Muoversi e sbirciare",
      paragraphs: [
        "Con il permesso compare una croce con le frecce. Premendone una chiedi di andare (o di guardare) in quella direzione: non ti muovi finché il Game Master non approva.",
        "Una freccia con il lucchetto è bloccata. Le frecce non dicono dove portano: vedi solo le direzioni possibili.",
      ],
    },
    {
      title: "La mappa che hai esplorato",
      paragraphs: [
        "Il Game Master può farti vedere le stanze in cui sei già stato, disegnate una accanto all'altra. Non vedi quelle che non hai visitato né dove sono gli altri, a parte chi è nella tua stanza.",
        "Sbirciare non conta come visitare. Le stanze lontane non sono collegate sulla mappa: non sai cosa c'è in mezzo.",
      ],
    },
    {
      title: "Le lettere",
      paragraphs: [
        `Nessuno vede le lettere di diritto. Quando il Game Master ti permette di guardare, tieni premuto il riquadro: la lettera resta visibile ${r.sightSec} secondi per ogni occhiata, poi sparisce.`,
        "Il telefono non la ricorda: ricordala a mente o parlatene tra voi.",
      ],
    },
    {
      title: "Oggetti",
      paragraphs: [
        "Nelle stanze possono esserci degli oggetti. Se il Game Master ti dice che c'è qualcosa, lo vedi come «Un oggetto», senza sapere cos'è.",
        "Solo quando il Game Master lo palesa a te (o a tutti i presenti) ne scopri il nome e, se c'è, il testo da leggere. Se esci dalla stanza non lo vedi più.",
      ],
    },
    {
      title: "Dadi",
      paragraphs: [
        "Il Game Master può farti tirare un dado (da 4 a 20 facce): compare il pulsante «Lancia», lo tocchi e il dado rotola. Il numero lo decide il server, non il telefono.",
        "A volte il Game Master tira per te o nasconde il risultato: il dado rotola lo stesso, ma il numero lo vede solo lui.",
      ],
    },
    {
      title: "Messaggi",
      paragraphs: [
        "Leggi sempre i messaggi del Game Master. Se te lo consente puoi rispondere sotto il messaggio.",
        `Per scrivergli di tua iniziativa serve il permesso «Scrivi al Master». Massimo ${r.messageMaxLength} caratteri.`,
      ],
    },
    {
      title: "Eventi",
      paragraphs: [
        "Un evento è una comunicazione ufficiale (per esempio «crolla il soffitto»). Compare a tutto schermo con scritto «Evento:» e va accettato.",
        "Nella scheda «Eventi» ritrovi tutti quelli che hai ricevuto.",
      ],
    },
    {
      title: "Posizioni e punti",
      paragraphs: [
        r.positionsPublic ? "Lo schermo mostra in quale stanza si trova ognuno." : "Lo schermo non mostra dove sono i giocatori.",
        "Il Game Master dichiara chi è fuggito e chi ha risolto: i punti arrivano a fine partita.",
      ],
    },
  ];
}
