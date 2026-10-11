import { describe, expect, it } from "vitest";
import { createPlayerSchema, recoverSchema } from "./protocol.js";

describe("schemi protocollo", () => {
  it("accetta un profilo valido e ripulisce il nickname", () => {
    const r = createPlayerSchema.parse({ nickname: "  Gina ", avatar: "🦊", color: "#ff8800" });
    expect(r.nickname).toBe("Gina");
  });

  it("rifiuta colori e PIN malformati", () => {
    expect(createPlayerSchema.safeParse({ nickname: "Gina", avatar: "x", color: "rosso" }).success).toBe(false);
    expect(recoverSchema.safeParse({ nickname: "Gina", pin: "12a4" }).success).toBe(false);
    expect(recoverSchema.safeParse({ nickname: "Gina", pin: "1234" }).success).toBe(true);
  });
});
