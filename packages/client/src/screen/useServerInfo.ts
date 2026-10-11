import { useEffect, useState } from "react";
import type { ServerInfo } from "@gioco/shared";

/** Interroga periodicamente il server (il Quick Tunnel impiega qualche secondo a partire). */
export function useServerInfo(intervalMs = 2000): ServerInfo | null {
  const [info, setInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/info");
        if (alive && res.ok) setInfo((await res.json()) as ServerInfo);
      } catch {
        /* server non raggiungibile: riprova al prossimo giro */
      }
    };
    void load();
    const id = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return info;
}
