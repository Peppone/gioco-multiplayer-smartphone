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
export function rulesSections(r: Settings): RulesSection[] {
  const expert = r.mode === "expert";
  const tokens = r.tokens;
  const total = tokens.asteroid + tokens.comet + tokens.gas + tokens.dwarf;
  return [
    {
      title: "Lo scopo",
      lines: [
        `Ogni squadra è un osservatorio che scruta un sistema solare di ${r.sectors} settori disposti in cerchio. In ogni settore c'è un asteroide, una cometa, una nube di gas, un pianeta nano oppure il vuoto. Da qualche parte si nasconde il Pianeta X, che agli strumenti SEMBRA UN SETTORE VUOTO.`,
        "Si fanno punti trovando il Pianeta X e pubblicando teorie giuste sugli altri oggetti. Le informazioni arrivano da rilevamenti, puntamenti, ricerche e conferenze: il resto è deduzione.",
      ],
    },
    {
      title: "Il tempo",
      lines: [
        r.turnMode === "sequential"
          ? "Agisce l'osservatorio più indietro sul tracciato del tempo, uno alla volta. Chi finisce in un settore già occupato si mette davanti agli altri, quindi gioca dopo."
          : "Agiscono insieme tutte le squadre che sono nel settore più arretrato del tracciato del tempo.",
        `Ogni azione costa giorni, cioè settori da percorrere. ${r.maxDays > 0 ? `Dopo ${plural(r.maxDays, "giorno", "giorni")} si apre l'ipotesi finale sul Pianeta X.` : "Non c'è un limite di giorni: la partita finisce quando qualcuno localizza il Pianeta X."}`,
        `${r.turnSeconds > 0 ? `Per scegliere l'azione avete ${duration(r.turnSeconds)}` : "Per scegliere l'azione non c'è un limite di tempo"}: ${r.decision === "vote" ? "ognuno propone, la squadra vota e in parità decide il capitano" : "ognuno propone e decide il capitano"}. Senza proposte la squadra passa e perde un giorno.`,
      ],
    },
    {
      title: "Le azioni",
      lines: [
        `RILEVARE (4 giorni per 1–3 settori, 3 per 4–6${expert ? ", 2 per 7–9" : ""}): quanti oggetti di un tipo ci sono in settori consecutivi del cielo visibile. Rilevando «vuoto» si conta anche il Pianeta X. Per le comete l'arco deve iniziare e finire su un settore da cometa.`,
        `PUNTARE (4 giorni, ${plural(r.targets, "gettone", "gettoni")} per squadra in tutta la partita): che oggetto c'è in un settore visibile. Il Pianeta X appare vuoto.`,
        "RICERCA (1 giorno, mai due volte di fila): il testo di una regola vera in questa partita. Le etichette delle sei ricerche si vedono sul tabellone, i testi solo a chi li legge.",
        "LOCALIZZARE (5 giorni): indicate il settore del Pianeta X e gli oggetti nei due settori vicini. Se è giusto la partita finisce; si annuncia a tutti soltanto se è riuscito o no.",
      ],
    },
    {
      title: "La Terra e le conferenze",
      lines: [
        `Dopo ogni turno la Terra ruota fino alla freccia sull'osservatorio più arretrato: si vede solo metà dei settori (${r.sectors / 2}), quella che parte dalla freccia. Rilevamenti e puntamenti si fanno solo nel cielo visibile.`,
        `Quando passa su un'icona ▤ si apre una fase teoria, a ogni giro. Su un'icona ▲ si tiene una conferenza: un indizio sul Pianeta X per tutti, ${expert ? "X1 e X2, " : ""}solo la prima volta.`,
      ],
    },
    {
      title: "Le teorie",
      lines: [
        `Nella fase teoria ogni squadra sceglie fino a ${plural(r.theoriesPerPhase, "teoria", "teorie")} (oggetto e settore). I gettoni sono limitati e non tornano: ${tokens.asteroid} asteroidi, ${tokens.comet} comete, ${tokens.gas} nubi di gas, ${tokens.dwarf} ${tokens.dwarf === 1 ? "pianeta nano" : "pianeti nani"} (${total} in tutto). Sono segreti: nessuno sa quanti ne restano agli altri.`,
        "Le teorie sono coperte e avanzano sulla pista del settore. Quando arrivano in fondo si controllano: se è giusta il settore è confermato per tutti, se è sbagliata si sa che l'oggetto non è quello, il gettone è perso e la squadra avanza di 1 giorno.",
      ],
    },
    {
      title: "Punti",
      lines: [
        `Teoria giusta: asteroide 2, cometa 3, nube di gas 4, pianeta nano ${expert ? 2 : 4}. Bonus di priorità: 1 punto per ogni settore in cui eravate i primi con la teoria giusta.`,
        "Pianeta X localizzato per primi: 10 punti. Le altre squadre hanno un'ultima opportunità: una teoria (o due se sono indietro di 4–5 giorni) oppure la localizzazione, che vale 2 punti per ogni giorno di ritardo.",
        `${r.maxDays > 0 ? "Con l'ipotesi finale ogni squadra indica in segreto il Pianeta X: se è giusto vale 5 punti. " : ""}Tutti i punti si moltiplicano per ${r.pointScale}.`,
      ],
    },
    {
      title: "Il foglio appunti",
      lines: [
        `Sulla ruota ogni oggetto di ogni settore si segna: tocco per escluderlo (✗), supporlo (○) o confermarlo (◉). Il foglio è condiviso con la squadra. ${r.assist ? "L'aiuto è acceso: il foglio segna da solo le certezze dirette." : "Le deduzioni le fate voi."}`,
        "I quadrati pieni (■) sono informazioni iniziali o confermate dalle revisioni e non si cambiano.",
      ],
    },
  ];
}
