import { useEffect } from "react";
import { useSfx } from "../../audio/useAudio";
import { Countdown, useRemaining } from "../Countdown";
import type { MinigameViews } from "../registry";
import type { ControllerProps, ViewProps } from "../types";
import { Arena, BattleReplay } from "./Arena";
import { CardPicker, DuelCard, HandStrip } from "./Cards";
import { REASON_LABEL } from "./narration";
import type { DuelCommonV, DuelDoneV, DuelPlayerV, DuelScreenV, ProgressV, Side } from "./types";
import "./duel.css";

type ChildViews = Record<string, MinigameViews>;

const hpOf = (v: { sides: [{ hp: number }, { hp: number }] }): [number, number] => [v.sides[0].hp, v.sides[1].hp];

/** Barra di stato del duello: cavalieri piccoli con i PV e a che punto si è. */
function Hud({ v, mine, tiny = false }: { v: DuelCommonV; mine?: Side | null; tiny?: boolean }) {
  const next = v.minigamesLeft === 1 ? "tra 1 minigioco" : `tra ${v.minigamesLeft} minigiochi`;
  const left = v.suddenDeath ? "Battaglia a oltranza!" : `Battaglia ${Math.min(v.battleNo + 1, v.maxBattles)} di ${v.maxBattles} · ${v.minigamesLeft > 0 ? next : "prossimo scontro!"}`;
  return (
    <div className="duel-hud">
      <Arena sides={v.sides} hp={hpOf(v)} small={!tiny} tiny={tiny} />
      <p className="muted hud-line">
        {left}
        {mine !== null && mine !== undefined ? ` · tu sei ${v.sides[mine].name}` : ""}
      </p>
    </div>
  );
}

function Backs({ count }: { count: number }) {
  return (
    <div className="backs" aria-label={`${count} carte coperte`}>
      {Array.from({ length: count }, (_, i) => <DuelCard key={i} back />)}
    </div>
  );
}

function Progress({ p, label }: { p: ProgressV; label: string }) {
  return <span className="progress">{label}: {p.decided}/{p.members} hanno deciso</span>;
}

function Outcome({ v }: { v: DuelCommonV | DuelDoneV }) {
  const o = v.outcome;
  if (!o) return <p className="big">Duello concluso</p>;
  const reason = REASON_LABEL[o.reason] ?? "";
  return o.winner === null ? (
    <p className="big">Pareggio!</p>
  ) : (
    <p className="big winner" style={{ color: v.sides[o.winner].color }}>
      🏆 Vince {v.sides[o.winner].name} {reason}!
    </p>
  );
}

// ---------------------------------------------------------------- schermo condiviso

export function createDuelScreen(childViews: ChildViews) {
  return function DuelScreen({ view, clock, theme }: ViewProps) {
    const v = view as DuelScreenV | DuelDoneV;
    const sfx = useSfx(theme);
    const phase = v.phase;
    const shownUntil = "result" in v ? v.result?.shownUntil : undefined;

    // Un suono per ogni passaggio importante del duello.
    useEffect(() => {
      if (phase === "draft") sfx("start", 0.5);
      if (phase === "battle") sfx("reveal", 0.5);
      if (phase === "ended" || phase === "done") sfx("fanfare");
    }, [phase, sfx]);
    useEffect(() => void (shownUntil && sfx("buzz", 0.5)), [shownUntil, sfx]);

    if (v.phase === "done") {
      return (
        <div className="duel-screen">
          <Arena sides={v.sides} hp={[v.sides[0].hp, v.sides[1].hp]} ko={[v.outcome?.winner === 1, v.outcome?.winner === 0]} />
          <Outcome v={v} />
        </div>
      );
    }

    const child = v.minigame && childViews[v.minigame.typeId];
    return (
      <div className="duel-screen">
        {v.phase !== "battle-result" && v.phase !== "ended" && <Hud v={v} />}

        {v.phase === "minigame-select" && <p className="big">La regia sceglie il prossimo minigioco…</p>}

        {v.phase === "minigame" && v.minigame && (
          <div className="duel-minigame" data-theme={v.minigame.theme}>
            <p className="muted">Minigioco: {v.minigame.title}. Chi vince sceglie per primo una carta!</p>
            {child ? <child.Screen view={v.minigame.view} clock={clock} theme={v.minigame.theme} title={v.minigame.title} /> : <p>Minigioco sconosciuto: {v.minigame.typeId}</p>}
          </div>
        )}

        {v.phase === "draft" && v.draft && v.draft.phase === "picking" && v.draft.picker !== null && (
          <div className="duel-draft">
            {v.minigameWinner !== null && <p className="muted">{v.sides[v.minigameWinner].name} vince il minigioco!</p>}
            <p className="big" style={{ color: v.sides[v.draft.picker].color }}>{v.sides[v.draft.picker].name} sta scegliendo una carta…</p>
            <Backs count={v.draft.offeredCount} />
            {v.draft.progress && (
              <>
                <Countdown openedAt={v.draft.progress.deadline - 15_000} deadline={v.draft.progress.deadline} clock={clock} />
                <Progress p={v.draft.progress} label={v.sides[v.draft.picker].name} />
              </>
            )}
          </div>
        )}

        {v.phase === "battle" && (
          <div className="duel-battle">
            <p className="big pulse">Battaglia! Scegliete le carte in segreto</p>
            {v.battle && <BattleCountdown deadline={v.battle.deadline} clock={clock} />}
            <div className="votes">
              {([0, 1] as const).map((s) => (
                <div key={s} className="vote-card" style={{ borderColor: v.sides[s].color }}>
                  <b style={{ color: v.sides[s].color }}>{v.sides[s].name}</b>
                  {v.battle?.progress[s] && <Progress p={v.battle.progress[s]!} label="Team" />}
                  <Backs count={v.sides[s].handCount} />
                </div>
              ))}
            </div>
          </div>
        )}

        {v.phase === "battle-result" && v.result && <BattleReplay result={v.result} sides={v.sides} />}

        {v.phase === "ended" && (
          <div className="duel-ended">
            <Arena sides={v.sides} hp={hpOf(v)} ko={[v.outcome?.winner === 1, v.outcome?.winner === 0]} />
            <Outcome v={v} />
          </div>
        )}
      </div>
    );
  };
}

function BattleCountdown({ deadline, clock }: { deadline: number; clock: ViewProps["clock"] }) {
  const ms = useRemaining(deadline, clock);
  return <p className="muted">Tempo: {Math.ceil(ms / 1000)}s</p>;
}

// ---------------------------------------------------------------- telefono

export function createDuelController(childViews: ChildViews) {
  return function DuelController({ view, send, clock, theme }: ControllerProps) {
    const v = view as DuelPlayerV | DuelDoneV;
    const sfx = useSfx(theme);
    const phase = v.phase;
    const won = v.outcome && "side" in v && v.side !== null ? v.outcome.winner === v.side : null;

    useEffect(() => {
      if (phase === "draft") sfx("start", 0.4);
      if (phase === "ended" || phase === "done") sfx(won === false ? "wrong" : "fanfare", 0.6);
    }, [phase, won, sfx]);

    if (v.phase === "done") {
      return (
        <div className="duel-ctrl">
          <Outcome v={v} />
        </div>
      );
    }

    const mine = v.side;
    const child = v.minigame && childViews[v.minigame.typeId];
    const hand = v.hand ?? [];

    return (
      <div className="duel-ctrl">
        {v.phase !== "battle-result" && v.phase !== "ended" && <Hud v={v} mine={mine} tiny />}
        {v.spied && (
          <div className="spied">
            <small>👁 Hai spiato una carta avversaria:</small>
            <DuelCard card={v.spied} />
          </div>
        )}

        {v.phase === "minigame-select" && <p className="big">La regia sceglie il prossimo minigioco…</p>}

        {v.phase === "minigame" && v.minigame && (
          <div className="duel-minigame" data-theme={v.minigame.theme}>
            {mine === null ? (
              <p className="big">Stai guardando il duello 👀</p>
            ) : child ? (
              <child.Controller
                view={v.minigame.view}
                clock={clock}
                theme={v.minigame.theme}
                title={v.minigame.title}
                send={(input) => send({ type: "child", input })}
              />
            ) : (
              <p>Minigioco sconosciuto</p>
            )}
          </div>
        )}

        {v.phase === "draft" && (
          <div className="duel-draft">
            {mine === null || !v.draft ? (
              <p className="big">Si sta scegliendo una carta…</p>
            ) : "role" in v.draft && v.draft.role === "picker" ? (
              <CardPicker
                cards={v.draft.cards}
                vote={v.draft.vote}
                team={v.team}
                clock={clock}
                onCast={(uid) => send({ type: "draft-cast", uid })}
                onConfirm={() => send({ type: "draft-confirm" })}
                confirmLabel="Conferma la carta"
              />
            ) : (
              <>
                <p className="big">Sta scegliendo {v.sides[("picker" in v.draft ? v.draft.picker : 0) as Side]?.name}…</p>
                <Backs count={"offeredCount" in v.draft ? v.draft.offeredCount : 0} />
              </>
            )}
          </div>
        )}

        {v.phase === "battle" && (
          <div className="duel-battle">
            {mine !== null && v.battle && "vote" in v.battle ? (
              hand.length === 0 ? (
                <p className="big">Non hai carte da giocare: aspetta lo scontro</p>
              ) : (
                <CardPicker
                  cards={hand}
                  vote={v.battle.vote}
                  team={v.team}
                  clock={clock}
                  onCast={(uid) => send({ type: "vote-cast", uid })}
                  onConfirm={() => send({ type: "vote-confirm" })}
                  confirmLabel="Conferma le carte"
                />
              )
            ) : (
              <p className="big pulse">Battaglia! I team scelgono le carte…</p>
            )}
          </div>
        )}

        {v.phase === "battle-result" && v.result && <BattleReplay result={v.result} sides={v.sides} small />}

        {v.phase === "ended" && (
          <div className="duel-ended">
            <Outcome v={v} />
            {won !== null && <p className="muted">{won ? "Avete vinto! 🎉" : "Sconfitta onorevole."}</p>}
          </div>
        )}

        {mine !== null && v.phase !== "battle" && v.phase !== "draft" && v.phase !== "ended" && (
          <div className="my-hand">
            <h3>La tua mano ({hand.length})</h3>
            <HandStrip hand={hand} />
          </div>
        )}
      </div>
    );
  };
}
