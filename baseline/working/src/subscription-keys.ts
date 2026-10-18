import type {Env} from './types';
export async function ensureSubscriptionKey(env:Env,username:string,preferred?:string):Promise<string>{
  const key=preferred&&/^[a-f0-9]{64}$/.test(preferred)?preferred:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  await env.DB.prepare('INSERT OR IGNORE INTO subscription_keys(username,token,legacy_allowed) VALUES(?,?,0)').bind(username,key).run();
  const row=await env.DB.prepare('SELECT token FROM subscription_keys WHERE username=? COLLATE NOCASE').bind(username).first<{token:string}>();
  if(!row)throw Error('Subscription key unavailable');return row.token;
}
export async function subscriptionOwner(request:Request,env:Env):Promise<string|null>{
  const url=new URL(request.url),opaque=url.pathname.match(/^\/([a-f0-9]{64})$/);
  if(opaque){const row=await env.DB.prepare('SELECT username FROM subscription_keys WHERE token=?').bind(opaque[1]).first<{username:string}>();return row?.username||null;}
  const match=url.pathname.match(/^\/feed\/([A-Za-z0-9_.-]{3,96})\/?$/);if(!match)return null;
  const row=await env.DB.prepare('SELECT token,legacy_allowed FROM subscription_keys WHERE username=? COLLATE NOCASE').bind(match[1]).first<{token:string;legacy_allowed:number}>();
  if(!row)return null;const token=url.searchParams.get('token');
  if(token)return token===row.token?match[1]!:null;
  return row.legacy_allowed?match[1]!:null;
}
