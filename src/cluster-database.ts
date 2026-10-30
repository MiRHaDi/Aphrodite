import type {Env} from './types';
import {clusterAuthorized} from './cluster-auth';
type Statement={sql:string;params:unknown[]};
const clients=new WeakMap<object,D1Database>();
/** The supported D1 subset is prepare/bind/first/all/run/batch. No write retries. */
export function clusterEnvironment(env:Env):Env{
 if(!env.DATA_CONTROL_URL)return env;
 if(env.DEPLOYMENT_ROLE==='connection')throw Error('Connection nodes cannot hold database credentials');
 let DB=clients.get(env);if(!DB){DB=remoteDatabase(env);clients.set(env,DB)}
 return {...env,DB};
}
export function remoteDatabase(env:Env):D1Database{
 const url=new URL(env.DATA_CONTROL_URL!);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!env.DATA_CONTROL_TOKEN||env.DATA_CONTROL_TOKEN.length<32)throw Error('Invalid remote database configuration');
 const rpc=async(statements:Statement[])=>{
  const response=await (env.DATA_CONTROL_SERVICE?env.DATA_CONTROL_SERVICE.fetch(url.href,{method:'POST',headers:{authorization:'Bearer '+env.DATA_CONTROL_TOKEN,'content-type':'application/json'},body:JSON.stringify({statements}),redirect:'manual',signal:AbortSignal.timeout(15000)}):fetch(url.href,{method:'POST',headers:{authorization:'Bearer '+env.DATA_CONTROL_TOKEN,'content-type':'application/json'},body:JSON.stringify({statements}),redirect:'manual',signal:AbortSignal.timeout(15000)}));
  if(!response.ok)throw Error('Remote database unavailable; operation was not retried');
  const data=await response.json() as {results?:D1Result[]};if(!Array.isArray(data.results)||data.results.length!==statements.length||data.results.some(r=>!r.success))throw Error('Remote database operation failed');return data.results;
 };
 class Prepared{
  constructor(readonly statement:Statement){}
  bind(...params:unknown[]){return new Prepared({sql:this.statement.sql,params})}
  async all(){return (await rpc([this.statement]))[0]!}
  async run(){return this.all()}
  async first(column?:string){const row=(await this.all()).results[0] as Record<string,unknown>|undefined;if(column&&row&&!(column in row))throw Error('Unknown result column');return row?(column?row[column]:row):null}
 }
 return {prepare:(sql:string)=>new Prepared({sql,params:[]}),batch:async(statements:Prepared[])=>{if(statements.some(s=>!(s instanceof Prepared)))throw Error('Foreign database statement');return rpc(statements.map(s=>s.statement))}} as unknown as D1Database;
}
/** Full data-plane privilege: only management servers receive these credentials. */
export async function databaseControl(request:Request,env:Env):Promise<Response>{
 const deny=()=>new Response(null,{status:404,headers:{'cache-control':'no-store'}});
 if(request.method!=='POST'||!await clusterAuthorized(request,env.DATA_CONTROL_TOKEN,env.DATA_CONTROL_TOKENS_JSON))return deny();
 const reader=request.body?.getReader();if(!reader)return deny();let bytes=0;const chunks:Uint8Array[]=[];
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>262144){await reader.cancel();return deny()}chunks.push(part.value)}}catch{return deny()}finally{reader.releaseLock()}
 try{
  const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
  const {statements}=JSON.parse(new TextDecoder().decode(body));
  if(!Array.isArray(statements)||!statements.length||statements.length>50)return deny();
  const prepared=statements.map((s:Statement)=>{if(!s||typeof s.sql!=='string'||!s.sql.length||s.sql.length>65536||!Array.isArray(s.params)||s.params.length>100||s.params.some(p=>p!==null&&typeof p!=='string'&&!(typeof p==='number'&&Number.isFinite(p))))throw Error('Invalid statement');return env.DB.prepare(s.sql).bind(...s.params)});
  return Response.json({results:await env.DB.batch(prepared)},{headers:{'cache-control':'no-store'}});
 }catch{return new Response(null,{status:503,headers:{'cache-control':'no-store'}})}
}
