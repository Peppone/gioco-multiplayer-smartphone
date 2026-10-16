import { useEffect, useState } from "react";
import type { AdminStatus, AdminSession } from "@gioco/shared";
import { EventsPanel } from "./EventsPanel";
import { LibraryPanel } from "./LibraryPanel";
import { LivePanel } from "./LivePanel";
import { MessagesPanel } from "./MessagesPanel";
import { PlayersPanel } from "./PlayersPanel";
import { TeamsPanel } from "./TeamsPanel";
import { api, errorMessage, getAdminToken, setAdminToken } from "./api";

function AuthForm({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const s = await api<AdminSession>("POST", configured ? "/login" : "/setup", { password });
      setAdminToken(s.token);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form className="profile-form" onSubmit={submit}>
      <h1>{configured ? "Accesso regia" : "Crea la password admin"}</h1>
      {!configured && <p className="muted">Primo avvio: scegli una password (almeno 8 caratteri).</p>}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete={configured ? "current-password" : "new-password"}
        minLength={8}
        required
      />
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit">
        {configured ? "Entra" : "Imposta e entra"}
      </button>
    </form>
  );
}

type Tab = "live" | "events" | "library" | "teams" | "players" | "messages";

export function Admin() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(getAdminToken() !== null);
  const [tab, setTab] = useState<Tab>("live");

  useEffect(() => {
    api<AdminStatus>("GET", "/status").then((s) => setConfigured(s.configured), () => setConfigured(null));
  }, [authed]);

  // Se una chiamata riceve 401 il token viene cancellato: si torna al login.
  const refreshAuth = () => setAuthed(getAdminToken() !== null);

  // Il token salvato nel browser può non valere più (sessione scaduta, password reimpostata): lo si verifica subito,
  // altrimenti il pannello Live resterebbe vuoto senza dire perché.
  useEffect(() => {
    if (authed) api("GET", "/teams").catch(refreshAuth);
  }, [authed]);

  if (configured === null) return <main className="center"><p>Connessione al server…</p></main>;

  if (!authed) {
    return (
      <main className="center">
        <AuthForm configured={configured} onDone={refreshAuth} />
      </main>
    );
  }

  return (
    <main className="admin">
      <header>
        <h1>Regia</h1>
        <nav>
          <button className={tab === "live" ? "primary" : ""} onClick={() => setTab("live")}>Live</button>
          <button className={tab === "events" ? "primary" : ""} onClick={() => setTab("events")}>Serate</button>
          <button className={tab === "library" ? "primary" : ""} onClick={() => setTab("library")}>Libreria</button>
          <button className={tab === "teams" ? "primary" : ""} onClick={() => setTab("teams")}>Squadre</button>
          <button className={tab === "players" ? "primary" : ""} onClick={() => setTab("players")}>Giocatori</button>
          <button className={tab === "messages" ? "primary" : ""} onClick={() => setTab("messages")}>Messaggi</button>
          <button className="link" onClick={() => { setAdminToken(null); refreshAuth(); }}>Esci</button>
        </nav>
      </header>
      {tab === "live" && <LivePanel />}
      {tab === "events" && <EventsPanel onAuthLost={refreshAuth} />}
      {tab === "library" && <LibraryPanel onAuthLost={refreshAuth} />}
      {tab === "teams" && <TeamsPanel onAuthLost={refreshAuth} />}
      {tab === "messages" && <MessagesPanel onAuthLost={refreshAuth} />}
      {tab === "players" && <PlayersPanel onAuthLost={refreshAuth} />}
    </main>
  );
}
