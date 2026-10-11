import { describe, expect, it } from "vitest";
import { pickLanAddress } from "./network.js";

const iface = (address: string, internal = false) => ({
  address, family: "IPv4" as const, internal, netmask: "", mac: "", cidr: null,
});

describe("pickLanAddress", () => {
  it("ignora loopback e link-local", () => {
    expect(pickLanAddress({ lo: [iface("127.0.0.1", true)], eth: [iface("169.254.1.2")] })).toBe("169.254.1.2");
    expect(pickLanAddress({ lo: [iface("127.0.0.1", true)] })).toBeNull();
  });

  it("preferisce il Wi-Fi reale agli adattatori virtuali", () => {
    const got = pickLanAddress({
      "vEthernet (WSL)": [iface("172.20.0.1")],
      "Wi-Fi": [iface("192.168.1.20")],
    });
    expect(got).toBe("192.168.1.20");
  });
});
