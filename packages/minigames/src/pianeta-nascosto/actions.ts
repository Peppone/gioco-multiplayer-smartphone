import { COSTS, TARGETS_PER_TEAM, arcError, arcLength, arcSectors, isVisible, sectorOfTime, surveyCost } from "./board.js";
import { clueText, objectName } from "./clues.js";
import { type Mode, type ObjectKind, SECTORS, neighbors, seenOf } from "./sky.js";
import type { Action, ActionResult, Observatory } from "./types.js";

/** Costo in giorni di un'azione (piano, §3.3). */
export function actionCost(action: Action, mode: Mode): number {
  switch (action.type) {
    case "survey":
      return surveyCost(arcLength(action.from, action.to, SECTORS[mode]));
    case "target":
      return COSTS.target;
    case "research":
      return COSTS.research;
    case "locate":
      return COSTS.locate;
    case "pass":
      return COSTS.pass;
  }
}

/**
 * Perché un'azione non si può fare adesso (null = si può): cielo visibile, archi delle comete, gettoni di puntamento,
 * ricerca non consecutiva. I messaggi sono per i giocatori.
 */
export function actionError(action: Action, obs: Observatory, mode: Mode): string | null {
  const n = SECTORS[mode];
  const earthSector = sectorOfTime(obs.time, n);
  switch (action.type) {
    case "survey": {
      const err = arcError(action.object, action.from, action.to, earthSector, mode);
      if (err === "not-visible") return "L'arco esce dal cielo visibile";
      if (err === "too-long") return "L'arco supera metà del cielo";
      if (err === "comet-ends") return "Per le comete l'arco deve iniziare e finire su un settore da cometa";
      return null;
    }
    case "target":
      if (action.sector > n || !isVisible(action.sector, earthSector, n)) return "Il settore non è nel cielo visibile";
      return obs.targetsLeft > 0 ? null : "Gettoni di puntamento finiti";
    case "research":
      if (obs.lastWasResearch) return "Ricerca appena fatta: non due volte di fila";
      if (obs.log.some((l) => l.result.type === "research" && l.result.topic === action.topic)) return "Hai già letto questa ricerca";
      return null;
    case "locate":
      return action.sector > n ? "Settore non valido" : null;
    case "pass":
      return null;
  }
}

/** Il risultato di un'azione sul sistema vero. */
export function actionResult(action: Action, sky: ObjectKind[]): ActionResult {
  const n = sky.length;
  switch (action.type) {
    case "survey": {
      const count = arcSectors(action.from, action.to, n).filter((s) => seenOf(sky[s - 1]!) === action.object).length;
      return { type: "survey", count };
    }
    case "target":
      return { type: "target", seen: seenOf(sky[action.sector - 1]!) };
    case "research":
      return { type: "research", topic: action.topic };
    case "locate": {
      const [l, r] = neighbors(action.sector, n);
      return { type: "locate", ok: sky[action.sector - 1] === "planetX" && sky[l - 1] === action.left && sky[r - 1] === action.right };
    }
    case "pass":
      return { type: "pass" };
  }
}

/** Gettoni di puntamento iniziali. */
export const INITIAL_TARGETS = TARGETS_PER_TEAM;

// ---- Testi (cronaca e registro) ----

const SEEN_NAMES: Record<string, string> = { asteroid: "asteroidi", comet: "comete", gas: "nubi di gas", dwarf: "pianeti nani", empty: "settori vuoti" };
const SEEN_ONE: Record<string, string> = { asteroid: "asteroide", comet: "cometa", gas: "nube di gas", dwarf: "pianeta nano", empty: "settore vuoto" };

const arcText = (from: number, to: number) => (from === to ? `${from}` : `${from}–${to}`);

/** Cosa ha scelto la squadra, per la cronaca pubblica (mai il risultato). */
export function publicActionText(action: Action, outcome?: ActionResult): string {
  switch (action.type) {
    case "survey":
      return `rileva ${SEEN_NAMES[action.object]} nei settori ${arcText(action.from, action.to)}`;
    case "target":
      return `punta il settore ${action.sector}`;
    case "research":
      return `legge la ricerca ${action.topic}`;
    case "locate":
      return `localizza il Pianeta X: ${outcome?.type === "locate" ? (outcome.ok ? "RIUSCITO" : "FALLITO") : "…"}`;
    case "pass":
      return "passa";
  }
}

/** La riga del registro della squadra, con il risultato. */
export function logText(action: Action, result: ActionResult, researchText?: string): string {
  switch (result.type) {
    case "survey":
      return `Rilevamento di ${SEEN_NAMES[(action as { object: string }).object]} nei settori ${arcText((action as { from: number }).from, (action as { to: number }).to)}: ${result.count}`;
    case "target":
      return `Puntamento del settore ${(action as { sector: number }).sector}: ${result.seen === "empty" ? "appare vuoto" : SEEN_ONE[result.seen]}`;
    case "research":
      return `Ricerca ${result.topic}: ${researchText ?? "…"}`;
    case "locate":
      return `Localizzazione: ${result.ok ? "riuscita" : "fallita"}`;
    case "pass":
      return "Turno passato";
  }
}

export { clueText, objectName };
