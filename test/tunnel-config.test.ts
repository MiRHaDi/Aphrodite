import { describe, expect, it } from "vitest";
import { tunnelConnectTimeoutMs, tunnelCooldownSeconds, tunnelMap, tunnelRaceWidth } from "../src/config";
import type { Env } from "../src/types";

function env(values: Partial<Env>): Env { return values as Env; }

describe("tunnel reliability configuration", () => {
  it("bounds concurrency and timing controls", () => {
    expect(tunnelRaceWidth(env({ TUNNEL_RACE_WIDTH: "99" }))).toBe(4);
    expect(tunnelRaceWidth(env({ TUNNEL_RACE_WIDTH: "0" }))).toBe(1);
    expect(tunnelConnectTimeoutMs(env({ TUNNEL_CONNECT_TIMEOUT_MS: "10" }))).toBe(1000);
    expect(tunnelCooldownSeconds(env({ TUNNEL_COOLDOWN_SECONDS: "999" }))).toBe(300);
  });

  it("accepts only safe edge paths and HTTPS targets", () => {
    const routes = tunnelMap(env({ TUNNEL_ROUTES_JSON: JSON.stringify({
      "/edge/smart": [
        { origin: "https://relay.example/path", path: "/ws", priority: 1 },
        { origin: "http://unsafe.example", path: "/ws" },
        { origin: "https://relay.example", path: "relative" },
      ],
      "/other": [{ origin: "https://relay.example", path: "/ws" }],
    }) }));
    expect(routes["/edge/smart"]).toEqual([{ origin: "https://relay.example", path: "/ws", priority: 1, label: undefined }]);
    expect(routes["/other"]).toBeUndefined();
  });
});
