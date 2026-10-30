import {activity,report,status,requestLabel} from './progress.mjs';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deploymentFetch} from './network.mjs';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const required=(value,name)=>{if(!value)throw Error('Missing '+name);return value;};
export function name(value){if(!/^[a-z][a-z0-9-]{2,48}$/.test(value))throw Error('Invalid deployment name');return value;}
export function configuration(options){
  const adminPath=options.adminPath||randomUUID(),adminToken=options.adminToken||randomBytes(32).toString('base64url');
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(adminPath)||adminToken.length<24)throw Error('Invalid administrator path or token');
  return {ADMIN_PATH:adminPath,ADMIN_TOKEN:adminToken,APHRODITE_BUILD_NONCE:randomBytes(16).toString('hex'),NATIVE_ENABLED:'true',CONTROL_PLANE_ORIGIN:options.origin||'',PUBLIC_EDGE_HOST:options.domain||'',PORT:'8080',DATA_DIR:'/data',...options.variables};
}
export async function jsonRequest(url,{token,body,method='GET',headers={},label=requestLabel(url,method)}={}){
  return activity(label,async()=>{
  const response=await fetch(url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  report(label+' | HTTP '+response.status,response.ok?'info':'error');
  const data=await response.json().catch(()=>null);if(data?.errors?.some(error=>Number(error.code)===8000119))throw Error('Cloudflare blocked this Pages project (8000119); request provider review before deploying again.');if(!response.ok||data?.success===false||data?.errors?.length||data?.result?.some?.(item=>item.success===false))throw Error(label+' failed (HTTP '+response.status+'). Check provider permissions, account limits and service status');return data;
  });
}
export function run(command,args,{cwd=root,env=process.env,input,capture=true,label='Run deployment tool'}={}){
  return activity(label,()=>new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});report(label+' | process started');let output='',diagnostic='';child.stdout.on('data',chunk=>{output+=chunk;if(output.length>2*1024*1024)output=output.slice(-2*1024*1024);});child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-65536);});child.on('error',()=>reject(Error('Unable to start '+command)));child.on('close',code=>{report(label+' | exit code '+code,code===0?'info':'error');code===0?resolve(capture?output:''):reject(Error(/8000119/.test(diagnostic+output)?'Cloudflare blocked this Pages project (8000119); request provider review before deploying again.':'Command failed: '+command+' (exit '+code+')'));});child.stdin.end(input);}));
}
export async function verify(url,env,{attempts=24,delay=5000,requiredConsecutive=3}={}){
  return activity('Verify service readiness',async()=>{
  let consecutive=0;
  for(let i=0;i<attempts;i++){

    let healthy=false;
    try {
      const connection=env.DEPLOYMENT_ROLE==='connection';
      const response=await deploymentFetch(url+(connection?'/'+env.EDGE_PROBE_PATH:'/'+env.ADMIN_PATH+'/api/overview'),{method:connection?'POST':'GET',headers:{Authorization:'Bearer '+(connection?env.EDGE_CONTROL_TOKEN:env.ADMIN_TOKEN),'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
      status('health-http@'+url,(connection?'Connection probe':'Management API')+' | HTTP '+response.status,response.ok?'info':'waiting');
      if(!response.ok){
        const diagnostic=(await response.text()).slice(0,8192);
        const code=diagnostic.match(/\b(1101|1102|1027|1010)\b/)?.[1];
        if(code){
          const explanations={1101:'Worker runtime exception; inspect Cloudflare Workers Logs before retrying',1102:'Worker CPU limit exceeded; inspect the runtime workload',1027:'Cloudflare account request limit reached; wait for reset or review the account plan',1010:'Cloudflare rejected the request; review the account security rules'};
          const failure=Error('Cloudflare '+code+': '+explanations[code]+'. Existing resources and users are preserved.');failure.code='DEPLOYMENT_DIAGNOSTIC';throw failure;
        }
        if(!connection&&i===0&&(response.status===404||response.status>=500)){
          let healthCode;
          try{const probe=await deploymentFetch(url+'/'+env.ADMIN_PATH+'/api/deployment/health',{headers:{Authorization:'Bearer '+env.ADMIN_TOKEN},signal:AbortSignal.timeout(10000)});healthCode=(await probe.json()).code;}catch{}
          const diagnoses={DATABASE_BINDING_MISSING:'Restore the DB binding to the saved D1 database',DATABASE_SCHEMA_INCOMPLETE:'Resume the saved database migrations; do not replace D1',DATABASE_UNAVAILABLE:'Check the existing D1 binding and Cloudflare account limits'};
          if(diagnoses[healthCode]){const failure=Error(healthCode+': '+diagnoses[healthCode]+'. Existing resources are preserved.');failure.code='DEPLOYMENT_DIAGNOSTIC';throw failure;}
        }
      }
      if(response.ok&&(await response.json()).ok){
        const blank=await deploymentFetch(url+'/',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
        const empty=(await blank.text())==='';
        status('health-root@'+url,'Public root | HTTP '+blank.status+' | empty body: '+empty);
        healthy=blank.status===404&&empty;
      }
    }catch(error){if(error.code==='DEPLOYMENT_DIAGNOSTIC')throw error;status('health-error@'+url,'Health request failed or timed out; retrying','waiting');}
    consecutive=healthy?consecutive+1:0;
    status('health-count@'+url,'Healthy checks: '+consecutive+'/'+requiredConsecutive,healthy?'done':'waiting');
    if(consecutive>=requiredConsecutive)return {verified:true};
    if(i+1<attempts){await new Promise(resolve=>setTimeout(resolve,delay));}
  }
  throw Error('Service verification failed: the uploaded service is not healthy. Saved resources are preserved. Resume this installation to retry or repair its bindings and database; check Cloudflare runtime logs for repeated HTTP 500.');
  });
}
