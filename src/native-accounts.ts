import { error, json } from './responses';
import { nativeDefaults, parseNativeSettings, settingsFor, type NativeAccount } from './native-types';
import type { Env } from './types';
import { d1Ledger } from './native-ledger';
import qrcode from 'qrcode-generator';
const identityCache=new Map<string,{value:NativeAccount|null;expires:number}>();
export async function nativeIdentity(env:Env,uuid:string):Promise<NativeAccount|null>{
  const saved=identityCache.get(uuid);if(saved&&saved.expires>Date.now())return saved.value;
  const value=await env.DB.prepare('SELECT * FROM native_accounts WHERE uuid=? LIMIT 1').bind(uuid).first<NativeAccount>();
  if(identityCache.size>=2048)identityCache.delete(identityCache.keys().next().value!);identityCache.set(uuid,{value,expires:Date.now()+15000});return value;
}

export const nativeEnabled = (env: Env): boolean => env.NATIVE_ENABLED === 'true';
export async function findNative(env: Env, username: string): Promise<NativeAccount | null> {
  if (!nativeEnabled(env)) return null;
  return env.DB.prepare('SELECT * FROM native_accounts WHERE username = ? COLLATE NOCASE LIMIT 1').bind(username).first<NativeAccount>();
}
export async function ledger(env: Env, account: NativeAccount, path = '/status', extra: Record<string, unknown> = {}): Promise<Response> {
  if (!env.ACCOUNT_STATE) return d1Ledger(env,account,path,extra);
  const stub = env.ACCOUNT_STATE.get(env.ACCOUNT_STATE.idFromName(account.username.toLowerCase()));
  return stub.fetch('https://account.internal'+path, { method: 'POST', body: JSON.stringify({ account, ...extra }), headers: { 'content-type': 'application/json' } });
}
export async function listNative(env: Env): Promise<NativeAccount[]> {
  if (!nativeEnabled(env)) return [];
  const result = await env.DB.prepare('SELECT * FROM native_accounts ORDER BY created_at DESC LIMIT 1000').all<NativeAccount>();
  return result.results || [];
}
export async function createNative(input: Record<string, unknown>, env: Env): Promise<Response> {
  if (!nativeEnabled(env)) return error('Native core is not enabled', 503);
  if (typeof input.username !== 'string' || !/^[A-Za-z0-9_.-]{3,32}$/.test(input.username)) return error('Invalid username',400);
  const days = Number(input.days), gb = Number(input.dataGb);
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650 || !Number.isFinite(gb) || gb < 1 || gb > 100000 || (input.unlimited !== undefined && typeof input.unlimited !== 'boolean')) return error('Invalid limits',400);
  const defaultsRow = await env.DB.prepare("SELECT value FROM native_configuration WHERE key='defaults'").first<{value:string}>();
  const defaults=defaultsRow?parseNativeSettings(JSON.parse(defaultsRow.value))||nativeDefaults:nativeDefaults;
  const settings = parseNativeSettings({ ...defaults, dataLimitBytes: input.unlimited ? 0 : Math.round(gb * 1073741824), ...(input.settings as object || {}) });
  if (!settings) return error('Invalid native settings',400);
  const existing = await env.DB.prepare('SELECT username FROM subscription_routes WHERE username = ? COLLATE NOCASE LIMIT 1').bind(input.username).first();
  if (existing || await findNative(env,input.username)) return error('Username already exists',409);
  const uuid = crypto.randomUUID(), key=(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-',''), expiry = input.unlimited ? null : Math.floor(Date.now()/1000)+days*86400;
  try { await env.DB.prepare('INSERT INTO native_accounts(username, uuid, subscription_key, expires_at, settings_json) VALUES(?, ?, ?, ?, ?)').bind(input.username,uuid,key,expiry,JSON.stringify(settings)).run(); }
  catch { return error('Unable to create account',409); }
  await env.DB.prepare("INSERT INTO audit_events(action,subject) VALUES('native.create',?)").bind(input.username).run();
  return json({ ok:true,username:input.username,subscriptionPath:'/feed/'+encodeURIComponent(input.username)+'?token='+key,engine:'native' },201);
}
export async function nativeAdmin(request: Request, env: Env, username?: string, action?: string): Promise<Response> {
  if (!nativeEnabled(env)) return error('Native core is not enabled',503);
  if (!username) {
    if(request.method==='POST'){let input:Record<string,unknown>;try{input=await request.json();}catch{return error('Invalid JSON',400)}return createNative(input,env)}
    return json({users:(await listNative(env)).map(account=>({...account,settings:settingsFor(account)}))});
  }
  let account=await findNative(env,username);if(!account)return error('Account not found',404);
  if(request.method==='GET'){
    if(action==='qr'){
      const url=new URL('/feed/'+encodeURIComponent(username),request.url);url.searchParams.set('token',account.subscription_key||'');
      const qr=qrcode(0,'M');qr.addData(url.href);qr.make();
      return new Response(qr.createSvgTag({cellSize:5,margin:15,scalable:true}),{headers:{'content-type':'image/svg+xml','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'"}});
    }
    return action==='status'?ledger(env,account):json({...account,settings:settingsFor(account)});
  }
  if(request.method==='DELETE'){
    account={...account,enabled:0,revision:account.revision+1};await ledger(env,account,'/configure');
    // A disabled tombstone prevents reuse of the old UUID and preserves the ledger.
    await env.DB.prepare('UPDATE native_accounts SET enabled=0,uuid=?,revision=revision+1,updated_at=unixepoch() WHERE username=?').bind(crypto.randomUUID(),username).run();
    await env.DB.prepare("INSERT INTO audit_events(action,subject) VALUES('native.disable',?)").bind(username).run();
    return json({ok:true});
  }
  let input:Record<string,unknown>;try{input=await request.json()}catch{return error('Invalid JSON',400)}
  if(action==='reset'&&request.method==='POST')return ledger(env,account,'/reset',{action:input.action});
  if(action==='rotate'&&request.method==='POST'){
    await env.DB.prepare('UPDATE native_accounts SET uuid=?,revision=revision+1,updated_at=unixepoch() WHERE username=?').bind(crypto.randomUUID(),username).run();
    account=(await findNative(env,username))!;await ledger(env,account,'/configure');return json({ok:true,subscriptionPath:'/feed/'+encodeURIComponent(username)+'?token='+account.subscription_key});
  }
  if(request.method!=='PUT')return error('Method not allowed',405);
  const settings=parseNativeSettings({...settingsFor(account),...(input.settings as object||{})});
  const enabled=input.enabled===undefined?Boolean(account.enabled):input.enabled;
  const expiry=input.expiresAt===undefined?account.expires_at:input.expiresAt;
  if(!settings||typeof enabled!=='boolean'||(expiry!==null&&(!Number.isSafeInteger(expiry)||Number(expiry)<1)))return error('Invalid account settings',400);
  await env.DB.prepare('UPDATE native_accounts SET enabled=?,expires_at=?,settings_json=?,revision=revision+1,updated_at=unixepoch() WHERE username=?').bind(enabled?1:0,expiry,JSON.stringify(settings),username).run();
  account=(await findNative(env,username))!;await ledger(env,account,'/configure');
  await env.DB.prepare("INSERT INTO audit_events(action,subject) VALUES('native.update',?)").bind(username).run();return json({ok:true});
}
