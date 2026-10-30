import { json, error } from './responses';
import type { Env } from './types';
const REPOSITORY='MiRHaDi/Aphrodite';
const localVersion='2.0.0-beta.2';
function compare(a:string,b:string):number { const p=(v:string)=>v.replace(/^v/,'').split(/[.+-]/).map(x=>Number(x)||0); const aa=p(a),bb=p(b); for(let i=0;i<3;i++) if((aa[i]||0)!==(bb[i]||0)) return (aa[i]||0)>(bb[i]||0)?1:-1; return 0; }
export async function versionInfo(request:Request,env:Env):Promise<Response>{
 if(request.method!=='GET')return error('Method not allowed',405);
 try { const response=await fetch('https://api.github.com/repos/'+REPOSITORY+'/releases/latest',{headers:{accept:'application/vnd.github+json','user-agent':'Aphrodite-Version-Checker'},cf:{cacheTtl:300,cacheEverything:true}}); if(!response.ok)throw Error(); const data=await response.json() as {tag_name?:unknown;html_url?:unknown;assets?:Array<{name?:unknown,browser_download_url?:unknown}>}; const latest=typeof data.tag_name==='string'?data.tag_name:localVersion; const artifact=data.assets?.find(asset=>typeof asset.browser_download_url==='string'&&/\.(zip|tgz|tar\.gz)$/i.test(String(asset.name||''))); return json({ok:true,current:localVersion,latest,updateAvailable:compare(latest,localVersion)>0,repository:'https://github.com/'+REPOSITORY,releaseUrl:typeof data.html_url==='string'?data.html_url:null,artifactUrl:artifact?.browser_download_url||null,updateMode:env.UPDATE_WEBHOOK_URL?'signed-webhook':'manual',preserveBuildIdentity:true,buildIdentityConfigured:Boolean(env.APHRODITE_BUILD_IDENTITY)}); } catch { return json({ok:false,current:localVersion,latest:null,updateAvailable:false,repository:'https://github.com/'+REPOSITORY,message:'Release check unavailable'},503); }
}
