export interface Env {
  DEPLOYMENT_ROLE?: 'management' | 'connection' | 'standalone' | 'database';
  DATA_CONTROL_URL?: string;
  DATA_CONTROL_PATH?: string;
  DATA_CONTROL_TOKEN?: string;
  DATA_CONTROL_TOKENS_JSON?: string;
  DATA_CONTROL_SERVICE?: Fetcher;
  EDGE_CONTROL_TOKENS_JSON?: string;
  EDGE_CONTROL_URL?: string;
  EDGE_CONTROL_SERVICE?: Fetcher;
  EDGE_CONTROL_TOKEN?: string;
  EDGE_CONTROL_PATH?: string;
  EDGE_PROBE_PATH?: string;
  CONNECTION_ENDPOINTS_JSON?: string;
  DB: D1Database;
  ADMIN_TOKEN: string;
  ADMIN_PASSWORD_HASH?: string;
  SUBSCRIPTION_ID_MODE?: 'opaque'|'username'|'uuid';
  SUBSCRIPTION_DOMAIN?: string;
  SUBSCRIPTION_RESERVED_HOSTS_JSON?: string;
  WILDCARD_GATEWAY_TOKEN?: string;
  ADMIN_PATH?: string;
  ADMIN_TARGET_PATH?: string;
  PRIVATE_MACHINE_TOKEN_HASH?: string;
  PRIVATE_MACHINE_TOKEN_HEADER?: string;
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
  EDGE_ADDRESSES?: string;
  PUBLIC_EDGE_HOST?: string;
  PUBLIC_EDGE_HOSTS?: string;
  UPDATE_WEBHOOK_URL?: string;
  SUBSCRIPTION_GATEWAYS_JSON?: string;
  EDGE_HOST_ALIASES?: string;
  EDGE_ENDPOINTS_JSON?: string;
  EDGE_ROTATION_MINUTES?: string;
  ACCOUNT_STATE?: DurableObjectNamespace;
  NATIVE_ENABLED?: string;
  NATIVE_RELAY_UUID?: string;
  CF_ANALYTICS_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
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
