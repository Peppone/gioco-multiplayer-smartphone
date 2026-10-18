import type { Reserves, Role, Token } from "./types";

export const TOKENS: { id: Token; icon: string; label: string }[] = [
  { id: "yes", icon: "✅", label: "Sì" },
  { id: "no", icon: "❌", label: "No" },
  { id: "maybe", icon: "❓", label: "Forse" },
  { id: "close", icon: "🟡", label: "Ci sei quasi" },
  { id: "far", icon: "🔴", label: "Lontanissimo" },
  { id: "correct", icon: "🎯", label: "Esatto" },
];

export const tokenInfo = (id: Token) => TOKENS.find((t) => t.id === id)!;

export const ROLE_LABEL: Record<Role, string> = { werewolf: "Lupo", seer: "Veggente", villager: "Paesano" };
export const ROLE_ICON: Record<Role, string> = { werewolf: "🐺", seer: "🔮", villager: "🧑" };

/** Il gettone è ancora disponibile? («Esatto» lo è sempre.) */
export function tokenAvailable(token: Token, r: Reserves): boolean {
  switch (token) {
    case "yes":
    case "no":
      return r.yesNo > 0;
    case "maybe":
      return r.maybe === null || r.maybe > 0;
    case "close":
      return r.close > 0;
    case "far":
      return r.far > 0;
    case "correct":
      return true;
  }
}

/** «m:ss». */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
