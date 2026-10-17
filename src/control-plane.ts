import { DEFAULT_INBOUNDS, origins } from "./config";
import { error, json } from "./responses";
import type { CreateUserInput, Env } from "./types";
import { createNative, listNative, nativeEnabled } from './native-accounts';
import { settingsFor } from './native-types';
import {nativeNodes} from './network-nodes';

let cachedToken: { value: string; expiresAt: number } | undefined;

async function controlPlaneToken(env: Env, origin: string): Promise<string | null> {
  if (env.CONTROL_PLANE_TOKEN) return env.CONTROL_PLANE_TOKEN;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!env.CONTROL_PLANE_USERNAME || !env.CONTROL_PLANE_PASSWORD) return null;
  const body = new URLSearchParams({ username: env.CONTROL_PLANE_USERNAME, password: env.CONTROL_PLANE_PASSWORD });
  try {
    const response = await fetch(origin + "/api/admin/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
    });
    if (!response.ok) return null;
    const data = await response.json() as { access_token?: string };
    if (!data.access_token) return null;
    cachedToken = { value: data.access_token, expiresAt: Date.now() + 5 * 60_000 };
    return data.access_token;
  } catch { return null; }
}

async function api(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const origin = origins(env)[0];
  if (!origin) return error("Control plane is not configured", 503);
  const token = await controlPlaneToken(env, origin);
  if (!token) return error("Control plane credentials are not configured", 503);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  try { return await fetch(origin + path, { ...init, headers }); }
  catch { return error("Control plane is unavailable", 503); }
}

function validUserInput(value: unknown): value is CreateUserInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return typeof input.username === "string" && /^[A-Za-z0-9_.-]{3,32}$/.test(input.username)
    && Number.isInteger(input.days) && Number(input.days) >= 1 && Number(input.days) <= 3650
    && (input.unlimited === undefined || typeof input.unlimited === 'boolean')
    && Number.isFinite(input.dataGb) && Number(input.dataGb) >= 1 && Number(input.dataGb) <= 100000;
}

export async function overview(env: Env,request?:Request): Promise<Response> {
  const native = await listNative(env);
  const local=nativeNodes(env,request),ready=local.filter(n=>n.status==='ready').length;
  if(!env.CONTROL_PLANE_ORIGIN&&nativeEnabled(env))return json({ok:true,nativeEnabled:true,users:native.length,activeUsers:native.filter(a=>a.enabled&&(!a.expires_at||a.expires_at>Date.now()/1000)).length,nodes:local.length,connectedNodes:0,availableNodes:ready,degraded:false});
  const [users, nodes] = await Promise.all([api(env, "/api/users?limit=1000&offset=0"), api(env, "/api/nodes")]);
  if (!users.ok || !nodes.ok) return nativeEnabled(env) ? json({ok:true,nativeEnabled:nativeEnabled(env),users:native.length,activeUsers:native.filter(a=>a.enabled&&(!a.expires_at||a.expires_at>Date.now()/1000)).length,nodes:local.length,connectedNodes:0,availableNodes:ready,degraded:true}) : error("Unable to load control-plane overview", 502);
  const userData = await users.json() as { users?: Array<{ status?: string }> };
  const nodeData = await nodes.json() as Array<{ status?: string }>;
  const list = userData.users || [];
  return json({ ok: true, nativeEnabled:nativeEnabled(env), users: list.length+native.length, activeUsers: list.filter(user => user.status === "active").length+native.filter(a=>a.enabled&&(!a.expires_at||a.expires_at>Date.now()/1000)).length,
    nodes: nodeData.length+local.length, connectedNodes: nodeData.filter(node => node.status === "connected").length,availableNodes:nodeData.filter(node=>node.status==='connected').length+ready });
}

export async function users(env: Env): Promise<Response> {
  const native=await listNative(env),response=await api(env, "/api/users?limit=1000&offset=0");
  if(!native.length&&response.ok)return response;if(!native.length&&!nativeEnabled(env))return response;
  const data=response.ok?await response.json() as {users?:unknown[]}:{};
  return json({users:[...native.map(a=>({username:a.username,status:!a.enabled?'disabled':a.expires_at&&a.expires_at<Date.now()/1000?'expired':'active',used_traffic:null,data_limit:settingsFor(a).dataLimitBytes,expire:a.expires_at,engine:'native'})),...(data.users||[])]});
}

export async function nodes(env: Env,request?:Request): Promise<Response> {
  const local=nativeNodes(env,request);
  if(!env.CONTROL_PLANE_ORIGIN&&local.length)return json({nodes:local,nativeEnabled:true});
  const response = await api(env, "/api/nodes");
  if (!response.ok) return local.length?json({nodes:local,nativeEnabled:true,degraded:true}):error("Unable to load nodes", 502);
  const data = await response.json() as Array<{ id?: number; name?: string; status?: string }>;
  if (!Array.isArray(data)) return error("Invalid node response", 502);
  return json({ nodes: [...local,...data.map(node => ({ id: node.id, name: node.name, status: node.status }))] });
}

export async function createUser(request: Request, env: Env): Promise<Response> {
  let input: unknown; try { input = await request.json(); } catch { return error("Invalid JSON", 400); }
  if(input&&typeof input==='object'&&((input as {engine?:string}).engine==='native'||(!env.CONTROL_PLANE_ORIGIN&&nativeEnabled(env))))return createNative(input as Record<string,unknown>,env);
  if (!validUserInput(input)) return error("Invalid user settings", 400);
  const expire = input.unlimited ? null : Math.floor(Date.now() / 1000) + input.days * 86400;
  const dataLimit = input.unlimited ? 0 : Math.round(input.dataGb * 1073741824);
  const payload = { username: input.username, status: "active", expire, data_limit: dataLimit,
    data_limit_reset_strategy: "no_reset", proxies: { vless: {}, vmess: {}, trojan: {}, shadowsocks: {} }, inbounds: DEFAULT_INBOUNDS };
  const response = await api(env, "/api/user", { method: "POST", body: JSON.stringify(payload) });
  if (!response.ok) return error("User creation failed", response.status);
  const created = await response.json() as { subscription_url?: string };
  const upstreamPath = typeof created.subscription_url === "string" && created.subscription_url.startsWith("/sub/")
    ? created.subscription_url
    : `/sub/${encodeURIComponent(input.username)}`;
  try {
    await env.DB.prepare("INSERT INTO subscription_routes(username, backend_username, upstream_path, enabled, updated_at) VALUES(?, ?, ?, 1, unixepoch()) ON CONFLICT(username) DO UPDATE SET backend_username=excluded.backend_username, upstream_path=excluded.upstream_path, enabled=1, updated_at=unixepoch()")
      .bind(input.username, input.username, upstreamPath).run();
  } catch {
    await env.DB.prepare("INSERT INTO subscription_routes(username, upstream_path, enabled, updated_at) VALUES(?, ?, 1, unixepoch()) ON CONFLICT(username) DO UPDATE SET upstream_path=excluded.upstream_path, enabled=1, updated_at=unixepoch()")
      .bind(input.username, upstreamPath).run();
  }
  await env.DB.prepare("INSERT INTO user_policies(username, enabled, data_limit_bytes, expires_at, updated_at) VALUES(?, 1, ?, ?, unixepoch()) ON CONFLICT(username) DO UPDATE SET enabled=1, data_limit_bytes=excluded.data_limit_bytes, expires_at=excluded.expires_at, updated_at=unixepoch()")
    .bind(input.username, dataLimit, expire).run();
  await env.DB.prepare("INSERT INTO audit_events(action, subject, created_at) VALUES('user.create', ?, unixepoch())").bind(input.username).run();
  return json({ ok: true, username: input.username, subscriptionPath: `/feed/${encodeURIComponent(input.username)}`, upstream: created.subscription_url || null }, 201);
}
