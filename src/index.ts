import { isAdmin } from "./auth";
import { createUser, overview, users, nodes } from "./control-plane";
import { PANEL_HTML } from "./panel";
import { error, json, securityHeaders, text } from "./responses";
import { subscription, usernameFromPath } from "./subscription";
import { tunnel } from "./tunnel";
import { tunnelMap } from "./config";
import type { Env } from "./types";
import { capabilities, listPolicies, updatePolicy } from "./policies";
import { bulkPolicies, exportBackup, importBackup } from "./admin-data";

async function adminApi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (!await isAdmin(request, env)) return error("Unauthorized", 401);
  if (pathname === "/api/overview" && request.method === "GET") return overview(env);
  if (pathname === "/api/users" && request.method === "GET") return users(env);
  if (pathname === "/api/users" && request.method === "POST") return createUser(request, env);
  if (pathname === "/api/policies" && request.method === "GET") return listPolicies(env);
  if (pathname === "/api/policies/bulk" && request.method === "POST") return bulkPolicies(request, env);
  const policyMatch = pathname.match(/^\/api\/policies\/([A-Za-z0-9_.-]{3,96})$/);
  if (policyMatch && request.method === "PUT") return updatePolicy(request, env, policyMatch[1]!);
  if (pathname === "/api/capabilities" && request.method === "GET") return capabilities(env);
  if (pathname === "/api/nodes" && request.method === "GET") return nodes(env);
  if (pathname === "/api/backup" && request.method === "GET") return exportBackup(env);
  if (pathname === "/api/backup/import" && request.method === "POST") return importBackup(request, env, new URL(request.url).searchParams.get("apply") === "1");
  return error("Not found", 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/panel" || url.pathname === "/panel/") {
      return new Response(PANEL_HTML.replace("new URL(result.subscriptionPath,location.origin)", "new URL(result.subscriptionPath,"+JSON.stringify(env.PUBLIC_EDGE_HOST ? "https://"+env.PUBLIC_EDGE_HOST : "https://smart.dr-mirhadi.ir")+")").replace("if(link.origin!==location.origin)throw new Error();", ""), { headers: { ...securityHeaders, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'" } });
    }
    if (url.pathname.startsWith("/api/")) return adminApi(request, env, url.pathname);
    if (request.method !== "GET" && request.method !== "HEAD") return text("Method not allowed", 405, { allow: "GET, HEAD" });
    const username = usernameFromPath(url.pathname);
    if (username) return subscription(request, env, username, ctx);
    if (url.pathname in tunnelMap(env)) return tunnel(request, env, url.pathname);
    if (url.pathname === "/healthz") return json({ ok: true, service: "aphrodite-edge", version: "1.5.3", routes: Object.keys(tunnelMap(env)).length });
    return error("Not found", 404);
  },
};
