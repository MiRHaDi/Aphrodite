import { error, json } from "./responses";
import type { Env, UserPolicy } from "./types";
import { tunnelConnectTimeoutMs, tunnelCooldownSeconds, tunnelRaceWidth } from "./config";

const POLICY_TTL_SECONDS = 30;
const ACCESS_WINDOW_SECONDS = 300;

function policyCacheKey(request: Request, username: string): Request {
  return new Request(`${new URL(request.url).origin}/.aphrodite/cache/policy/${encodeURIComponent(username)}`);
}

export async function policyFor(request: Request, env: Env, username: string, ctx: ExecutionContext): Promise<UserPolicy | null> {
  const cache = (caches as CacheStorage & { default: Cache }).default;
  const key = policyCacheKey(request, username);
  const cached = await cache.match(key);
  if (cached) return cached.json<UserPolicy | null>();
  const policy = await env.DB.prepare("SELECT username, enabled, data_limit_bytes, expires_at, access_windows, last_access_at FROM user_policies WHERE username = ? COLLATE NOCASE LIMIT 1")
    .bind(username).first<UserPolicy>();
  const response = Response.json(policy || null, { headers: { "cache-control": `public, max-age=${POLICY_TTL_SECONDS}` } });
  ctx.waitUntil(cache.put(key, response));
  return policy || null;
}

export function policyDenial(policy: UserPolicy | null, now = Math.floor(Date.now() / 1000)): Response | null {
  if (!policy) return null;
  if (!policy.enabled) return error("Subscription disabled", 403);
  if (policy.expires_at !== null && policy.expires_at <= now) return error("Subscription expired", 403);
  return null;
}

export function recordAccessWindow(request: Request, env: Env, username: string, ctx: ExecutionContext): void {
  const cache = (caches as CacheStorage & { default: Cache }).default;
  const bucket = Math.floor(Date.now() / (ACCESS_WINDOW_SECONDS * 1000));
  const gate = new Request(`${new URL(request.url).origin}/.aphrodite/cache/access/${encodeURIComponent(username)}/${bucket}`);
  ctx.waitUntil((async () => {
    if (await cache.match(gate)) return;
    await cache.put(gate, new Response("1", { headers: { "cache-control": `public, max-age=${ACCESS_WINDOW_SECONDS}` } }));
    await env.DB.prepare("UPDATE user_policies SET access_windows = access_windows + 1, last_access_at = unixepoch(), updated_at = unixepoch() WHERE username = ? COLLATE NOCASE")
      .bind(username).run();
  })());
}

export async function listPolicies(env: Env): Promise<Response> {
  const result = await env.DB.prepare("SELECT username, enabled, data_limit_bytes, expires_at, access_windows, last_access_at, updated_at FROM user_policies ORDER BY updated_at DESC LIMIT 1000").all<UserPolicy>();
  return json({ ok: true, policies: result.results || [] });
}

export async function updatePolicy(request: Request, env: Env, username: string): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await request.json<Record<string, unknown>>(); } catch { return error("Invalid JSON", 400); }
  const enabled = body.enabled === undefined ? true : body.enabled;
  const dataLimit = body.dataLimitBytes === undefined ? 0 : Number(body.dataLimitBytes);
  const expiresAt = body.expiresAt === null || body.expiresAt === undefined ? null : Number(body.expiresAt);
  if (typeof enabled !== "boolean" || !Number.isSafeInteger(dataLimit) || dataLimit < 0 || (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt < 1))) {
    return error("Invalid policy", 400);
  }
  const route = await env.DB.prepare("SELECT username FROM subscription_routes WHERE username = ? COLLATE NOCASE LIMIT 1").bind(username).first<{ username: string }>();
  if (!route) return error("Unknown user", 404);
  await env.DB.prepare("INSERT INTO user_policies(username, enabled, data_limit_bytes, expires_at, updated_at) VALUES(?, ?, ?, ?, unixepoch()) ON CONFLICT(username) DO UPDATE SET enabled=excluded.enabled, data_limit_bytes=excluded.data_limit_bytes, expires_at=excluded.expires_at, updated_at=unixepoch()")
    .bind(route.username, enabled ? 1 : 0, dataLimit, expiresAt).run();
  await env.DB.prepare("INSERT INTO audit_events(action, subject, created_at) VALUES('policy.update', ?, unixepoch())").bind(username).run();
  return json({ ok: true, username, enabled, dataLimitBytes: dataLimit, expiresAt });
}

export function capabilities(env: Env): Response {
  return json({
    ok: true,
    runtime: "cloudflare-edge",
    deploymentTargets: ["workers", "pages-functions"],
    accounting: { traffic: "control-plane", edge: "five-minute access windows", databaseWrites: "bounded" },
    failoverOrigins: 1 + (env.BACKUP_ORIGINS || "").split(",").filter(Boolean).length,
    tunnel: { strategy: "bounded-race", raceWidth: tunnelRaceWidth(env), connectTimeoutMs: tunnelConnectTimeoutMs(env), cooldownSeconds: tunnelCooldownSeconds(env) },
    administration: { caseInsensitiveSubscriptions: true, bulkPolicies: true, portableBackup: true, backupContainsSecrets: false },
    secretsStoredInDatabase: false,
  });
}
