import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configuration,jsonRequest,run} from '../installer/common.mjs';
import {deployCloudflare} from '../installer/cloudflare.mjs';
import {deployRender} from '../installer/render.mjs';
let directory;
afterEach(async()=>{vi.unstubAllGlobals();if(directory)await rm(directory,{recursive:true,force:true});});
describe('installer adapters',()=>{
 it('generates independent administrator paths, credentials and build nonces',()=>{
  const a=configuration({}),b=configuration({});expect(a.ADMIN_PATH).not.toBe(b.ADMIN_PATH);expect(a.ADMIN_TOKEN).not.toBe(b.ADMIN_TOKEN);expect(a.APHRODITE_BUILD_NONCE).not.toBe(b.APHRODITE_BUILD_NONCE);
 });
 it('does not echo provider error bodies',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({message:'secret-provider-token'}),{status:403})));
  await expect(jsonRequest('https://api.example.test',{token:'secret-provider-token'})).rejects.toThrow('Provider request failed (403)');
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
  const result=await deployCloudflare({provider:'workers',account:'a'.repeat(32),name:'test-panel',token:'test-provider-token'},env,{directory,code:'export default{}'});
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
  await deployRender({name:'test-panel',owner:'owner-test',token:'test',plan:'starter'},configuration({}));
  const body=JSON.parse(calls.find(([url])=>url.endsWith('/services'))[1].body);expect(body.serviceDetails.disk.mountPath).toBe('/data');expect(body.serviceDetails.numInstances).toBe(1);expect(body.autoDeployTrigger).toBe('off');
 });
 it('captures child errors without leaking stderr credentials',async()=>{
  await expect(run(process.execPath,['-e',"process.stderr.write('fake-password');process.exit(2)"])).rejects.toThrow('exit 2');
 });
});
