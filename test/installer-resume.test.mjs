import {afterEach,expect,it,vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSession} from '../installer/session.mjs';
import {deployCloudflare} from '../installer/cloudflare.mjs';
import {configuration} from '../installer/common.mjs';
vi.mock('../installer/common.mjs',async original=>({...await original(),run:vi.fn(async()=> '')}));
const folders=[];afterEach(async()=>{vi.unstubAllGlobals();for(const path of folders.splice(0))await rm(path,{recursive:true,force:true});});
it.each(['workers','pages'])('resumes the same %s and database after readiness failure without changing users or secrets',async provider=>{
 const folder=await mkdtemp(join(tmpdir(),'aphrodite-resume-test-'));folders.push(folder);
 const values=new Map(),credentials={get:async k=>values.get(k)??null,set:async(k,v)=>{values.set(k,v);}};
 let session=await openSession({path:join(folder,'state.json'),credentials});
 const db=new DatabaseSync(':memory:');let databaseCreations=0,existing=false,healthy=false,bindings=[],project;
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 vi.stubGlobal('fetch',vi.fn(async(input,options={})=>{
  const url=String(input),path=new URL(url).pathname;
  if(url.includes('.workers.dev')||url.includes('.pages.dev'))return path==='/'?new Response(null,{status:404}):healthy?Response.json({ok:true}):new Response('error code: 1101',{status:500});
  if(path.endsWith('/workers/subdomain'))return Response.json({success:true,result:{subdomain:'test'}});
  if(path.endsWith('/settings'))return Response.json({success:true,result:{bindings}});
  if(path.includes('/d1/database')&&options.method==='POST'&&!path.endsWith('/query')){databaseCreations++;return Response.json({success:true,result:{uuid:id}});}
  if(path.endsWith('/query')){
   const {sql}=JSON.parse(options.body);let results=[];
   if(/^\s*(SELECT|PRAGMA)/i.test(sql))results=db.prepare(sql).all();else db.exec(sql);
   return Response.json({success:true,result:[{success:true,results}]});
  }
  if(path.includes('/workers/scripts/')&&options.method==='PUT'){bindings=JSON.parse(options.body.get('metadata')).bindings;existing=true;return Response.json({success:true});}
  if(path.endsWith('/subdomain')&&options.method==='POST')return Response.json({success:true});
  if(path.endsWith('/pages/projects')&&options.method==='POST'){project=JSON.parse(options.body);existing=true;return Response.json({success:true});}
  if(path.includes('/pages/projects/')&&options.method==='PATCH'){project={...project,...JSON.parse(options.body)};return Response.json({success:true});}
  if(path.includes('/workers/scripts/')||path.includes('/pages/projects/'))return existing?Response.json({success:true,result:project||{}}):new Response(null,{status:404});
  throw Error('Unexpected mocked request');
 }));
 const env=configuration({adminPath:'preserved-private-path',adminToken:'fake-preserved-admin-secret-at-least-32'}),artifact={directory:new URL('../',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),code:'export default {}'};
 const options={provider,account:'a'.repeat(32),name:'resume-panel',token:'fake-provider-token',session,readiness:{attempts:1,delay:0}};
 try{
  await expect(deployCloudflare(options,env,artifact)).rejects.toThrow('1101');
  const key=Object.keys(session.state.services)[0];expect(session.state.services[key].database).toBe(id);
  db.exec("INSERT INTO native_accounts(username,uuid,subscription_key) VALUES('preserved','original-uuid','original-subscription-key')");
  healthy=true;session=await openSession({path:session.path,credentials});
  const result=await deployCloudflare({...options,session,readiness:{attempts:3,delay:0}},configuration({}),artifact);
  expect(result.database).toBe(id);expect(databaseCreations).toBe(1);
  expect(db.prepare("SELECT uuid,subscription_key FROM native_accounts WHERE username='preserved'").get()).toMatchObject({uuid:'original-uuid',subscription_key:'original-subscription-key'});
  const token=provider==='workers'?bindings.find(b=>b.name==='ADMIN_TOKEN').text:project.deployment_configs.production.env_vars.ADMIN_TOKEN.value;
  expect(token).toBe(env.ADMIN_TOKEN);expect(session.state.services[key].verified).toBe(true);
  const callCount=fetch.mock.calls.length;
  const unchanged=await deployCloudflare({...options,session,readiness:{attempts:1,delay:0,requiredConsecutive:1}},configuration({}),artifact);
  expect(unchanged.unchanged).toBe(true);
  expect(fetch.mock.calls.slice(callCount).every(([,init])=>!init?.method||init.method==='GET')).toBe(true);
  const previousPath=provider==='workers'?bindings.find(b=>b.name==='ADMIN_PATH').text:project.deployment_configs.production.env_vars.ADMIN_PATH.value;
  expect(previousPath).toBe(env.ADMIN_PATH);
  const changed=await deployCloudflare({...options,session,variables:{PROFILE_UPDATE_INTERVAL:'12'},readiness:{attempts:1,delay:0,requiredConsecutive:1}},configuration({}),artifact);
  expect(changed.unchanged).not.toBe(true);
  const changedInterval=provider==='workers'?bindings.find(b=>b.name==='PROFILE_UPDATE_INTERVAL').text:project.deployment_configs.production.env_vars.PROFILE_UPDATE_INTERVAL.value;
  expect(changedInterval).toBe('12');expect(databaseCreations).toBe(1);
 }finally{db.close();}
},30000);
