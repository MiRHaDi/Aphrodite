import {clientProfile,profileHeaders} from './client-profiles';
import {renderClientSubscription} from './client-renderer';
import { mergeSubscriptionBodies, gatewayVariants, subscriptionClient } from './subscription-merge';
import { rewriteSubscription, subscriptionEndpoint, rotationEpoch, cleanSubscriptionName } from './subscription-addresses';
import { cacheSeconds, origins } from "./config";
import { adaptiveRoutingHeader, routingMode } from "./routing";
import { text } from "./responses";
import { policyDenial, policyFor, recordAccessWindow } from "./policies";
import type { Env, SubscriptionRoute } from "./types";
import { compatibilitySubscription } from "./subscription-profile";
import { findNative } from './native-accounts';
import { nativeSubscription } from './native-subscription';

export function usernameFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/feed\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]!).normalize("NFKC");
    return /^[a-zA-Z0-9_.-]{3,96}$/.test(value) ? value : null;
  } catch { return null; }
}

async function fetchAll(request: Request, env: Env, path: string): Promise<Response[]> {
  const responses=await Promise.all(origins(env).slice(0,4).map(async origin=>{
    try {const response=await fetch(origin+path.replace(/\/$/,'')+'/'+subscriptionClient(request),{headers:{accept:'*/*','user-agent':request.headers.get('user-agent')||'Aphrodite/1.0'},cf:{cacheTtl:cacheSeconds(env),cacheEverything:true},signal:AbortSignal.timeout(8000)});return response.ok?response:null;}catch{return null;}
  }));
  return responses.filter((response):response is Response=>response!==null);
}

export async function subscription(request: Request, env: Env, username: string, ctx: ExecutionContext): Promise<Response> {
  const native = await findNative(env, username);
  if (native) return nativeSubscription(request,env,native);
  const country = typeof request.cf?.country === "string" ? request.cf.country : undefined;
  const edgeCache = (caches as CacheStorage & { default: Cache }).default;
  const policy = await policyFor(request, env, username, ctx);
  const denied = policyDenial(policy);
  if (denied) return denied;
  if (policy) recordAccessWindow(request, env, username, ctx);
  const mode = routingMode(country);
  const url = new URL(request.url);
  const client=clientProfile(request);
  const profile = url.searchParams.get('profile') === 'compat' ? 'compat' : 'standard';
  const key = new Request(`${url.origin}/feed/${encodeURIComponent(username)}?v=6&client=${client.cacheKey}&route=${mode}&profile=${profile}&epoch=${rotationEpoch(env)}`);
  const hit = await edgeCache.match(key);
  if (hit) return hit;

  const route = await env.DB.prepare("SELECT username, upstream_path, enabled FROM subscription_routes WHERE username = ? COLLATE NOCASE LIMIT 1")
    .bind(username).first<SubscriptionRoute>();
  if (!route?.enabled || !route.upstream_path.startsWith("/sub/")) return text("Not found", 404, { "cache-control": "no-store" });

  const upstreams = await fetchAll(request, env, route.upstream_path);
  const upstream=upstreams[0];
  if (!upstream) return text("Upstream unavailable", 503, { "cache-control": "no-store", "retry-after": "15" });
  const ttl = cacheSeconds(env);
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") || "text/plain; charset=utf-8",
    "cache-control": `public, max-age=${ttl}`,
    "profile-update-interval": env.PROFILE_UPDATE_INTERVAL || "6",
    routing: adaptiveRoutingHeader(country),
  });
  for (const name of ["subscription-userinfo", "content-disposition"]) {
    const value = upstream.headers.get(name); if (value) headers.set(name, name === 'content-disposition' ? 'attachment; filename="subscription.txt"' : value);
  }
  headers.set('x-aphrodite-profile', profile);
  const merged=mergeSubscriptionBodies(await Promise.all(upstreams.map(response=>response.text())));
  const rewritten = rewriteSubscription(gatewayVariants(merged,env), env, username);
  const body = profile === 'compat'
    ? compatibilitySubscription(rewritten, subscriptionEndpoint(env, username).host, env.EDGE_ADDRESSES)
    : rewritten;
  let rendered:ReturnType<typeof renderClientSubscription>;
  try {rendered=renderClientSubscription(rewriteSubscription(body,env,username),client,country);}catch{return text('No compatible subscription format',406,{'cache-control':'no-store'});}
  const clientHeaders=profileHeaders(client,headers,env.PROFILE_UPDATE_INTERVAL||'6');clientHeaders.set('content-type',rendered.contentType);
  const response = new Response(rendered.body, { status: 200, headers:clientHeaders });
  ctx.waitUntil(edgeCache.put(key, response.clone()));
  return response;
}
