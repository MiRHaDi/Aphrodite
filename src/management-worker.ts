import application from './index';
import {privateApplication,blank} from './private-entry';
import {nativeIdentity,ledger} from './native-accounts';
import type {Env} from './types';
const privatePanel=privateApplication(application);
async function authorized(request:Request,env:Env){
 if(!env.EDGE_CONTROL_TOKEN||env.EDGE_CONTROL_TOKEN.length<32)return false;
 const supplied=request.headers.get('authorization')||'';
 const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([hash(supplied),hash('Bearer '+env.EDGE_CONTROL_TOKEN)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]!^b[i]!;return diff===0;
}
export async function machineControl(request:Request,env:Env):Promise<Response>{
 if(request.method!=='POST'||!await authorized(request,env))return blank();
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
 const url=new URL(request.url);
 if(env.EDGE_CONTROL_PATH&&url.pathname==='/'+env.EDGE_CONTROL_PATH)return machineControl(request,env);
 return privatePanel.fetch(request,{...env,DEPLOYMENT_ROLE:'management'},ctx);
}};
