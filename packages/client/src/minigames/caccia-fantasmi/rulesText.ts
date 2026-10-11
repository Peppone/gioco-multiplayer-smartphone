export type Role = "ghost" | "hunter";

/** I valori della partita (arrivano dal server nella vista del telefono). */
export interface Rules {
  zoneCount: number;
  ghostCount: number;
  durationSec: number;
  headStartSec: number;
  scanCooldownSec: number;
  accuseCooldownSec: number;
  jailSec: number;
  stunSec: number;
  holdPointsPerSec: number;
  flipPoints: number;
  catchPoints: number;
  wrongPenalty: number;
  winPoints: number;
  zoneLockSec: number;
  /** Peso effettivo di un secondo di controllo dei fantasmi (1 = nessun peso). */
  ghostWeight: number;
}

export interface RulesSection {
  title: string;
  /** Un paragrafo per voce. */
  lines: string[];
}

/** «1 secondo», «45 secondi», «2 minuti», «1 minuto e 30 secondi». */
export function duration(sec: number): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (sec < 60) return plural(sec, "secondo", "secondi");
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? plural(m, "minuto", "minuti") : `${plural(m, "minuto", "minuti")} e ${plural(s, "secondo", "secondi")}`;
}

/** Numero all'italiana: 1,5. */
export const num = (n: number) => String(n).replace(".", ",");

const points = (n: number) => `${n} ${n === 1 ? "punto" : "punti"}`;

/**
 * Le regole in parole, con i numeri di questa partita. Tutte le sezioni sono per tutti, tranne «Per te» che dipende dal ruolo.
 * Se si cambiano le regole del gioco va aggiornato anche questo testo (il test controlla che i numeri compaiano).
 */
export function rulesSections(role: Role, r: Rules): RulesSection[] {
  const ghosts = r.ghostCount === 1 ? "1 fantasma" : `${r.ghostCount} fantasmi`;
  const wait = r.scanCooldownSec > 0 ? ` Dopo una conquista aspetta ${duration(r.scanCooldownSec)} prima della prossima.` : "";
  const headStart =
    r.headStartSec > 0
      ? `All'inizio i fantasmi hanno ${duration(r.headStartSec)} di vantaggio per nascondersi: gli acchiappafantasmi non possono né controllare né conquistare né accusare.`
      : "Non c'è vantaggio iniziale: si parte tutti insieme.";

  const lock = r.zoneLockSec > 0;
  const mine: RulesSection =
    role === "ghost"
      ? {
          title: "Per te, che sei un FANTASMA",
          lines: [
            "Nessuno sa chi sei, tranne gli altri fantasmi. Non dirlo!",
            `Conquista le zone con «Infesta» e poi allontanati: chi ti vede lì potrebbe sospettare. Stare in mezzo alla folla vicino ai QR ti aiuta a non farti notare.`,
            ...(lock ? [`Una zona che hai appena infestato resta tua per ${duration(r.zoneLockSec)}: nessuno può riprenderla subito. Se ne trovi una dei cacciatori ancora bloccata, puoi aspettare lì, tra la gente, la fine del blocco.`] : []),
            headStart,
            `Se un acchiappafantasmi ti accusa, vai in prigione per ${duration(r.jailSec)}: non puoi né controllare né conquistare e perdi tutte le zone che tenevi. Il tuo nome diventa pubblico.`,
          ],
        }
      : {
          title: "Per te, che sei un ACCHIAPPAFANTASMI",
          lines: [
            `Cerca di capire ${r.ghostCount === 1 ? "chi è il fantasma" : "chi sono i fantasmi"}: chi è stato vicino a una zona infestata? Chi non è mai dove ti aspetti?`,
            `Purifica le zone con «Purifica».${lock ? " Una zona appena conquistata dai fantasmi è bloccata: inutile correre a riprenderla, aspetta la fine del blocco." : ""} Puoi accusare un giocatore dall'elenco «Accusa un fantasma» (due tocchi, per non sbagliare).`,
            `Accusa giusta: il fantasma va in prigione per ${duration(r.jailSec)}, perde le sue zone e tu guadagni ${points(r.catchPoints)}.`,
            `Accusa sbagliata: resti bloccato per ${duration(r.stunSec)} e perdi ${points(r.wrongPenalty)}. Tra due accuse devi aspettare ${duration(r.accuseCooldownSec)}.`,
            headStart,
          ],
        };

  return [
    {
      title: "L'obiettivo",
      lines: [
        `Nella location ci sono ${r.zoneCount} zone, ognuna con un QR. Due fazioni se le contendono: i FANTASMI (${ghosts}, segreti) e gli ACCHIAPPAFANTASMI (tutti gli altri).`,
        r.ghostWeight > 1
          ? `Dopo ${duration(r.durationSec)} vince la fazione con più punti di controllo: ogni secondo in cui si tiene una zona vale 1 per gli acchiappafantasmi e ${num(r.ghostWeight)} per i fantasmi, che sono pochi.`
          : `Dopo ${duration(r.durationSec)} vince la fazione che ha tenuto le zone per più secondi in totale.`,
      ],
    },
    {
      title: "Conquistare una zona",
      lines: [
        "Vai alla zona e scansiona il suo QR: con il pulsante «Scansiona il QR» qui nell'app, con la fotocamera del telefono oppure scrivendo il codice stampato sotto il QR.",
        `Prima la zona viene controllata e vedi com'è messa; poi premi il bottone per conquistarla: «Infesta» se sei un fantasma, «Purifica» se sei un acchiappafantasmi.${wait}`,
        ...(lock ? [`Dopo ogni conquista la zona è bloccata per ${duration(r.zoneLockSec)}: nessuno può riprenderla. Quando la controlli vedi se è ancora bloccata e per quanto.`] : []),
      ],
    },
    {
      title: "Lo stato delle zone è segreto",
      lines: [
        "Una zona può essere libera, infestata o purificata, ma lo vede solo chi la controlla di persona: né lo schermo né gli altri telefoni lo mostrano.",
        "Ciò che hai visto resta sul tuo telefono con «visto N s fa», ma nel frattempo qualcuno può averla cambiata. Per saperlo davvero devi tornare lì.",
      ],
    },
    mine,
    {
      title: "I punti",
      lines: [
        `Tenere una zona: ${points(r.holdPointsPerSec)} al secondo a chi l'ha conquistata per ultimo.`,
        `Strappare una zona al nemico: ${points(r.flipPoints)} in più.`,
        `Catturare un fantasma: ${points(r.catchPoints)}. Accusare un innocente: −${points(r.wrongPenalty)}.`,
        `Vincere: ${points(r.winPoints)} a ogni membro della fazione vincente (metà in caso di pareggio).`,
        "I tuoi punti restano nascosti fino alla fine, perché altrimenti rivelerebbero se tieni ancora una zona.",
      ],
    },
    {
      title: "La fine",
      lines: ["Allo scadere del tempo (o quando la regia chiude la caccia) si rivela tutto: chi era fantasma, lo stato di ogni zona e chi ha vinto."],
    },
  ];
}
