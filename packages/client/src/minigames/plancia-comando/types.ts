/** Viste di Plancia di Comando come le serializza il server (`screenView`, `viewFor`, `hostView`). */

export type Phase = "ready" | "sector" | "jump" | "final" | "done";
export type EventKind = "alarm" | "blackout";
export type ControlKind = "button" | "toggle" | "slider" | "selector";

export interface Settings {
  mode: "squadre" | "unico";
  sectors: number;
  sectorSeconds: number;
  orderSeconds: number;
  minOrderSeconds: number;
  damagePerMiss: number;
  events: boolean;
  stepPoints: number;
  hullBonus: number;
  podiumPoints: number[];
}

export interface EventInfo {
  kind: EventKind;
  until: number;
}

export interface PublicView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  settings: Settings;
  /** Da 1; 0 prima del decollo. */
  sector: number;
}

export interface ScreenCrew {
  id: string;
  name: string;
  color: string;
  members: number;
  progress: number;
  /** Passi per membro: è ciò che conta per la classifica. */
  distance: number;
  hull: number;
  done: number;
  missed: number;
  stopped: boolean;
  lastDone: { text: string; at: number } | null;
  event: EventInfo | null;
  activeOrders: number;
  rank?: number;
  points?: number;
}

export interface ScreenView extends PublicView {
  crews: ScreenCrew[];
}

export interface PhoneControl {
  id: string;
  name: string;
  kind: ControlKind;
  options: string[];
  value: number;
}

export interface PhoneView extends PublicView {
  crew?: { id: string; name: string; color: string; hull: number; stopped: boolean; event: EventInfo | null };
  me: {
    id: string;
    inactive: boolean;
    controls: PhoneControl[];
    order: { text: string; issuedAt: number; deadline: number } | null;
    alarmPressed: boolean;
    rank?: number;
    points?: number;
  } | null;
}

export interface HostCrew extends ScreenCrew {
  memberList: { id: string; nickname: string; inactive: boolean; order: string | null; controls: number }[];
}

export interface HostInfo extends PublicView {
  crews: HostCrew[];
  sectorEvent: { kind: EventKind; at: number; fired: boolean } | null;
}
