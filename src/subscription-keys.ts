import type {Env} from './types';
export function subscriptionUuid(token:string,nativeUuid?:string):string{
 if(nativeUuid)return nativeUuid;
 return token.slice(0,8)+'-'+token.slice(8,12)+'-4'+token.slice(13,16)+'-a'+token.slice(17,20)+'-'+token.slice(20,32);
}
export function subscriptionPathFor(env:Env,username:string,token:string,uuid?:string):string{
 const identity=env.SUBSCRIPTION_ID_MODE==='username'?username:env.SUBSCRIPTION_ID_MODE==='uuid'?subscriptionUuid(token,uuid):undefined;
 return '/'+token+(identity?'/'+encodeURIComponent(identity):'');
}
export function subscriptionUrlFor(env:Env,origin:string,username:string,token:string,uuid?:string):string{
 const path=subscriptionPathFor(env,username,token,uuid),domain=env.SUBSCRIPTION_DOMAIN;
 let identity=env.SUBSCRIPTION_ID_MODE==='username'?username:subscriptionUuid(token,uuid);
 let reserved:string[]=[];try{const value=JSON.parse(env.SUBSCRIPTION_RESERVED_HOSTS_JSON||'[]');if(Array.isArray(value))reserved=value.filter(item=>typeof item==='string');}catch{}
 if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(identity)||reserved.includes(identity.toLowerCase()))identity=subscriptionUuid(token,uuid);
 if(domain&&!reserved.includes(identity.toLowerCase()))return 'https://'+identity.toLowerCase()+'.'+domain+path;
 return new URL(path,env.PUBLIC_EDGE_HOST?'https://'+env.PUBLIC_EDGE_HOST:origin).href;
}
export async function ensureSubscriptionKey(env:Env,username:string,preferred?:string):Promise<string>{
  const existing=await env.DB.prepare('SELECT token FROM subscription_keys WHERE username=? COLLATE NOCASE').bind(username).first<{token:string}>();if(existing?.token)return existing.token;
  const key=preferred&&/^[a-f0-9]{64}$/.test(preferred)?preferred:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  await env.DB.prepare('INSERT OR IGNORE INTO subscription_keys(username,token,legacy_allowed) VALUES(?,?,0)').bind(username,key).run();
  const row=await env.DB.prepare('SELECT token FROM subscription_keys WHERE username=? COLLATE NOCASE').bind(username).first<{token:string}>();
  if(!row)throw Error('Subscription key unavailable');return row.token;
}
export async function subscriptionOwner(request:Request,env:Env):Promise<string|null>{
  const url=new URL(request.url),opaque=url.pathname.match(/^\/([a-f0-9]{64})(?:\/([A-Za-z0-9_.-]{3,96}))?$/);
  if(opaque){const row=await env.DB.prepare('SELECT username FROM subscription_keys WHERE token=?').bind(opaque[1]).first<{username:string}>();if(!row)return null;
   if(opaque[2]&&opaque[2].toLowerCase()!==row.username.toLowerCase()){
    const native=await env.DB.prepare('SELECT uuid FROM native_accounts WHERE username=? COLLATE NOCASE').bind(row.username).first<{uuid:string}>();if(opaque[2].toLowerCase()!==subscriptionUuid(opaque[1]!,native?.uuid).toLowerCase())return null;
   }
   return row.username;
  }
  const match=url.pathname.match(/^\/feed\/([A-Za-z0-9_.-]{3,96})\/?$/);if(!match)return null;
  const row=await env.DB.prepare('SELECT token,legacy_allowed FROM subscription_keys WHERE username=? COLLATE NOCASE').bind(match[1]).first<{token:string;legacy_allowed:number}>();
  if(!row)return null;const token=url.searchParams.get('token');
  if(token)return token===row.token?match[1]!:null;
  return row.legacy_allowed?match[1]!:null;
}
