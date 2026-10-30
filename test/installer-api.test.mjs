import {it,expect,afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import {createInstallerServer,launchInstaller} from '../installer/api.mjs';
import {runInstallation} from '../installer/runner.mjs';
import {validateRequest} from '../installer/options.mjs';
const servers=[];afterEach(async()=>{for(const server of servers.splice(0))await new Promise(resolve=>server.close(resolve));});
const token='fixture-local-api-token-with-32-characters';
async function api(options){const server=createInstallerServer({token,...options});servers.push(server);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
const headers={authorization:'Bearer '+token,'content-type':'application/json'};
it('validates a typed automation schema and rejects executable environment injection',()=>{
 expect(validateRequest({options:{provider:'pages','domain-conflict':'reuse'},environment:{ADMIN_TOKEN:'fixture'}}).options.provider).toBe('pages');
 for(const body of [{options:{provider:1}},{options:{unexpected:true}},{options:{'domain-conflict':'overwrite-everything'}},{options:{},environment:{NODE_OPTIONS:'--import bad'}}])expect(()=>validateRequest(body)).toThrow();
});
it('shares the deployment path, preserves a saved session and redacts errors',async()=>{
 const session={state:{},save:async()=>{}};const calls=[];
 const prepare=async(values,ui,context)=>{expect(context.interactive).toBe(false);return {provider:'pages',topology:'standalone',options:{name:'fixture',token:'fake-provider-secret'},env:{ADMIN_PATH:'fake-private-path',ADMIN_TOKEN:'fake-admin-secret'},session};};
 const options={prepare,build:async()=>({directory:'fixture',manifest:{buildId:'fixture-build'}}),deployers:{pages:async()=>{calls.push('deploy');return {url:'https://fixture.example'};}}};
 const result=await runInstallation({provider:'pages'},options);
 expect(calls).toEqual(['deploy']);expect(result.transportVerified).toBe(false);expect(result.credentials).toBeUndefined();expect(session.state.status).toBe('verified');
 const withCredentials=await runInstallation({provider:'pages','include-credentials':true},options);expect(withCredentials.credentials.administratorPath).toBe('fake-private-path');
 await expect(runInstallation({provider:'pages'},{...options,deployers:{pages:async()=>{throw Error('fake-provider-secret fake-admin-secret 8000119');}}})).rejects.toMatchObject({code:'PROVIDER_BLOCKED',message:'[redacted] [redacted] 8000119'});
 expect(session.state.status).toBe('paused-after-error');
});
it('protects the local API and serializes/idempotently resumes job requests',async()=>{
 let finish,starts=0;
 const base=await api({launch:async(request,progress)=>{starts++;progress({type:'progress',message:'Fixture started'});return new Promise(resolve=>{finish=resolve;});}});
 expect((await fetch(base+'/v1/schema')).status).toBe(401);
 expect((await fetch(base+'/v1/schema',{headers:{...headers,origin:'https://untrusted.test'}})).status).toBe(403);
 expect((await fetch(base+'/v1/schema',{headers})).status).toBe(200);
 const body=JSON.stringify({options:{provider:'bundle',preview:true}});
 const response=await fetch(base+'/v1/jobs',{method:'POST',headers:{...headers,'idempotency-key':'fixture'},body});expect(response.status).toBe(202);const job=await response.json();
 const duplicate=await fetch(base+'/v1/jobs',{method:'POST',headers:{...headers,'idempotency-key':'fixture'},body});expect((await duplicate.json()).id).toBe(job.id);expect(starts).toBe(1);
 const busy=await fetch(base+'/v1/jobs',{method:'POST',headers,body});expect(busy.status).toBe(409);
 finish({version:1,ok:true,result:{mutations:false}});
 let done;for(let attempt=0;attempt<20;attempt++){done=await(await fetch(base+job.statusUrl,{headers})).json();if(done.status==='succeeded')break;await new Promise(resolve=>setTimeout(resolve,5));}
 expect(done.status).toBe('succeeded');expect(done.receipt.result.mutations).toBe(false);expect(done.events[0].message).toBe('Fixture started');
 const mismatch=await fetch(base+'/v1/jobs',{method:'POST',headers:{...headers,'idempotency-key':'fixture'},body:JSON.stringify({options:{provider:'pages',preview:true}})});expect(mismatch.status).toBe(409);
});
it('lists domains without launching deployment and refuses malformed requests',async()=>{
 let launches=0;
 const base=await api({launch:async()=>{launches++;},listDomains:async options=>{expect(options.token).toBe('fake-token');return [{id:'zone',name:'example.com',account:{id:'account'}}];}});
 const response=await fetch(base+'/v1/domains',{method:'POST',headers,body:JSON.stringify({token:'fake-token'})});expect(await response.json()).toMatchObject({zones:[{id:'zone',name:'example.com',account:'account'}]});expect(launches).toBe(0);
 expect((await fetch(base+'/v1/jobs',{method:'POST',headers,body:'{broken'})).status).toBe(400);
 expect((await fetch(base+'/v1/jobs',{method:'POST',headers,body:JSON.stringify({options:{unexpected:true}})})).status).toBe(400);
});
it('runs the real CLI preview in an isolated process with one JSON receipt',async()=>{
 const events=[];const receipt=await launchInstaller({options:{provider:'workers',name:'api-preview',preview:true,'no-save':true},environment:{}},event=>events.push(event));
 expect(receipt.ok).toBe(true);expect(receipt.result.mutations).toBe(false);expect(receipt.result.topology).toBe('split');expect(events.some(event=>event.message.includes('Artifact ready'))).toBe(true);
 const child=spawnSync(process.execPath,['installer/cli.mjs','--json','--non-interactive','--config','-'],{input:JSON.stringify({options:{provider:'workers',name:'invalid name','no-save':true}}),windowsHide:true,encoding:'utf8',timeout:10000});
 expect(child.status).not.toBe(0);const failure=JSON.parse(child.stdout);expect(failure.ok).toBe(false);expect(failure.error.message).toContain('Invalid deployment name');expect(child.stdout).not.toContain(' at ');
 const missingToken=spawnSync(process.execPath,['installer/cli.mjs','--json','--non-interactive','--provider','workers','--no-save'],{windowsHide:true,encoding:'utf8',timeout:10000,env:{...process.env,CLOUDFLARE_API_TOKEN:''}});
 expect(missingToken.status).not.toBe(0);expect(JSON.parse(missingToken.stdout).error.message).toContain('Provider token is required');
},30000);
it('completes an HTTP preview through the real background CLI',async()=>{
 const base=await api();
 const response=await fetch(base+'/v1/jobs',{method:'POST',headers,body:JSON.stringify({options:{provider:'workers',name:'http-api-preview',preview:true,'no-save':true}})});
 expect(response.status).toBe(202);const job=await response.json();
 let status;
 for(let attempt=0;attempt<200;attempt++){
  status=await(await fetch(base+job.statusUrl,{headers})).json();if(status.status!=='running')break;
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 expect(status.status).toBe('succeeded');expect(status.receipt.result.mutations).toBe(false);expect(status.receipt.result.artifacts).toHaveLength(2);
},30000);
