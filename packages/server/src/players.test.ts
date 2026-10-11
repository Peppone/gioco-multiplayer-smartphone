import { describe, expect, it } from "vitest";
import { openDb } from "./db.js";
import { PlayerService } from "./players.js";

const profile = { nickname: "Gina", avatar: "🦊", color: "#ff8800" };

function setup() {
  let t = 0;
  const clock = { advance: (ms: number) => (t += ms) };
  const service = new PlayerService(openDb(":memory:").db, () => t);
  return { service, clock };
}

describe("PlayerService", () => {
  it("crea un profilo con token e PIN a 4 cifre", () => {
    const { service } = setup();
    const r = service.create(profile);
    expect(r.ok && r.pin).toMatch(/^\d{4}$/);
    expect(r.ok && r.token.length).toBeGreaterThanOrEqual(32);
  });

  it("rifiuta nickname duplicati ignorando le maiuscole", () => {
    const { service } = setup();
    service.create(profile);
    expect(service.create({ ...profile, nickname: "gINA" })).toEqual({ ok: false, error: "nickname_taken" });
  });

  it("rientra con il token e rifiuta token sconosciuti", () => {
    const { service } = setup();
    const r = service.create(profile);
    if (!r.ok) throw new Error();
    const back = service.resume(r.token);
    expect(back.ok && back.player.id).toBe(r.player.id);
    expect(service.resume("x".repeat(40))).toEqual({ ok: false, error: "bad_credentials" });
  });

  it("recupera con il PIN e invalida il vecchio token", () => {
    const { service } = setup();
    const r = service.create(profile);
    if (!r.ok || !r.pin) throw new Error();
    const rec = service.recover("GINA", r.pin);
    expect(rec.ok && rec.token).not.toBe(r.token);
    expect(service.resume(r.token).ok).toBe(false);
    expect(service.resume((rec as { token: string }).token).ok).toBe(true);
  });

  it("blocca il recupero dopo 5 PIN errati e lo riapre dopo 60 s", () => {
    const { service, clock } = setup();
    const r = service.create(profile);
    if (!r.ok || !r.pin) throw new Error();
    const wrong = r.pin === "0000" ? "1111" : "0000";
    for (let i = 0; i < 5; i++) expect(service.recover("Gina", wrong)).toEqual({ ok: false, error: "bad_credentials" });
    expect(service.recover("Gina", r.pin)).toEqual({ ok: false, error: "too_many_attempts" });
    clock.advance(61_000);
    expect(service.recover("Gina", r.pin).ok).toBe(true);
  });
});
