import type { AdminError } from "@gioco/shared";

export type Result<T> = { ok: true; value: T } | { ok: false; error: AdminError; detail?: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (error: AdminError, detail?: string): Result<never> => ({ ok: false, error, detail });
