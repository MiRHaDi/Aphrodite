import {build} from 'esbuild';
import {createHash} from 'node:crypto';

// This is a deployment restriction, not DRM against an account administrator.
export async function lockArtifact(artifact,addresses,{wildcardDomain}={}){
  const hosts=[...new Set(addresses.map(address=>new URL(address).hostname.toLowerCase()))].sort();
  if(!hosts.length)throw Error('At least one deployment address is required');
  const result=await build({stdin:{contents:`import application from 'deployment-source';
const hosts=${JSON.stringify(hosts)};
const wildcard=${JSON.stringify(wildcardDomain||'')};
export default {...application,fetch(request,env,ctx){
 const host=new URL(request.url).hostname.toLowerCase();
 if(!hosts.includes(host)&&!(wildcard&&host.endsWith('.'+wildcard)&&!host.slice(0,-wildcard.length-1).includes('.')))return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
 return application.fetch(request,env,ctx);
}};`,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',external:['cloudflare:*'],plugins:[{name:'deployment-source',setup(api){
    api.onResolve({filter:/^deployment-source$/},()=>({path:'source',namespace:'deployment'}));
    api.onLoad({filter:/.*/,namespace:'deployment'},()=>({contents:artifact.code,loader:'js'}));
  }}]});
  const code=result.outputFiles[0].text;
  return {...artifact,code,manifest:{...artifact.manifest,allowedHosts:hosts,sha256:createHash('sha256').update(code).digest('hex'),bytes:Buffer.byteLength(code)}};
}
