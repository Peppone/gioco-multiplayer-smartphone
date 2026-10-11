import { useEffect, useState } from "react";
import type { AdminPlayerView, EventDetail, InstanceView, MatchView, MinigameTypeView, TeamView } from "@gioco/shared";
import { api, errorMessage } from "./api";
import { SchemaForm } from "./schema-form/SchemaForm";
import { type JsonSchema, defaultValue } from "./schema-form/logic";

/** Configurazione di una partita in modalità duello: modulo generato dallo schema della modalità. */
export function DuelConfigPanel({
  match,
  event,
  teams,
  players,
  instances,
  onSaved,
}: {
  match: MatchView;
  event: EventDetail;
  teams: TeamView[];
  players: AdminPlayerView[];
  instances: InstanceView[];
  onSaved: () => void;
}) {
  const [schema, setSchema] = useState<JsonSchema | null>(null);
  const [types, setTypes] = useState<MinigameTypeView[]>([]);
  const [value, setValue] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = match.status !== "pending";

  useEffect(() => {
    api<MinigameTypeView[]>("GET", "/minigame-types").then((t) => {
      setTypes(t);
      const mode = t.find((x) => x.id === match.mode);
      setSchema((mode?.modeConfigJsonSchema as JsonSchema | undefined) ?? null);
    }, () => undefined);
  }, [match.mode]);

  // Configurazione corrente, oppure i valori predefiniti dello schema per una partita nuova.
  useEffect(() => {
    if (!schema) return;
    const saved = match.modeConfig as Record<string, unknown>;
    setValue(saved && Object.keys(saved).length > 0 ? saved : defaultValue(schema));
  }, [schema, match.modeConfig]);

  const kindOf = (typeId: string): "minigame" | "content" => types.find((t) => t.id === typeId)?.kind === "content" ? "content" : "minigame";
  const eventTeams = teams.filter((t) => event.teamIds.includes(t.id));
  const eventPlayers = players.filter((p) => event.players.some((e) => e.playerId === p.id));

  const save = async () => {
    setError(null);
    setNotice(null);
    try {
      await api("PATCH", `/matches/${match.id}`, { modeConfig: value });
      setNotice("Configurazione salvata.");
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const configured = match.modeConfig && Object.keys(match.modeConfig as object).length > 0;

  return (
    <div className="duel-config">
      <button type="button" onClick={() => setOpen(!open)}>
        {open ? "Chiudi la configurazione" : configured ? "Modifica la configurazione del duello" : "Configura il duello"}
      </button>
      {!configured && !open && <small className="muted"> Prima di avviarla scegli sfidanti, minigiochi e mazzo.</small>}
      {open && schema && value !== null && (
        <div className="editor">
          <SchemaForm
            schema={schema}
            value={value}
            onChange={setValue}
            context={{
              teams: eventTeams.map((t) => ({ id: t.id, name: `${t.emblem} ${t.name}` })),
              players: eventPlayers.map((p) => ({ id: p.id, nickname: `${p.avatar} ${p.nickname}` })),
              instances: instances.map((i) => ({ id: i.id, title: i.title, kind: kindOf(i.typeId), typeId: i.typeId })),
            }}
          />
          {locked && <p className="muted">La partita è già avviata: la configurazione non si modifica.</p>}
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          <div className="row">
            <button type="button" className="primary" disabled={locked} onClick={() => void save()}>Salva configurazione</button>
          </div>
        </div>
      )}
    </div>
  );
}
