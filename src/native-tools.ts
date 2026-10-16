import { createNative, findNative, ledger, listNative } from './native-accounts';
import { connectDestination } from './native-network';
import { nativeDefaults, parseNativeSettings, settingsFor } from './native-types';
import { error, json } from './responses';
import type { Env } from './types';
import { relayFactory } from './native-relay';

export async function nativeSettings(request:Request,env:Env):Promise<Response>{
  if(request.method==='GET'){const row=await env.DB.prepare("SELECT value FROM native_configuration WHERE key='defaults'").first<{value:string}>();return json({settings:row?JSON.parse(row.value):nativeDefaults})}
  if(request.method!=='PUT')return error('Method not allowed',405);
  let value:unknown;try{value=await request.json()}catch{return error('Invalid JSON',400)}const settings=parseNativeSettings(value);if(!settings)return error('Invalid settings',400);
  await env.DB.prepare("INSERT INTO native_configuration(key,value) VALUES('defaults',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=unixepoch()").bind(JSON.stringify(settings)).run();
  return json({ok:true});
}
export async function nativeBackup(env:Env):Promise<Response>{
  const accounts=await listNative(env),users=[];
  for(const account of accounts){const response=await ledger(env,account);if(!response.ok)return error('Accounting unavailable',503);users.push({...account,settings:settingsFor(account),usage:await response.json()})}
  const config=await env.DB.prepare("SELECT value FROM native_configuration WHERE key='defaults'").first<{value:string}>();
  return json({format:'aphrodite-native-backup',version:1,exportedAt:new Date().toISOString(),users,defaults:config?JSON.parse(config.value):nativeDefaults});
}
export async function importNative(request:Request,env:Env):Promise<Response>{
  let input:unknown;try{input=await request.json()}catch{return error('Invalid JSON',400)}
  const ownBackup=(input as {format?:string})?.format==='aphrodite-native-backup';
  const defaults=ownBackup?parseNativeSettings((input as {defaults?:unknown}).defaults):null;
  if(ownBackup&&!defaults)return error('Invalid backup defaults',400);
  const value=input as {users?:unknown[]};const list=Array.isArray(input)?input:value?.users;
  if(!Array.isArray(list)||list.length>1000)return error('Invalid import document',400);
  const prepared:Array<Record<string,unknown>>=[];const names=new Set<string>();
  for(const raw of list){
    if(!raw||typeof raw!=='object')return error('Invalid account',400);const u=raw as Record<string,unknown>;
    if(typeof u.username!=='string'||!/^[A-Za-z0-9_.-]{3,32}$/.test(u.username)||names.has(u.username.toLowerCase()))return error('Invalid or duplicate username',400);names.add(u.username.toLowerCase());
    const own=(input as {format?:string})?.format==='aphrodite-native-backup';
    const limits=own?(u.settings as Record<string,unknown>):{
      dataLimitBytes:u.limit_gb?Math.round(Number(u.limit_gb)*1073741824):0,requestLimit:Number(u.limit_req||0),maxConnections:Number(u.max_connections||0),maxIps:Number(u.ip_limit||0),
      resetVolumeDays:Number(u.auto_reset_vol_days||0),resetRequestDays:Number(u.auto_reset_req_days||0),rotationMinutes:Number(u.rotate_time||0),addressCount:Number(u.ip_count||3),
      addresses:typeof u.ips==='string'?u.ips.split(/[\s,]+/).filter(Boolean):[],ports:String(u.port||443).split(',').map(Number),fingerprint:typeof u.fingerprint==='string'?u.fingerprint:'chrome',
      blockAds:Boolean(u.block_ads),blockAdult:Boolean(u.block_porn),proxies:typeof u.user_socks5==='string'?u.user_socks5.split(/\n/).map(x=>x.trim()).filter(Boolean):[],rotateProxy:Boolean(u.auto_rotate_user_proxy),
    };
    const settings=parseNativeSettings({...nativeDefaults,...limits});if(!settings)return error('Unsupported or invalid settings for '+u.username,400);
    const expiry=own?u.expires_at:u.expiry_days?Math.floor((typeof u.created_at==='number'?u.created_at:Date.parse(String(u.created_at)))/1000)+Number(u.expiry_days)*86400:null;
    if(expiry!==null&&(!Number.isSafeInteger(expiry)||Number(expiry)<1))return error('Invalid expiry for '+u.username,400);
    const usage=own?u.usage:{usedBytes:Math.round(Number(u.used_gb||0)*1073741824),lifetimeBytes:Math.round(Number(u.lifetime_used_gb||u.used_gb||0)*1073741824),requests:Number(u.used_req||0)};
    if(!usage||typeof usage!=='object'||['usedBytes','lifetimeBytes','requests'].some(key=>!Number.isSafeInteger((usage as Record<string,unknown>)[key])||Number((usage as Record<string,unknown>)[key])<0))return error('Invalid usage for '+u.username,400);
    prepared.push({username:u.username,settings,expiry,usage,enabled:own?Boolean(u.enabled):u.is_active!==0});
  }
  const skips:string[]=[];
  for(const item of prepared){const exists=await findNative(env,String(item.username))||await env.DB.prepare('SELECT username FROM subscription_routes WHERE username=? COLLATE NOCASE LIMIT 1').bind(item.username).first();if(exists)skips.push(String(item.username))}
  if(new URL(request.url).searchParams.get('apply')!=='1')return json({ok:true,preview:true,accounts:prepared.length,create:prepared.length-skips.length,skipped:skips,note:'Existing accounts are preserved. Imported accounts receive new credentials; saved usage is restored.'});
  let created=0;
  for(const item of prepared){if(skips.includes(String(item.username)))continue;const settings=item.settings as {dataLimitBytes:number};const response=await createNative({username:item.username,days:30,dataGb:Math.max(1,settings.dataLimitBytes/1073741824),unlimited:!settings.dataLimitBytes,settings:item.settings},env);if(!response.ok)return error('Import stopped after '+created+' accounts',500);await env.DB.prepare('UPDATE native_accounts SET enabled=?,expires_at=? WHERE username=?').bind(item.enabled?1:0,item.expiry,item.username).run();const account=await findNative(env,String(item.username));if(!account||(await ledger(env,account,'/restore',{usage:item.usage})).status!==200)return error('Import stopped while restoring usage after '+created+' accounts',500);created++}
  if(defaults)await env.DB.prepare("INSERT INTO native_configuration(key,value) VALUES('defaults',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=unixepoch()").bind(JSON.stringify(defaults)).run();
  return json({ok:true,created,skipped:skips,defaultsRestored:Boolean(defaults)});
}
export async function testNativeProxy(request:Request,env:Env):Promise<Response>{
  let input:{proxy?:string};try{input=await request.json()}catch{return error('Invalid JSON',400)}
  const {validProxy}=await import('./native-types');if(!validProxy(input.proxy))return error('Invalid proxy URL',400);
  const started=Date.now();let connection:Awaited<ReturnType<typeof connectDestination>>|undefined;
  try{connection=await connectDestination('example.com',80,input.proxy,undefined,relayFactory(env));await connection.writer.write(new TextEncoder().encode('HEAD / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n'));const reply=await Promise.race([connection.reader.read(),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Timeout')),7000))]);return json({ok:!reply.done&&reply.value.length>0,latencyMs:Date.now()-started})}
  catch{return json({ok:false,latencyMs:Date.now()-started},502)}finally{if(connection)await connection.socket.close().catch(()=>{})}
}
