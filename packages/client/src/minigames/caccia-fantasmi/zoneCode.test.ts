import { describe, expect, it } from "vitest";
import { extractZoneCode } from "./zoneCode";

describe("extractZoneCode", () => {
  it("legge il codice dal link del QR, con qualunque indirizzo", () => {
    expect(extractZoneCode("https://abc-def.trycloudflare.com/play?zona=K7QD")).toBe("K7QD");
    expect(extractZoneCode("http://192.168.1.20:3000/play?zona=m2xp&x=1")).toBe("M2XP");
  });

  it("accetta il codice nudo, anche con spazi e minuscole", () => {
    expect(extractZoneCode(" r9tv ")).toBe("R9TV");
    expect(extractZoneCode("H4-WZ")).toBe("H4WZ");
  });

  it("scarta i QR che non sono di una zona", () => {
    expect(extractZoneCode("https://example.com/menu")).toBeNull();
    expect(extractZoneCode("https://example.com/play?zona=")).toBeNull();
    expect(extractZoneCode("WIFI:S:casa;T:WPA;P:password123;;")).toBeNull();
    expect(extractZoneCode("")).toBeNull();
    expect(extractZoneCode("ABC")).toBeNull();
    expect(extractZoneCode("ABCDEFGHIJ")).toBeNull();
  });
});
