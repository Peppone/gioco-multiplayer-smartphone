/** Le regole di Shadow Tournament spiegate nell'app (schermo e telefono). I numeri arrivano dalla configurazione della partita. */

export interface Costs {
  bet: number;
  shield: number;
  trap: number;
  swap: number;
  counter: number;
  extraLife?: number;
}

export interface DeckCard {
  label: string;
  qty: number;
  tokens: number;
  nextLives: number;
  either: boolean;
}

export interface Rules {
  startLives: number;
  maxLives: number;
  startTokens: number;
  maxTokens: number;
  allStartLoser: boolean;
  costs: Costs;
  decks: { normal: DeckCard[]; legendary: DeckCard[] };
  points: { placement: number[]; placementMin: number; boutWin: number; prediction: number };
}

export interface Section {
  title: string;
  lines: string[];
}

const tokens = (n: number) => `${n} token`;
const lives = (n: number) => `${n} ${n === 1 ? "vita" : "vite"}`;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** «+2 token e 1 vita», «−1 token», «Nessun effetto»… */
function effectText(c: DeckCard): string {
  const parts: string[] = [];
  if (c.tokens !== 0) parts.push(`${signed(c.tokens)} token`);
  if (c.nextLives !== 0) parts.push(`${signed(c.nextLives)} ${Math.abs(c.nextLives) === 1 ? "vita" : "vite"} nel prossimo scontro`);
  if (parts.length === 0) return "nessun effetto";
  return parts.join(c.either ? " oppure " : " e ");
}

function deckLine(name: string, cards: DeckCard[]): string {
  const total = cards.reduce((n, c) => n + c.qty, 0);
  return `${name} (${total} carte): ${cards.filter((c) => c.qty > 0).map((c) => `${c.label} ×${c.qty} (${effectText(c)})`).join("; ")}.`;
}

export function rulesSections(r: Rules): Section[] {
  const c = r.costs;
  const first = r.points.placement[0] ?? 0;
  return [
    {
      title: "Obiettivo",
      lines: [
        "Shadow Tournament è un torneo a eliminazione: vince l'ultimo giocatore rimasto in gioco.",
        r.allStartLoser
          ? "Tutti partono con stato L: alla prima sconfitta si è eliminati."
          : "Si comincia con stato W (nessuna sconfitta). Se perdi uno scontro diventi L; se ne perdi un altro sei eliminato.",
      ],
    },
    {
      title: "Il turno",
      lines: [
        "A ogni turno il gioco forma le coppie da solo (W con W, L con L, senza rifare l'ultimo scontro) e tutti gli scontri si giocano insieme.",
        "Se i giocatori sono in numero dispari, uno resta solo e sceglie tra due strade: il Bye (salta il turno, senza rischi né premi) oppure l'NPC (affronta un avversario controllato da un giocatore eliminato, o dal computer; se perde è una sconfitta vera).",
      ],
    },
    {
      title: "Lo scontro e gli scambi",
      lines: [
        `Ogni scontro si gioca a scambi. Si parte da ${lives(r.startLives)} (massimo ${r.maxLives}); chi arriva a 0 perde lo scontro.`,
        "In ogni scambio scegli in segreto una carta: Attacco, Difesa o Raggiro. Si rivelano insieme.",
        "Attacco batte Raggiro, Raggiro batte Difesa, Difesa batte Attacco. Chi perde lo scambio perde 1 vita.",
        "Se giocate la stessa carta è un pareggio: non succede nulla e si rigioca.",
        "Se non scegli in tempo gioca una carta a caso, senza azioni.",
      ],
    },
    {
      title: "I token e le azioni",
      lines: [
        `Hai ${tokens(r.startTokens)} all'inizio e puoi tenerne al massimo ${r.maxTokens} (quelli in più si perdono). Servono per le azioni: una sola azione per scambio.`,
        `Vita extra (${tokens(c.extraLife ?? 2)}): prima dello scontro, in segreto, parti con una vita in più.`,
        `Scommessa (${tokens(c.bet)}): la scegli insieme alla carta. Se vinci lo scambio, l'avversario perde 1 vita in più. Con un pareggio o una sconfitta il token è perso.`,
        `Scudo (${tokens(c.shield)}): dopo la rivelazione, se hai perso lo scambio, non perdi la vita.`,
        `Trappola (${tokens(c.trap)}): dopo la rivelazione, chiunque: nello scambio dopo, l'avversario non può giocare la carta che ha appena giocato.`,
        `Cambia carta (${tokens(c.swap)}): dopo la rivelazione, se hai perso o pareggiato, cambi la tua carta. L'avversario può pagare ${tokens(c.counter)} per annullare tutto e far rigiocare lo scambio.`,
        "Chi ha scommesso in uno scambio non può fare altre azioni in quello scambio.",
      ],
    },
    {
      title: "Dopo lo scontro",
      lines: [
        "Chi vince lo scontro pesca una carta ricompensa e sceglie da quale mazzo: il Normale è sicuro e rende poco, il Leggendario rende di più ma può costare. La carta torna nel mazzo dopo la pescata.",
        deckLine("Mazzo Normale", r.decks.normal),
        deckLine("Mazzo Leggendario", r.decks.legendary),
        "Gli effetti sui token valgono subito, quelli sulle vite valgono per il prossimo scontro. Le carte «a scelta» ti lasciano decidere cosa subire. Le vite rimaste a fine scontro non si conservano.",
      ],
    },
    {
      title: "Se sei eliminato",
      lines: [
        "Non resti a guardare: puoi essere estratto per fare l'NPC in uno scontro (giochi per divertimento, senza guadagnare né perdere nulla) e pronosticare chi vince lo scontro in evidenza prima della prima rivelazione.",
        `Ogni pronostico giusto vale ${r.points.prediction} punti.`,
      ],
    },
    {
      title: "I punti",
      lines: [
        `Piazzamento nel torneo: ${r.points.placement.map((p, i) => `${i + 1}° ${p}`).join(", ")}, poi a scalare fino a ${r.points.placementMin} per il primo eliminato${first ? "" : ""}.`,
        `In più, ${r.points.boutWin} punti per ogni scontro vinto (anche contro l'NPC) e ${r.points.prediction} per ogni pronostico giusto.`,
      ],
    },
  ];
}
