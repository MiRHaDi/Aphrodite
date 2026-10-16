import {buildArtifact,root} from '../../installer/build.mjs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import WS from 'ws';
import assert from 'node:assert/strict';
const platform=process.argv[2]||'node',artifact=await buildArtifact(platform);
const env={ADMIN_PATH:'local-private-management',ADMIN_TOKEN:'local-only-not-a-real-secret-token',NATIVE_ENABLED:'true',CONTROL_PLANE_ORIGIN:'',PUBLIC_EDGE_HOST:'example.test'};
let service,mf,directory,dispatch,websocket;
try{
 if(platform==='node'){
  directory=await mkdtemp(join(tmpdir(),'aphrodite-artifact-'));
  const module=await import(pathToFileURL(join(artifact.directory,artifact.filename)).href);
  service=await module.start({port:0,env:{...env,DATABASE_PATH:join(directory,'db.sqlite')},migrations:join(root,'migrations')});
  const origin='http://127.0.0.1:'+service.address.port;
  dispatch=(path,options)=>fetch(origin+path,options);
  websocket=async()=>{const socket=new WS(origin.replace('http','ws')+'/edge/native');await once(socket,'open');return socket;};
 }else{
  const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
  const legacy={name:'artifact-test',modules:true,script:artifact.code,compatibilityDate:'2026-10-03',bindings:env,d1Databases:{DB:'artifact-test'}};
  mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(legacy):legacy);
  const database=await mf.getD1Database('DB');
  for(const filename of (await readdir(join(root,'migrations'))).filter(n=>n.endsWith('.sql')).sort())for(const query of (await readFile(join(root,'migrations',filename),'utf8')).replace(/^\s*--.*$/gm,'').split(';').filter(s=>s.trim()))await database.prepare(query).run();
  dispatch=(path,options)=>mf.dispatchFetch('http://example.test'+path,options);
  websocket=async()=>{const response=await dispatch('/edge/native',{headers:{Upgrade:'websocket'}});assert.equal(response.status,101);response.webSocket.accept();return response.webSocket;};
 }
 const api=async(path,body)=>{const response=await dispatch('/'+env.ADMIN_PATH+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});assert.equal(response.ok,true);return response.json();};
 for(const path of ['/','/feed','/panel','/healthz','/api/users']){const response=await dispatch(path);assert.equal(response.status,404);assert.equal(await response.text(),'');}
 const page=await dispatch('/'+env.ADMIN_PATH);assert.equal(page.status,200);for(const script of (await page.text()).matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(script[1]);
 const created=await api('/api/users',{username:'artifact-test',days:1,dataGb:1,settings:{dataLimitBytes:1024,maxConnections:1}});
 assert.match(created.subscriptionPath,/^\/[a-f0-9]{64}$/);assert.equal((await dispatch('/feed/artifact-test')).status,404);
 for(const format of ['raw','base64','clash','xray'])assert.equal((await dispatch(created.subscriptionPath+'?format='+format)).status,200);
 const account=await api('/api/native/users/artifact-test'),socket=await websocket();
 const reply=new Promise(resolve=>socket.addEventListener('message',event=>resolve(Buffer.from(event.data)),{once:true}));
 socket.send(Buffer.from([0,...Buffer.from(account.uuid.replaceAll('-',''),'hex'),0,2,0,53,1,1,1,1,1]));assert.deepEqual(await reply,Buffer.from([0,0]));
 assert.equal((await api('/api/native/users/artifact-test/status')).usedBytes,1024);socket.close();await new Promise(r=>setTimeout(r,150));assert.equal((await api('/api/native/users/artifact-test/status')).usedBytes,0);
 console.log('PASS minified '+platform+' artifact: private UI syntax, account creation, opaque feed, four formats, authenticated WS and quota/refund');
}finally{if(service)await service.close();if(mf)await mf.dispose();if(directory)await rm(directory,{recursive:true,force:true});}
