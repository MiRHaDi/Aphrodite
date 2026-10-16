import { cacheSeconds, origins } from "./config";
import { adaptiveRoutingHeader, routingMode } from "./routing";
import { text } from "./responses";
import { policyDenial, policyFor, recordAccessWindow } from "./policies";
import type { Env, SubscriptionRoute } from "./types";

export function usernameFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/feed\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]!).normalize("NFKC");
    return /^[a-zA-Z0-9_.-]{3,96}$/.test(value) ? value : null;
  } catch { return null; }
}

async function fetchFirst(request: Request, env: Env, path: string): Promise<Response | null> {
  for (const origin of origins(env)) {
    try {
      const response = await fetch(origin + path, {
        headers: { accept: request.headers.get("accept") || "text/plain,*/*", "user-agent": request.headers.get("user-agent") || "Aphrodite/1.0" },
        cf: { cacheTtl: cacheSeconds(env), cacheEverything: true },
      });
      if (response.ok) return response;
    } catch { /* try the next configured origin */ }
  }
  return null;
}

export async function subscription(request: Request, env: Env, username: string, ctx: ExecutionContext): Promise<Response> {
  const country = typeof request.cf?.country === "string" ? request.cf.country : undefined;
  const edgeCache = (caches as CacheStorage & { default: Cache }).default;
  const policy = await policyFor(request, env, username, ctx);
  const denied = policyDenial(policy);
  if (denied) return denied;
  if (policy) recordAccessWindow(request, env, username, ctx);
  const mode = routingMode(country);
  const key = new Request(`${new URL(request.url).origin}/feed/${encodeURIComponent(username)}?v=1&route=${mode}`);
  const hit = await edgeCache.match(key);
  if (hit) return hit;

  const route = await env.DB.prepare("SELECT username, upstream_path, enabled FROM subscription_routes WHERE username = ? COLLATE NOCASE LIMIT 1")
    .bind(username).first<SubscriptionRoute>();
  if (!route?.enabled || !route.upstream_path.startsWith("/sub/")) return text("Not found", 404, { "cache-control": "no-store" });

  const upstream = await fetchFirst(request, env, route.upstream_path);
  if (!upstream) return text("Upstream unavailable", 503, { "cache-control": "no-store", "retry-after": "15" });
  const ttl = cacheSeconds(env);
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
    "cache-control": `public, max-age=${ttl}`,
    "profile-update-interval": env.PROFILE_UPDATE_INTERVAL || "6",
    routing: adaptiveRoutingHeader(country),
  });
  for (const name of ["subscription-userinfo", "content-disposition"]) {
    const value = upstream.headers.get(name); if (value) headers.set(name, value);
  }
  const response = new Response(upstream.body, { status: 200, headers });
  ctx.waitUntil(edgeCache.put(key, response.clone()));
  return response;
}
