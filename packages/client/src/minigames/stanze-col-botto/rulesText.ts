import { duration } from "../caccia-fantasmi/rulesText";
import type { Card, Rules } from "./types";

export interface RulesSection {
  title: string;
  /** Un paragrafo per voce. */
  lines: string[];
}

export const CHARACTER_LABEL: Record<Card["character"], string> = {
  president: "Presidente",
  bomber: "Bombarolo",
  "blue-member": "Squadra Blu",
  "red-member": "Squadra Rossa",
  gambler: "Giocatore d'azzardo",
};

export const TEAM_LABEL = { blue: "Blu", red: "Rossa", grey: "Grigia" } as const;

/** «1 ostaggio», «2 ostaggi». */
export const hostagesText = (n: number) => `${n} ${n === 1 ? "ostaggio" : "ostaggi"}`;

/**
 * Le regole in parole, con i numeri di questa partita. «Per te» dipende dalla carta (null = non ancora distribuita).
 * Se si cambiano le regole del gioco va aggiornato anche questo testo (il test controlla che i numeri compaiano).
 */
export function rulesSections(card: Card | null, r: Rules): RulesSection[] {
  const sections: RulesSection[] = [];

  if (card) {
    const mine: string[] = [];
    switch (card.character) {
      case "president":
        mine.push("Sei il PRESIDENTE, squadra Blu. Alla fine devi trovarti in una stanza diversa da quella del Bombarolo: fidati dei tuoi, ma non di tutti.");
        break;
      case "bomber":
        mine.push("Sei il BOMBAROLO, squadra Rossa. Alla fine devi trovarti nella stessa stanza del Presidente: trovalo senza farti scoprire.");
        break;
      case "blue-member":
        mine.push("Sei della squadra BLU. Aiuta il Presidente a restare lontano dal Bombarolo.");
        break;
      case "red-member":
        mine.push("Sei della squadra ROSSA. Aiuta il Bombarolo a raggiungere il Presidente.");
        break;
      case "gambler":
        mine.push("Sei il GIOCATORE D'AZZARDO, senza squadra. Alla fine dichiari quale squadra vincerà: se indovini, vinci anche tu.");
        break;
    }
    mine.push("Per vedere la tua carta tieni premuto il pulsante in alto. Non girare il telefono verso gli altri: per mostrare la carta usa i pulsanti dell'app.");
    sections.push({ title: "Per te", lines: mine });
  }

  const rounds = r.rounds.map((x, i) => `Round ${i + 1}: ${duration(x.seconds)}, ${hostagesText(x.hostages)}`).join(" · ");
  sections.push(
    {
      title: "Lo scopo",
      lines: [
        `In ${r.players} giocatori ci si divide in due stanze. La squadra Blu protegge il Presidente, la squadra Rossa ha il Bombarolo. Dopo l'ultimo scambio, se Presidente e Bombarolo sono nella stessa stanza vince la Rossa, altrimenti la Blu.`,
        "Si parla a voce, di persona. Tra le due stanze non si comunica in nessun modo.",
      ],
    },
    {
      title: "I round",
      lines: [`${rounds}.`, "Quando il tempo scade, il leader di ogni stanza sceglie gli ostaggi da mandare nell'altra stanza. Il leader non può essere ostaggio."],
    },
    {
      title: "Il leader",
      lines: [
        "Si sceglie votando: chi ottiene più della metà dei voti della stanza diventa leader, e si può cambiare finché c'è tempo. Se la stanza non ha leader, chiunque può nominarne uno (non sé stesso).",
        "Il leader può passare la carica a un compagno che accetta; chi la accetta non può restituirla nello stesso round.",
        "Il leader della tua stanza lo vedi subito. Quello dell'altra stanza compare per tutti quando entrambe le stanze hanno bloccato il proprio.",
      ],
    },
    {
      title: "Mostrare la carta",
      lines: [
        ...(r.shareMethod === "qr"
          ? ["Una carta si vede solo se entrambi siete d'accordo: nessuno può mostrarla da solo."]
          : ["«Mostra» fa vedere la tua carta a un giocatore della stanza (o a tutti): lui non deve ricambiare. «Scambia» è reciproco: vedete la carta l'uno dell'altro nello stesso istante."]),
        ...(r.shareMethod === "app"
          ? ["«Scambia» si propone dall'app: tocca un nome e l'altro accetta."]
          : [
              `${r.shareMethod === "qr" ? "Si scambia solo con i QR" : "«Scambia» si può fare anche con i QR"}: apri «Scambia con i QR» e inquadratevi a vicenda i QR dei telefoni.`,
              "La carta si vede solo quando vi siete inquadrati entrambi, così tutta la stanza vede che lo scambio è avvenuto.",
            ]),
        r.colorAllowed ? "Si può mostrare anche solo il colore della squadra, senza il personaggio." : "Con questo numero di giocatori si può mostrare solo la carta intera, non il solo colore.",
      ],
    },
    {
      title: "Dopo ogni round",
      lines: [
        "I leader confermano gli ostaggi e i telefoni degli ostaggi dicono in quale stanza andare. Poi i leader premono «Avvia il round»: parte quando l'hanno premuto entrambi, " +
          `${duration(r.startAfterFirstSeconds)} dopo il primo, oppure comunque ${duration(r.startAfterExchangeSeconds)} dopo lo scambio.`,
      ],
    },
  );
  return sections;
}
