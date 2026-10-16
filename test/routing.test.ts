import { describe, expect, it } from "vitest";
import { adaptiveRoutingHeader, routingMode } from "../src/routing";
import { usernameFromPath } from "../src/subscription";
import { policyDenial } from "../src/policies";

function decode(link: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(link.split("/onadd/")[1]!, "base64").toString("utf8"));
}

describe("adaptive client routing", () => {
  it("routes .ir directly only for clients detected inside Iran", () => {
    expect(decode(adaptiveRoutingHeader("IR")).DirectSites).toEqual(["regexp:\\.ir$"]);
    expect(decode(adaptiveRoutingHeader("DE")).DirectSites).toEqual([]);
    expect(routingMode("IR")).toBe("ir-direct");
    expect(routingMode("US")).toBe("iran-exit");
  });

  it("does not require geoip or geosite files", () => {
    const profile = decode(adaptiveRoutingHeader("IR"));
    expect(Object.keys(profile).some(key => key.toLowerCase().startsWith("geo"))).toBe(false);
  });
});

describe("edge policies", () => {
  const base = { username: "azita", enabled: 1, data_limit_bytes: 100, expires_at: null, access_windows: 0, last_access_at: null };
  it("allows active policies and denies disabled or expired policies", async () => {
    expect(policyDenial(base)).toBeNull();
    expect((policyDenial({ ...base, enabled: 0 }) as Response).status).toBe(403);
    expect((policyDenial({ ...base, expires_at: 1 }, 2) as Response).status).toBe(403);
  });
});

describe("subscription paths", () => {
  it("accepts safe usernames and rejects path confusion", () => {
    expect(usernameFromPath("/feed/azita")).toBe("azita");
    expect(usernameFromPath("/feed/a%2Fb")).toBeNull();
    expect(usernameFromPath("/feed/%00bad")).toBeNull();
  });

  it("preserves the requested case for indexed case-insensitive lookup", () => {
    expect(usernameFromPath("/feed/MiLaD")).toBe("MiLaD");
  });
});
