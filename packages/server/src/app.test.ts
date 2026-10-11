import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("GET /api/info", () => {
  it("restituisce URL LAN e stato del tunnel", async () => {
    const app = buildApp({
      port: 3000,
      lanAddress: "192.168.1.20",
      getTunnel: () => ({ status: "ready", url: "https://x.trycloudflare.com" }),
    });
    const res = await app.inject({ url: "/api/info" });
    expect(res.json()).toEqual({
      lanUrl: "http://192.168.1.20:3000",
      tunnel: { status: "ready", url: "https://x.trycloudflare.com" },
    });
  });

  it("lanUrl è null senza rete locale", async () => {
    const app = buildApp({ port: 3000, lanAddress: null, getTunnel: () => ({ status: "off" }) });
    expect((await app.inject({ url: "/api/info" })).json().lanUrl).toBeNull();
  });
});
