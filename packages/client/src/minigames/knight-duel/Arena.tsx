import { useEffect, useMemo, useState } from "react";
import { DuelCard } from "./Cards";
import { KNIGHT_TILE, Sprite } from "./Sprite";
import { applyEvent, initialHp, narrate, stepEvents } from "./narration";
import type { BattleEventV, CardV, ResultV, Side, SideView } from "./types";

/** Effetto dell'evento in corso su ciascun lato: classi CSS per animare il cavaliere. */
function effects(active: BattleEventV | null): { fx: [string, string]; float: [string | null, string | null] } {
  const fx: [string, string] = ["", ""];
  const float: [string | null, string | null] = [null, null];
  if (!active) return { fx, float };
  switch (active.type) {
    case "damage":
      fx[active.source] = active.kind === "heavy" ? "fx-heavy" : "fx-attack";
      if (active.amount > 0) {
        fx[active.target] = "fx-hit";
        float[active.target] = `-${active.amount}`;
      } else {
        fx[active.target] = "fx-block";
        float[active.target] = "Bloccato!";
      }
      break;
    case "poison-tick":
      fx[active.side] = "fx-poison";
      float[active.side] = `-${active.damage}`;
      break;
    case "shield":
      fx[active.side] = "fx-shield";
      float[active.side] = `🛡 ${active.amount}`;
      break;
    case "counter-ready":
      fx[active.side] = "fx-guard";
      break;
    case "heal":
      fx[active.side] = "fx-heal";
      float[active.side] = `+${active.amount}`;
      break;
    case "poison":
      fx[active.target] = "fx-poison";
      float[active.target] = "☠";
      break;
    case "steal":
    case "spy":
      fx[active.side] = "fx-magic";
      break;
    case "sabotage":
      fx[active.target] = "fx-curse";
      break;
    case "ko":
      fx[active.side] = "fx-ko";
      break;
  }
  return { fx, float };
}

function Fighter({ side, view, hp, fx, floating, floatKey, small, tiny, ko }: { side: Side; view: SideView; hp: number; fx: string; floating: string | null; floatKey: number; small: boolean; tiny: boolean; ko: boolean }) {
  const pct = Math.max(0, Math.min(100, (hp / view.maxHp) * 100));
  return (
    <div className={`fighter side-${side} ${fx} ${ko || hp <= 0 ? "dead" : ""}`} style={{ ["--team" as string]: view.color }}>
      <div className="fighter-name">{view.name}</div>
      <div className="hp-bar" role="progressbar" aria-valuenow={hp} aria-valuemax={view.maxHp} aria-label={`PV ${view.name}`}>
        <i style={{ width: `${pct}%` }} />
        <span>{hp}/{view.maxHp}</span>
      </div>
      <div className="knight">
        {floating && <span key={floatKey} className="float">{floating}</span>}
        <span className="cape" />
        <Sprite index={KNIGHT_TILE[side] ?? 96} scale={tiny ? 3 : small ? 4 : 8} flip={side === 1} label={`Cavaliere ${view.name}`} />
        <span className="base" />
      </div>
      <div className="status">
        {view.poison > 0 && <span className="tag poison">☠ {view.poison}</span>}
        <span className="tag hand">🂠 {view.handCount}</span>
      </div>
    </div>
  );
}

/** I due cavalieri uno di fronte all'altro, con PV ed effetti dell'evento in corso. */
export function Arena({ sides, hp, active, activeKey = 0, small = false, tiny = false, ko = [false, false] }: { sides: [SideView, SideView]; hp: [number, number]; active?: BattleEventV | null; activeKey?: number; small?: boolean; tiny?: boolean; ko?: [boolean, boolean] }) {
  const { fx, float } = effects(active ?? null);
  return (
    <div className={`arena ${small || tiny ? "small" : ""} ${tiny ? "tiny" : ""}`}>
      <Fighter side={0} view={sides[0]} hp={hp[0]} fx={fx[0]} floating={float[0]} floatKey={activeKey} small={small} tiny={tiny} ko={ko[0]} />
      <div className="versus">VS</div>
      <Fighter side={1} view={sides[1]} hp={hp[1]} fx={fx[1]} floating={float[1]} floatKey={activeKey} small={small} tiny={tiny} ko={ko[1]} />
    </div>
  );
}

const REVEAL_MS = 1_200;
const STEP_MS = 1_100;

/**
 * Anima l'esito di una battaglia: prima si rivelano le carte giocate, poi ogni evento a turno
 * (le barre dei PV scendono e salgono). Si riparte da capo quando arriva un nuovo risultato.
 */
export function useReplay(result: ResultV | null, sides: [SideView, SideView]) {
  const steps = useMemo(() => (result ? stepEvents(result.events) : []), [result]);
  const [index, setIndex] = useState(-1); // -1 = solo carte rivelate

  useEffect(() => {
    setIndex(-1);
    if (!result) return;
    const timers: number[] = [];
    steps.forEach((_, i) => timers.push(window.setTimeout(() => setIndex(i), REVEAL_MS + i * STEP_MS)));
    return () => timers.forEach(window.clearTimeout);
  }, [result, steps]);

  return useMemo(() => {
    const max: [number, number] = [sides[0].maxHp, sides[1].maxHp];
    const final: [number, number] = [sides[0].hp, sides[1].hp];
    let hp = result ? initialHp(final, max, steps) : final;
    for (let i = 0; i <= index; i++) hp = applyEvent(hp, steps[i]!, max);
    const names: [string, string] = [sides[0].name, sides[1].name];
    const log = steps.slice(0, index + 1).map((e) => narrate(e, names, result?.cards ?? {})).filter((x): x is string => x !== null);
    const plays: [CardV[], CardV[]] = [[], []];
    for (const e of result?.events ?? []) if (e.type === "play" && result!.cards[e.cardId]) plays[e.side].push(result!.cards[e.cardId]!);
    return {
      hp,
      active: index >= 0 ? steps[index]! : null,
      index,
      plays,
      log,
      done: !result || index >= steps.length - 1,
      ko: [index >= 0 && steps.slice(0, index + 1).some((e) => e.type === "ko" && e.side === 0), index >= 0 && steps.slice(0, index + 1).some((e) => e.type === "ko" && e.side === 1)] as [boolean, boolean],
    };
  }, [result, sides, steps, index]);
}

/** Arena + carte rivelate + cronaca: lo scontro di una battaglia, per schermo e telefoni. */
export function BattleReplay({ result, sides, small = false }: { result: ResultV; sides: [SideView, SideView]; small?: boolean }) {
  const r = useReplay(result, sides);
  return (
    <div className="battle-replay">
      <Arena sides={sides} hp={r.hp} active={r.active} activeKey={r.index} small={small} ko={r.ko} />
      <div className="plays">
        {([0, 1] as const).map((s) => (
          <div key={s} className="played" style={{ ["--team" as string]: sides[s].color }}>
            {r.plays[s].length === 0 ? <small className="muted">nessuna carta</small> : r.plays[s].map((c, i) => <DuelCard key={i} card={c} size={small ? "compact" : "large"} />)}
          </div>
        ))}
      </div>
      <ol className="battle-log" aria-live="polite">
        {r.log.slice(-4).map((line, i) => <li key={`${r.log.length}-${i}`}>{line}</li>)}
      </ol>
    </div>
  );
}
