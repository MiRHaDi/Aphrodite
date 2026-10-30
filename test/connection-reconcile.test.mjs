import {it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openSession} from '../installer/session.mjs';
import {deployCloudflare} from '../installer/cloudflare.mjs';
it('does not upload an unchanged connector for new local probes, passwords or management migrations',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'aphrodite-connection-test-')),values=new Map();
 const session=await openSession({path:join(directory,'state.json'),credentials:{get:async key=>values.get(key)??null,set:async(key,value)=>values.set(key,value)}});
 let existing=false,bindings=[],uploads=0;
 const fetcher=vi.fn(async(input,init={})=>{
  const url=String(input),path=new URL(url).pathname;
  if(url.includes('.workers.dev'))return path==='/'?new Response(null,{status:404}):Response.json({ok:true});
  if(path.endsWith('/workers/subdomain'))return Response.json({result:{subdomain:'fixture'}});
  if(path.endsWith('/settings'))return Response.json({result:{bindings}});
  if(init.method==='PUT'){uploads++;existing=true;bindings=JSON.parse(init.body.get('metadata')).bindings;return Response.json({success:true});}
  if(path.endsWith('/subdomain'))return Response.json({success:true});
  return existing?Response.json({result:{}}):new Response(null,{status:404});
 });vi.stubGlobal('fetch',fetcher);
 try{
  const env={DEPLOYMENT_ROLE:'connection',NATIVE_ENABLED:'true',EDGE_CONTROL_URL:'https://control.example.com/private',EDGE_CONTROL_TOKEN:'fixture-shared-control-token-32-characters',EDGE_PROBE_PATH:'original-probe'},options={provider:'workers',account:'a'.repeat(32),name:'fixture-connection',token:'fake-token',session,readiness:{attempts:1,delay:0,requiredConsecutive:1}},artifact={directory,code:'export default {fetch(){return new Response()}}'};
  await deployCloudflare(options,{...env},artifact);const marker=fetcher.mock.calls.length;
  const result=await deployCloudflare({...options,adminPasswordHash:'fixture-password-hash'},{...env,EDGE_PROBE_PATH:'new-unneeded-local-probe'},{...artifact,directory:join(directory,'no-migrations-needed')});
  expect(result.unchanged).toBe(true);expect(uploads).toBe(1);
  expect(fetcher.mock.calls.slice(marker).filter(([url])=>String(url).includes('api.cloudflare.com')).every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
  expect(bindings.some(binding=>['DB','ADMIN_TOKEN','ADMIN_PASSWORD_HASH'].includes(binding.name))).toBe(false);
 }finally{vi.unstubAllGlobals();await rm(directory,{recursive:true,force:true});}
});
