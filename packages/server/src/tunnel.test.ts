import { describe, expect, it } from "vitest";
import { parseTunnelUrl } from "./tunnel.js";

describe("parseTunnelUrl", () => {
  it("estrae l'URL dalla riga di log di cloudflared", () => {
    const line = "2026-10-11T10:00:00Z INF |  https://random-words-here.trycloudflare.com  |";
    expect(parseTunnelUrl(line)).toBe("https://random-words-here.trycloudflare.com");
  });

  it("ignora righe senza URL", () => {
    expect(parseTunnelUrl("INF Registered tunnel connection")).toBeNull();
    expect(parseTunnelUrl("https://api.trycloudflare.com/tunnel")).toBe("https://api.trycloudflare.com");
  });
});
