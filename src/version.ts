import { json, error } from './responses';
import type { Env } from './types';
const REPOSITORY='MiRHaDi/Aphrodite';
const localVersion='2.0.0-beta.2';
function compare(a:string,b:string):number { const p=(v:string)=>v.replace(/^v/,'').split(/[.+-]/).map(x=>Number(x)||0); const aa=p(a),bb=p(b); for(let i=0;i<3;i++) if((aa[i]||0)!==(bb[i]||0)) return (aa[i]||0)>(bb[i]||0)?1:-1; return 0; }
export async function versionInfo(request:Request,env:Env):Promise<Response>{
 if(request.method!=='GET')return error('Method not allowed',405);
 try { const response=await fetch('https://raw.githubusercontent.com/'+REPOSITORY+'/main/package.json',{headers:{accept:'application/json','user-agent':'Aphrodite-Version-Checker'},cf:{cacheTtl:300,cacheEverything:true}}); if(!response.ok)throw Error(); const data=await response.json() as {version?:unknown}; const latest=typeof data.version==='string'?data.version:localVersion; return json({ok:true,current:localVersion,latest,updateAvailable:compare(latest,localVersion)>0,repository:'https://github.com/'+REPOSITORY,updateMode:env.UPDATE_WEBHOOK_URL?'webhook':'manual'}); } catch { return json({ok:false,current:localVersion,latest:null,updateAvailable:false,repository:'https://github.com/'+REPOSITORY,message:'Version check unavailable'},503); }
}
