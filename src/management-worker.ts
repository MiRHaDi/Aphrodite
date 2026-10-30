import application from './index';
import {privateApplication,blank} from './private-entry';
import {nativeIdentity,ledger} from './native-accounts';
import type {Env} from './types';
import {connectionRegistry} from './deployment-registry';
import {clusterEnvironment} from './cluster-database';
import {clusterAuthorized} from './cluster-auth';
const registryCache=new WeakMap<object,{expires:number;value:string}>();
const privatePanel=privateApplication(application);
export async function machineControl(request:Request,env:Env):Promise<Response>{
 if(request.method!=='POST'||!await clusterAuthorized(request,env.EDGE_CONTROL_TOKEN,env.EDGE_CONTROL_TOKENS_JSON))return blank();
 const reader=request.body?.getReader();if(!reader)return blank();let body='',bytes=0;const decoder=new TextDecoder();
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>8192){await reader.cancel();return blank()}body+=decoder.decode(part.value,{stream:true})}body+=decoder.decode()}catch{return blank()}finally{reader.releaseLock()}
 let input:Record<string,unknown>;try{input=JSON.parse(body)}catch{return blank()}
 if(input?.action==='probe')return Response.json({ok:true,role:'management'},{headers:{'cache-control':'no-store'}});
 if(!input||typeof input.uuid!=='string'||!/^[a-f0-9-]{36}$/i.test(input.uuid))return blank();
 const account=await nativeIdentity({...env,DEPLOYMENT_ROLE:'management'},input.uuid,true);
 if(!account)return blank();
 if(input.action==='identity'){
  if(!account.enabled||(account.expires_at!==null&&account.expires_at<=Date.now()/1000))return blank();
  const {subscription_key,...identity}=account;return Response.json(identity,{headers:{'cache-control':'no-store'}});
 }
 if(!['/open','/reserve','/heartbeat','/close'].includes(String(input.action)))return blank();
 const extra=input.extra;if(!extra||typeof extra!=='object'||Array.isArray(extra))return blank();
 const fields=extra as Record<string,unknown>;
 return ledger({...env,DEPLOYMENT_ROLE:'management'},account,String(input.action),{lease:fields.lease,ip:fields.ip,consumed:fields.consumed});
}
export default {async fetch(request:Request,env:Env,ctx:ExecutionContext){
 if(request.headers.get('upgrade'))return blank();
 try{env=clusterEnvironment(env)}catch{return new Response(null,{status:503})}
 const url=new URL(request.url);
 if(env.EDGE_CONTROL_PATH&&url.pathname==='/'+env.EDGE_CONTROL_PATH)return machineControl(request,env);
 let effective={...env,DEPLOYMENT_ROLE:'management' as const};
 const path=url.pathname;
 if(path.startsWith('/'+env.ADMIN_PATH)||/^\/(?:[a-f0-9]{64}|feed\/)/.test(path)){
  try{
   let cached=registryCache.get(env.DB);
   if(!cached||cached.expires<Date.now()||path.endsWith('/api/deployment/connections')){
    cached={expires:Date.now()+10000,value:JSON.stringify(await connectionRegistry(env))};registryCache.set(env.DB,cached);
   }
   effective={...effective,EDGE_ENDPOINTS_JSON:cached.value,CONNECTION_ENDPOINTS_JSON:cached.value};
   if(path.endsWith('/api/deployment/connections')&&request.method==='POST')registryCache.delete(env.DB);
  }catch{/* The authenticated health endpoint diagnoses missing schema/bindings. */}
 }
 return privatePanel.fetch(request,effective,ctx);
}};
