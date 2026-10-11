export * from "./admin.js";
export * from "./fairtime.js";
export * from "./game.js";
export * from "./media.js";
export * from "./minigame.js";
export * from "./clock.js";
export * from "./protocol.js";

export const DEFAULT_PORT = 3000;

export type TunnelStatus = "off" | "starting" | "ready" | "error";

export interface TunnelInfo {
  status: TunnelStatus;
  /** URL pubblico HTTPS (Cloudflare Quick Tunnel), presente solo se `status === "ready"`. */
  url?: string;
  error?: string;
}

export interface ServerInfo {
  /** URL raggiungibile dalla rete locale, es. http://192.168.1.10:3000 */
  lanUrl: string | null;
  tunnel: TunnelInfo;
}
