import { error, json, securityHeaders } from "./responses";
import type { Env } from "./types";

interface BackupRoute { username: string; upstreamPath: string; enabled: boolean }
interface BackupPolicy { username: string; enabled: boolean; dataLimitBytes: number; expiresAt: number | null; accessWindows: number; lastAccessAt: number | null }
interface BackupDocument { format: "aphrodite-backup"; version: 1; exportedAt: string; routes: BackupRoute[]; policies: BackupPolicy[] }

const validUsername = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_.-]{3,96}$/.test(value);
const validInteger = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && Number(value) >= minimum;

export async function exportBackup(env: Env): Promise<Response> {
  const [routes, policies] = await Promise.all([
    env.DB.prepare("SELECT username, upstream_path, enabled FROM subscription_routes ORDER BY username COLLATE NOCASE").all<{ username: string; upstream_path: string; enabled: number }>(),
    env.DB.prepare("SELECT username, enabled, data_limit_bytes, expires_at, access_windows, last_access_at FROM user_policies ORDER BY username COLLATE NOCASE").all<{ username: string; enabled: number; data_limit_bytes: number; expires_at: number | null; access_windows: number; last_access_at: number | null }>(),
  ]);
  const document: BackupDocument = {
    format: "aphrodite-backup", version: 1, exportedAt: new Date().toISOString(),
    routes: (routes.results || []).map(row => ({ username: row.username, upstreamPath: row.upstream_path, enabled: Boolean(row.enabled) })),
    policies: (policies.results || []).map(row => ({ username: row.username, enabled: Boolean(row.enabled), dataLimitBytes: row.data_limit_bytes, expiresAt: row.expires_at, accessWindows: row.access_windows, lastAccessAt: row.last_access_at })),
  };
  return new Response(JSON.stringify(document, null, 2), { headers: { ...securityHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="aphrodite-backup-${document.exportedAt.slice(0, 10)}.json"` } });
}

function validateBackup(value: unknown): BackupDocument | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<BackupDocument>;
  if (input.format !== "aphrodite-backup" || input.version !== 1 || !Array.isArray(input.routes) || !Array.isArray(input.policies) || input.routes.length > 2000 || input.policies.length > 2000) return null;
  const names = new Set<string>();
  for (const route of input.routes) {
    if (!validUsername(route?.username) || typeof route.upstreamPath !== "string" || !route.upstreamPath.startsWith("/sub/") || route.upstreamPath.length > 512 || /[\r\n\0\s]/.test(route.upstreamPath) || typeof route.enabled !== "boolean") return null;
    const key = route.username.toLowerCase(); if (names.has(key)) return null; names.add(key);
  }
  for (const policy of input.policies) {
    if (!validUsername(policy?.username) || typeof policy.enabled !== "boolean" || !validInteger(policy.dataLimitBytes) || !validInteger(policy.accessWindows)
      || (policy.expiresAt !== null && !validInteger(policy.expiresAt, 1)) || (policy.lastAccessAt !== null && !validInteger(policy.lastAccessAt, 1))) return null;
  }
  return input as BackupDocument;
}

async function batchInChunks(env: Env, statements: D1PreparedStatement[]): Promise<void> {
  for (let index = 0; index < statements.length; index += 50) await env.DB.batch(statements.slice(index, index + 50));
}

export async function importBackup(request: Request, env: Env, apply: boolean): Promise<Response> {
  let input: unknown; try { input = await request.json(); } catch { return error("Invalid JSON", 400); }
  const backup = validateBackup(input);
  if (!backup) return error("Invalid backup", 400);
  if (!apply) return json({ ok: true, valid: true, apply: false, routes: backup.routes.length, policies: backup.policies.length });
  const statements: D1PreparedStatement[] = [];
  const columns = await env.DB.prepare("PRAGMA table_info(subscription_routes)").all<{ name: string }>();
  const hasBackendUsername = (columns.results || []).some(column => column.name === "backend_username");
  for (const route of backup.routes) statements.push(hasBackendUsername
    ? env.DB.prepare("INSERT INTO subscription_routes(username, backend_username, upstream_path, enabled, updated_at) VALUES(?, ?, ?, ?, unixepoch()) ON CONFLICT(username) DO UPDATE SET backend_username=excluded.backend_username, upstream_path=excluded.upstream_path, enabled=excluded.enabled, updated_at=unixepoch()")
      .bind(route.username, route.username, route.upstreamPath, route.enabled ? 1 : 0)
    : env.DB.prepare("INSERT INTO subscription_routes(username, upstream_path, enabled, updated_at) VALUES(?, ?, ?, unixepoch()) ON CONFLICT(username) DO UPDATE SET upstream_path=excluded.upstream_path, enabled=excluded.enabled, updated_at=unixepoch()")
      .bind(route.username, route.upstreamPath, route.enabled ? 1 : 0));
  const routeNames = new Set(backup.routes.map(route => route.username.toLowerCase()));
  for (const policy of backup.policies) if (routeNames.has(policy.username.toLowerCase())) statements.push(env.DB.prepare("INSERT INTO user_policies(username, enabled, data_limit_bytes, expires_at, access_windows, last_access_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, unixepoch()) ON CONFLICT(username) DO UPDATE SET enabled=excluded.enabled, data_limit_bytes=excluded.data_limit_bytes, expires_at=excluded.expires_at, access_windows=excluded.access_windows, last_access_at=excluded.last_access_at, updated_at=unixepoch()")
    .bind(policy.username, policy.enabled ? 1 : 0, policy.dataLimitBytes, policy.expiresAt, policy.accessWindows, policy.lastAccessAt));
  await batchInChunks(env, statements);
  await env.DB.prepare("INSERT INTO audit_events(action, subject, created_at) VALUES('backup.import', ?, unixepoch())").bind(`${backup.routes.length} routes`).run();
  return json({ ok: true, valid: true, apply: true, routes: backup.routes.length, policies: backup.policies.length });
}

export async function bulkPolicies(request: Request, env: Env): Promise<Response> {
  let input: Record<string, unknown>; try { input = await request.json<Record<string, unknown>>(); } catch { return error("Invalid JSON", 400); }
  if (!Array.isArray(input.usernames) || input.usernames.length < 1 || input.usernames.length > 200 || input.usernames.some(name => !validUsername(name))) return error("Invalid usernames", 400);
  const usernames = [...new Map((input.usernames as string[]).map(name => [name.toLowerCase(), name])).values()];
  const sets: string[] = [], values: unknown[] = [];
  if (input.enabled !== undefined) { if (typeof input.enabled !== "boolean") return error("Invalid enabled value", 400); sets.push("enabled = ?"); values.push(input.enabled ? 1 : 0); }
  if (input.dataLimitBytes !== undefined) { if (!validInteger(input.dataLimitBytes)) return error("Invalid data limit", 400); sets.push("data_limit_bytes = ?"); values.push(input.dataLimitBytes); }
  if (input.expiresAt !== undefined) { if (input.expiresAt !== null && !validInteger(input.expiresAt, 1)) return error("Invalid expiry", 400); sets.push("expires_at = ?"); values.push(input.expiresAt); }
  if (input.resetAccess === true) sets.push("access_windows = 0", "last_access_at = NULL");
  if (!sets.length) return error("No bulk operation selected", 400);
  sets.push("updated_at = unixepoch()");
  const statements = usernames.map(username => env.DB.prepare(`UPDATE user_policies SET ${sets.join(", ")} WHERE username = ? COLLATE NOCASE`).bind(...values, username));
  await batchInChunks(env, statements);
  await env.DB.prepare("INSERT INTO audit_events(action, subject, created_at) VALUES('policy.bulk', ?, unixepoch())").bind(`${usernames.length} users`).run();
  return json({ ok: true, requested: usernames.length });
}
