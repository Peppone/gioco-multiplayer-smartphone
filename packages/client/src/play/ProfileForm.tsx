import { useState } from "react";
import type { Socket } from "socket.io-client";
import { ClientEvent, type JoinError, type JoinResult } from "@gioco/shared";

const AVATARS = ["🦊", "🐻", "🐼", "🐸", "🦁", "🐙", "🦄", "🐵", "🐧", "🐲", "👾", "🤖"];
const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"];

const MESSAGES: Record<JoinError, string> = {
  invalid: "Dati non validi.",
  nickname_taken: "Questo nome è già preso: se è il tuo, usa «Ho già un profilo».",
  bad_credentials: "Nome o PIN errati.",
  too_many_attempts: "Troppi tentativi: riprova tra un minuto.",
};

type Ok = Extract<JoinResult, { ok: true }>;

export function ProfileForm({ socket, onJoined }: { socket: Socket; onJoined: (r: Ok) => void }) {
  const [mode, setMode] = useState<"create" | "recover">("create");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]!);
  const [color, setColor] = useState(COLORS[5]!);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = mode === "create" ? { nickname, avatar, color } : { nickname, pin };
    const event = mode === "create" ? ClientEvent.Create : ClientEvent.Recover;
    socket.timeout(5000).emit(event, payload, (err: unknown, r: JoinResult) => {
      if (err) return setError("Il server non risponde, riprova.");
      if (r.ok) onJoined(r);
      else setError(MESSAGES[r.error]);
    });
  };

  const switchMode = () => {
    setMode(mode === "create" ? "recover" : "create");
    setError(null);
  };

  return (
    <form onSubmit={submit} className="profile-form">
      <h1>{mode === "create" ? "Crea il tuo profilo" : "Recupera il profilo"}</h1>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Nome"
        maxLength={16}
        autoComplete="off"
        required
      />
      {mode === "create" ? (
        <>
          <div className="picker">
            {AVATARS.map((a) => (
              <button type="button" key={a} className={a === avatar ? "sel" : ""} onClick={() => setAvatar(a)}>
                {a}
              </button>
            ))}
          </div>
          <div className="picker">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={c === color ? "sel" : ""}
                style={{ background: c }}
                aria-label={c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </>
      ) : (
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="PIN a 4 cifre"
          inputMode="numeric"
          required
        />
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary">
        {mode === "create" ? "Entra" : "Recupera"}
      </button>
      <button type="button" className="link" onClick={switchMode}>
        {mode === "create" ? "Ho già un profilo" : "Crea un nuovo profilo"}
      </button>
    </form>
  );
}
