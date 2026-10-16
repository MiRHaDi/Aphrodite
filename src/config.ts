import type { Env, TunnelMap } from "./types";

export function origins(env: Env): string[] {
  const values = [env.CONTROL_PLANE_ORIGIN, ...(env.BACKUP_ORIGINS || "").split(",")]
    .map(value => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return [...new Set(values)];
}

export function cacheSeconds(env: Env): number {
  const value = Number(env.PUBLIC_CACHE_SECONDS || 120);
  return Number.isFinite(value) ? Math.min(900, Math.max(30, Math.floor(value))) : 120;
}

export function tunnelMap(env: Env): TunnelMap {
  if (!env.TUNNEL_ROUTES_JSON) return {};
  try {
    const parsed = JSON.parse(env.TUNNEL_ROUTES_JSON) as TunnelMap;
    return Object.fromEntries(Object.entries(parsed).flatMap(([path, targets]) => {
      if (!/^\/edge\/[A-Za-z0-9._/-]{1,120}$/.test(path) || !Array.isArray(targets)) return [];
      const valid = targets.slice(0, 16).filter(target => {
        if (!target || typeof target.origin !== "string" || typeof target.path !== "string" || !target.path.startsWith("/")) return false;
        try { return new URL(target.origin).protocol === "https:"; } catch { return false; }
      }).map(target => ({
        origin: new URL(target.origin).origin,
        path: target.path,
        priority: Number.isFinite(target.priority) ? Math.max(0, Math.floor(target.priority!)) : 100,
        label: typeof target.label === "string" ? target.label.slice(0, 48) : undefined,
      }));
      return valid.length ? [[path, valid] as const] : [];
    }));
  } catch {
    return {};
  }
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.floor(parsed))) : fallback;
}

export const tunnelRaceWidth = (env: Env): number => boundedInteger(env.TUNNEL_RACE_WIDTH, 2, 1, 4);
export const tunnelConnectTimeoutMs = (env: Env): number => boundedInteger(env.TUNNEL_CONNECT_TIMEOUT_MS, 4500, 1000, 15000);
export const tunnelCooldownSeconds = (env: Env): number => boundedInteger(env.TUNNEL_COOLDOWN_SECONDS, 30, 5, 300);

export const DEFAULT_INBOUNDS = {
  vless: ["VLESS Smart", "VLESS WebSocket", "VLESS Iran", "VLESS Germany", "VLESS Turkey", "VLESS XHTTP", "VLESS gRPC", "VLESS HTTPUpgrade"],
  vmess: ["VMess WebSocket", "VMess gRPC"],
  trojan: ["Trojan WebSocket", "Trojan gRPC"],
  shadowsocks: ["Shadowsocks TCP"],
};
