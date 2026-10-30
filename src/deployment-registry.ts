import type {Env} from './types';
import {json,error} from './responses';
type Endpoint={address:string;sni:string;host:string;id?:string;name?:string;country?:string;protocols?:string[]};
const hostname=(value:unknown):value is string=>typeof value==='string'&&value.length<=253&&/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(value);
function valid(value:unknown):value is Endpoint{return Boolean(value&&typeof value==='object'&&['address','sni','host'].every(key=>hostname((value as Record<string,unknown>)[key])));}
export async function connectionRegistry(env:Env):Promise<Endpoint[]>{
 const row=await env.DB.prepare("SELECT value FROM native_configuration WHERE key='connection_endpoints'").first<{value:string}>();
 const saved=row?JSON.parse(row.value):JSON.parse(env.CONNECTION_ENDPOINTS_JSON||'[]');
 return Array.isArray(saved)?saved.filter(valid).slice(0,64):[];
}
export async function deploymentConnections(request:Request,env:Env):Promise<Response>{
 if(env.DEPLOYMENT_ROLE!=='management')return error('Management role required',409);
 if(request.method==='GET')return json({ok:true,endpoints:await connectionRegistry(env)});
 if(!['POST','PUT'].includes(request.method))return error('Method not allowed',405);
 let input:unknown;try{input=await request.json()}catch{return error('Invalid JSON',400)}
 const add=(input as {endpoints?:unknown[]})?.endpoints;
 if(!Array.isArray(add)||add.length>16||!add.every(valid))return error('Invalid connection endpoints',400);
 const current=request.method==='PUT'?[]:await connectionRegistry(env);
 const merged=[...current,...add].filter((item,index,list)=>list.findIndex(other=>other.host===item.host&&other.sni===item.sni&&other.address===item.address)===index);
 if(merged.length>64)return error('Connection limit reached',409);
 // Merge in SQLite so concurrent installers cannot overwrite each other's nodes.
 await env.DB.prepare(`INSERT INTO native_configuration(key,value) VALUES('connection_endpoints',?)
 ON CONFLICT(key) DO UPDATE SET value=(SELECT json_group_array(json(item)) FROM
 (SELECT DISTINCT value AS item FROM json_each(native_configuration.value)
 UNION SELECT DISTINCT value AS item FROM json_each(excluded.value))),updated_at=unixepoch()`).bind(JSON.stringify(merged)).run();
 return json({ok:true,endpoints:await connectionRegistry(env)});
}
export async function deploymentHealth(env:Env):Promise<Response>{
 if(!env.DB||typeof env.DB.prepare!=='function')return json({ok:false,code:'DATABASE_BINDING_MISSING',action:'Restore the DB binding to the saved D1 database'},503);
 try{
  const table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('subscription_routes','user_policies','native_accounts','native_configuration','native_usage','native_leases','subscription_keys')").all<{name:string}>();
  const columns=await env.DB.prepare('PRAGMA table_info(native_accounts)').all<{name:string}>();
  if(table.results?.length!==7||!['uuid','subscription_key','settings_json','revision'].every(name=>columns.results?.some(column=>column.name===name)))return json({ok:false,code:'DATABASE_SCHEMA_INCOMPLETE',action:'Resume database migrations; preserve the existing D1 database'},503);
  await env.DB.prepare('SELECT username FROM native_accounts LIMIT 1').all();
  return json({ok:true,role:env.DEPLOYMENT_ROLE||'standalone'});
 }catch{return json({ok:false,code:'DATABASE_UNAVAILABLE',action:'Check D1 binding, account limits and Cloudflare runtime logs'},503)}
}
