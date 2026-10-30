import { isAdmin } from "./auth";
import { createUser, overview, users, nodes } from "./control-plane";
import { PANEL_HTML } from "./panel";
import { error, json, securityHeaders, text } from "./responses";
import { subscription, usernameFromPath } from "./subscription";
import { subscriptionOwner } from './subscription-keys';
import { tunnel } from "./tunnel";
import { tunnelMap } from "./config";
import type { Env } from "./types";
import { capabilities, listPolicies, updatePolicy } from "./policies";
import { bulkPolicies, exportBackup, importBackup } from "./admin-data";
import { nativeAdmin, nativeEnabled } from './native-accounts';
import { nativeBackup, nativeSettings, importNative, testNativeProxy } from './native-tools';
import { cloudflareUsage } from './native-metrics';
import {deploymentConnections,deploymentHealth} from './deployment-registry';
import {adminSession} from './admin-session';
import {versionInfo} from './version';
import {nativeAppearance} from './native-appearance';

async function adminApi(request: Request, env: Env, pathname: string): Promise<Response> {
  if(pathname==='/api/session')return adminSession(request,env);
  if (!await isAdmin(request, env)) return error("Unauthorized", 401);
  if(pathname==='/api/deployment/health'&&request.method==='GET')return deploymentHealth(env);
  if(pathname==='/api/deployment/connections')return deploymentConnections(request,env);
  if(pathname==='/api/cloudflare/usage'&&request.method==='GET')return cloudflareUsage(env);
  if(pathname==='/api/version')return versionInfo(request,env);
  if (pathname.startsWith('/api/native/') && !nativeEnabled(env)) return error('Native core is not enabled',503);
  if (pathname === '/api/native/settings') return nativeSettings(request,env);
  if (pathname === '/api/native/appearance') return nativeAppearance(request,env);
  if (pathname === '/api/native/backup' && request.method === 'GET') return nativeBackup(env);
  if (pathname === '/api/native/import' && request.method === 'POST') return importNative(request,env);
  if (pathname === '/api/native/test-proxy' && request.method === 'POST') return testNativeProxy(request,env);
  const nativeMatch=pathname.match(/^\/api\/native\/users(?:\/([A-Za-z0-9_.-]{3,32})(?:\/(status|reset|rotate|qr))?)?$/);
  if(nativeMatch)return nativeAdmin(request,env,nativeMatch[1],nativeMatch[2]);
  if (pathname === "/api/overview" && request.method === "GET") return overview(env,request);
  if (pathname === "/api/users" && request.method === "GET") return users(env);
  if (pathname === "/api/users" && request.method === "POST") return createUser(request, env);
  if (pathname === "/api/policies" && request.method === "GET") return listPolicies(env);
  if (pathname === "/api/policies/bulk" && request.method === "POST") return bulkPolicies(request, env);
  const policyMatch = pathname.match(/^\/api\/policies\/([A-Za-z0-9_.-]{3,96})$/);
  if (policyMatch && request.method === "PUT") return updatePolicy(request, env, policyMatch[1]!);
  if (pathname === "/api/capabilities" && request.method === "GET") return capabilities(env);
  if (pathname === "/api/nodes" && request.method === "GET") return nodes(env,request);
  if (pathname === "/api/backup" && request.method === "GET") return exportBackup(env);
  if (pathname === "/api/backup/import" && request.method === "POST") return importBackup(request, env, new URL(request.url).searchParams.get("apply") === "1");
  return error("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/panel" || url.pathname === "/panel/") {
      return new Response(PANEL_HTML.replace("new URL(result.subscriptionPath,location.origin)", "new URL(result.subscriptionPath,"+JSON.stringify(env.PUBLIC_EDGE_HOST ? "https://"+env.PUBLIC_EDGE_HOST : url.origin)+")").replace("if(link.origin!==location.origin)throw new Error();", ""), { headers: { ...securityHeaders, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'" } });
    }
    if (url.pathname.startsWith("/api/")) return adminApi(request, env, url.pathname);
    if (request.method !== "GET" && request.method !== "HEAD") return text("Method not allowed", 405, { allow: "GET, HEAD" });
    const username = usernameFromPath(url.pathname);
    if (username) return subscription(request, env, username, ctx);
    // Opaque token URLs (including configured per-user subscription subdomains)
    // resolve through the same authenticated subscription path.
    const owner = await subscriptionOwner(request, env);
    if (owner) return subscription(request, env, owner, ctx);
    if (url.pathname in tunnelMap(env)) return tunnel(request, env, url.pathname);
    if (url.pathname === "/healthz") return json({ ok: true, service: "aphrodite-edge", version: "2.0.0-beta.1", routes: Object.keys(tunnelMap(env)).length });
    return error("Not found", 404);
  },
};
