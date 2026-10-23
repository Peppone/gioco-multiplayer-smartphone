import { MAX_AUDIO_BYTES, type MediaItem, mediaContentType } from "@gioco/shared";

const TOKEN_KEY = "gioco.admin.token";

export const getAdminToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAdminToken = (token: string | null): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage non disponibile: si dovrà rifare il login a ogni caricamento */
  }
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
  ) {
    super(code);
  }
}

/** Chiamata JSON verso `/api/admin/...`; su 401 dopo il login cancella il token (sessione scaduta). */
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (!res.ok) {
    if (res.status === 401 && token && path !== "/login") setAdminToken(null);
    throw new ApiError(res.status, data.error ?? "errore", data.detail);
  }
  return data as T;
}

/** Carica un brano nella mediateca del server (corpo grezzo, nome originale nell'intestazione). */
export async function uploadAudio(file: File): Promise<MediaItem> {
  const token = getAdminToken();
  const res = await fetch("/api/admin/media", {
    method: "POST",
    headers: {
      "Content-Type": mediaContentType(file.name, file.type),
      "X-File-Name": encodeURIComponent(file.name),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (!res.ok) throw new ApiError(res.status, res.status === 413 ? "troppo_grande" : (data.error ?? "errore"), res.status === 413 ? `Il file supera i ${MAX_AUDIO_BYTES / 1024 / 1024} MB.` : data.detail);
  return data as unknown as MediaItem;
}

const MESSAGES: Record<string, string> = {
  invalid: "Dati non validi.",
  unauthorized: "Sessione scaduta: rifai il login.",
  bad_credentials: "Password errata.",
  too_many_attempts: "Troppi tentativi: riprova tra un minuto.",
  already_configured: "La password è già impostata.",
  not_found: "Elemento non trovato.",
  conflict: "Esiste già (o l'operazione non è consentita).",
};

export const errorMessage = (e: unknown): string =>
  e instanceof ApiError ? (e.detail ?? MESSAGES[e.code] ?? e.code) : "Server non raggiungibile.";
