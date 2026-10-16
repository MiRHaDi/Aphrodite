import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const required=(value,name)=>{if(!value)throw Error('Missing '+name);return value;};
export function name(value){if(!/^[a-z][a-z0-9-]{2,48}$/.test(value))throw Error('Invalid deployment name');return value;}
export function configuration(options){
  const adminPath=options.adminPath||randomUUID(),adminToken=options.adminToken||randomBytes(32).toString('base64url');
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(adminPath)||adminToken.length<24)throw Error('Invalid administrator path or token');
  return {ADMIN_PATH:adminPath,ADMIN_TOKEN:adminToken,APHRODITE_BUILD_NONCE:randomBytes(16).toString('hex'),NATIVE_ENABLED:'true',CONTROL_PLANE_ORIGIN:options.origin||'',PUBLIC_EDGE_HOST:options.domain||'',PORT:'8080',DATA_DIR:'/data',...options.variables};
}
export async function jsonRequest(url,{token,body,method='GET',headers={}}={}){
  const response=await fetch(url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  const data=await response.json().catch(()=>null);if(!response.ok||data?.success===false||data?.errors?.length)throw Error('Provider request failed ('+response.status+')');return data;
}
export function run(command,args,{cwd=root,env=process.env,input,capture=true}={}){
  return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk;if(output.length>2*1024*1024)output=output.slice(-2*1024*1024);});child.stderr.resume();child.on('error',()=>reject(Error('Unable to start '+command)));child.on('close',code=>code===0?resolve(capture?output:''):reject(Error('Command failed: '+command+' (exit '+code+')')));child.stdin.end(input);});
}
export async function verify(url,env,{attempts=24,delay=5000}={}){
  let consecutive=0;
  for(let i=0;i<attempts;i++){
    let healthy=false;
    try {const response=await fetch(url+'/'+env.ADMIN_PATH+'/api/overview',{headers:{Authorization:'Bearer '+env.ADMIN_TOKEN,'Cache-Control':'no-cache'},signal:AbortSignal.timeout(8000)});if(response.ok&&(await response.json()).ok){const blank=await fetch(url+'/',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(8000)});healthy=blank.status===404&&(await blank.text())==='';}}catch{}
    consecutive=healthy?consecutive+1:0;
    if(consecutive>=3)return {verified:true};
    if(i+1<attempts)await new Promise(resolve=>setTimeout(resolve,delay));
  }
  throw Error('Deployment exists but private API/root verification failed; no healthy deployment is claimed.');
}
