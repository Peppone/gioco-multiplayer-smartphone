import { networkInterfaces } from "node:os";

type Interfaces = ReturnType<typeof networkInterfaces>;

const VIRTUAL_NAME = /vethernet|virtualbox|vmware|vbox|docker|wsl|hyper-v|loopback|tailscale|zerotier/i;

function isPrivate(address: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

/** Sceglie l'indirizzo IPv4 LAN più probabile (privato, non di un adattatore virtuale). */
export function pickLanAddress(interfaces: Interfaces = networkInterfaces()): string | null {
  const candidates: { address: string; score: number }[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const info of list ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      let score = 0;
      if (isPrivate(info.address)) score += 2;
      if (!VIRTUAL_NAME.test(name)) score += 1;
      if (info.address.startsWith("169.254.")) score -= 5; // link-local: nessuna rete reale
      candidates.push({ address: info.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}
