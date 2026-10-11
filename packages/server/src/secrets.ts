import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Hash veloce per token casuali ad alta entropia (non per password o PIN). */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Hash lento con sale per segreti a bassa entropia (PIN, password admin). */
export function hashSecret(secret: string): string {
  const salt = randomBytes(8).toString("hex");
  return `${salt}:${scryptSync(secret, salt, 32).toString("hex")}`;
}

export function checkSecret(secret: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(secret, salt, expected.length);
  return timingSafeEqual(expected, actual);
}
