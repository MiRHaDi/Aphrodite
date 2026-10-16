export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  CONTROL_PLANE_TOKEN?: string;
  CONTROL_PLANE_USERNAME?: string;
  CONTROL_PLANE_PASSWORD?: string;
  CONTROL_PLANE_ORIGIN: string;
  BACKUP_ORIGINS?: string;
  PUBLIC_CACHE_SECONDS?: string;
  PROFILE_UPDATE_INTERVAL?: string;
  TUNNEL_ROUTES_JSON?: string;
  TUNNEL_RACE_WIDTH?: string;
  TUNNEL_CONNECT_TIMEOUT_MS?: string;
  TUNNEL_COOLDOWN_SECONDS?: string;
}

export interface TunnelTarget { origin: string; path: string; priority?: number; label?: string }
export type TunnelMap = Record<string, TunnelTarget[]>;

export interface SubscriptionRoute {
  username: string;
  upstream_path: string;
  enabled: number;
}

export interface UserPolicy {
  username: string;
  enabled: number;
  data_limit_bytes: number;
  expires_at: number | null;
  access_windows: number;
  last_access_at: number | null;
  updated_at?: number;
}

export interface CreateUserInput {
  username: string;
  days: number;
  dataGb: number;
  unlimited?: boolean;
}
