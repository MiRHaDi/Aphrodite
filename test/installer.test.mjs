import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configuration,jsonRequest,run,verify} from '../installer/common.mjs';
import {deployCloudflare} from '../installer/cloudflare.mjs';
import {deployRender} from '../installer/render.mjs';
let directory;
afterEach(async()=>{vi.unstubAllGlobals();if(directory)await rm(directory,{recursive:true,force:true});});
describe('installer adapters',()=>{
 it('refuses an out-of-zone custom hostname before creating or uploading resources',async()=>{
  const fetcher=vi.fn(async()=>new Response(null,{status:404}));vi.stubGlobal('fetch',fetcher);
  await expect(deployCloudflare({provider:'pages',account:'a'.repeat(32),name:'fixture',token:'fake',domain:'example-2.com',zone:'zone',zoneName:'example.com'},configuration({}),{})).rejects.toThrow('outside the selected DNS domain');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('stops immediately on a Cloudflare runtime exception instead of repeating health checks',async()=>{
  const fetcher=vi.fn(async()=>new Response('error code: 1101',{status:500}));vi.stubGlobal('fetch',fetcher);
  await expect(verify('https://test.example',configuration({}),{attempts:24,delay:0})).rejects.toThrow('1101');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('reports a provider block without exposing CLI secrets',async()=>{
  try{await run(process.execPath,['-e',"process.stderr.write('fake-password code: 8000119');process.exit(1)"]);throw Error('Expected failure');}catch(error){expect(error.message).toContain('8000119');expect(error.message).not.toContain('fake-password');}
 });
 it('reports a structured provider block without exposing its response body',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:false,errors:[{code:8000119,message:'private-value'}]},{status:400})));
  await expect(jsonRequest('https://api.example.test')).rejects.toThrow('8000119');
 });
 it('does not certify transient success followed by a failing worker',async()=>{
  let checks=0;
  vi.stubGlobal('fetch',vi.fn(async url=>String(url).includes('/api/overview')?Response.json({ok:++checks===1}):new Response(null,{status:404})));
  await expect(verify('https://test.example',configuration({}),{attempts:3,delay:0})).rejects.toThrow('verification failed');
 });
 it('reports missing Pages access before provisioning resources',async()=>{
  const fetcher=vi.fn(async()=>new Response(null,{status:403}));vi.stubGlobal('fetch',fetcher);
  await expect(deployCloudflare({provider:'pages',account:'a'.repeat(32),name:'test-pages',token:'test'},configuration({}),{})).rejects.toThrow('lacks access to Pages');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('generates independent administrator paths, credentials and build nonces',()=>{
  const a=configuration({}),b=configuration({});expect(a.ADMIN_PATH).not.toBe(b.ADMIN_PATH);expect(a.ADMIN_TOKEN).not.toBe(b.ADMIN_TOKEN);expect(a.APHRODITE_BUILD_NONCE).not.toBe(b.APHRODITE_BUILD_NONCE);
 });
 it('does not echo provider error bodies',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({message:'secret-provider-token'}),{status:403})));
  await expect(jsonRequest('https://api.example.test',{token:'secret-provider-token'})).rejects.toThrow('HTTP 403');
 });
 it('provisions D1 and uploads secret bindings separately from program code',async()=>{
  directory=await mkdtemp(join(tmpdir(),'aphrodite-installer-'));await mkdir(join(directory,'migrations'));await writeFile(join(directory,'migrations/0001.sql'),'SELECT 1;');
  const env=configuration({}),calls=[];
  vi.stubGlobal('fetch',vi.fn(async(url,options={})=>{url=String(url);calls.push([url,options]);
    if(url.endsWith('/workers/scripts/test-panel')&&options.method!=='PUT')return new Response(null,{status:404});
    if(url.endsWith('/workers/subdomain'))return Response.json({success:true,result:{subdomain:'test-account'}});
    if(url.endsWith('/d1/database'))return Response.json({success:true,result:{uuid:'db-test'}});
    if(url.includes('/api/overview'))return Response.json({ok:true});
    if(url==='https://test-panel.test-account.workers.dev/')return new Response(null,{status:404});
    return Response.json({success:true,result:{}});
  }));
  const result=await deployCloudflare({provider:'workers',account:'a'.repeat(32),name:'test-panel',token:'test-provider-token',readiness:{delay:0}},env,{directory,code:'export default{}'});
  expect(result.url).toBe('https://test-panel.test-account.workers.dev');
  const upload=calls.find(([url,options])=>url.endsWith('/workers/scripts/test-panel')&&options.method==='PUT')[1];
  const metadata=JSON.parse(upload.body.get('metadata'));expect(metadata.bindings.find(b=>b.name==='ADMIN_TOKEN').type).toBe('secret_text');expect(await upload.body.get('worker.mjs').text()).not.toContain(env.ADMIN_TOKEN);
  expect(env.PUBLIC_EDGE_HOST).toBe('test-panel.test-account.workers.dev');
 });
 it('refuses existing Cloudflare deployments before creating a database',async()=>{
  const fetcher=vi.fn(async()=>Response.json({success:true}));vi.stubGlobal('fetch',fetcher);
  await expect(deployCloudflare({provider:'workers',account:'a'.repeat(32),name:'test-panel',token:'test'},configuration({}),{})).rejects.toThrow('already exists');expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('requests a persistent Render disk and waits for private readiness',async()=>{
  const calls=[];vi.stubGlobal('fetch',vi.fn(async(url,options={})=>{url=String(url);calls.push([url,options]);
    if(url.includes('/services?'))return Response.json([]);
    if(url.endsWith('/services'))return Response.json({service:{id:'srv-test',serviceDetails:{url:'https://test.onrender.com'}},deployId:'dep-test'});
    if(url.includes('/api/overview'))return Response.json({ok:true});
    return new Response(null,{status:404});
  }));
  await deployRender({name:'test-panel',owner:'owner-test',token:'test',plan:'starter',readiness:{delay:0}},configuration({}));
  const body=JSON.parse(calls.find(([url])=>url.endsWith('/services'))[1].body);expect(body.serviceDetails.disk.mountPath).toBe('/data');expect(body.serviceDetails.numInstances).toBe(1);expect(body.autoDeployTrigger).toBe('off');
 });
 it('captures child errors without leaking stderr credentials',async()=>{
  await expect(run(process.execPath,['-e',"process.stderr.write('fake-password');process.exit(2)"])).rejects.toThrow('exit 2');
 });
});
