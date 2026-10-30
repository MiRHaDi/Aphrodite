import assert from 'node:assert/strict';
import {buildArtifact,root} from '../../installer/build.mjs';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const data=await buildArtifact('workers',{role:'database'}),management=await buildArtifact('workers',{role:'management'}),connection=await buildArtifact('workers',{role:'connection'});
const dataKeys=['fixture-data-server-one-token-32-characters','fixture-data-server-two-token-32-characters'];
const edgeKeys=['fixture-edge-server-one-token-32-characters','fixture-edge-server-two-token-32-characters'];
const admin='fixture-administrator-token-32-characters',prefix='/private-cluster-management';
const worker=(name,code,bindings,extra={})=>({name,modules:true,script:code,compatibilityDate:'2026-10-03',bindings,...extra});
const database=worker('database',data.code,{DATA_CONTROL_PATH:'private-cluster-database',DATA_CONTROL_TOKENS_JSON:JSON.stringify(dataKeys)},{d1Databases:{DB:'cluster-test'}});
const managers=[0,1].map(i=>worker('manager'+i,management.code,{DEPLOYMENT_ROLE:'management',ADMIN_TOKEN:admin,ADMIN_PATH:prefix.slice(1),NATIVE_ENABLED:'true',CONTROL_PLANE_ORIGIN:'',DATA_CONTROL_URL:'https://database.example/private-cluster-database',DATA_CONTROL_TOKEN:dataKeys[i],EDGE_CONTROL_PATH:'private-cluster-edge',EDGE_CONTROL_TOKENS_JSON:JSON.stringify(edgeKeys),CONNECTION_ENDPOINTS_JSON:JSON.stringify([{address:'edge0.example',host:'edge0.example',sni:'edge0.example'},{address:'edge1.example',host:'edge1.example',sni:'edge1.example'}])},{serviceBindings:{DATA_CONTROL_SERVICE:'database'}}));
const edges=[0,1].map(i=>worker('edge'+i,connection.code,{DEPLOYMENT_ROLE:'connection',EDGE_CONTROL_URL:'https://manager.example/private-cluster-edge',EDGE_CONTROL_TOKEN:edgeKeys[i],EDGE_PROBE_PATH:'private-probe-cluster'},{serviceBindings:{EDGE_CONTROL_SERVICE:'manager'+i}}));
const options={workers:[database,...managers,...edges]},mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
let portable;
try{
 const db=await mf.getD1Database('DB','database');
 for(const file of (await readdir(join(root,'migrations'))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(join(root,'migrations',file),'utf8')).replace(/^\s*--.*$/gm,'').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 const controls=await Promise.all([mf.getWorker('manager0'),mf.getWorker('manager1')]);
 const api=async(i,path,body)=>{const r=await controls[i].fetch('https://manager.example'+prefix+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+admin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,path);return r.json()};
 const created=await api(0,'/api/users',{username:'cluster-user',days:30,dataGb:1,settings:{dataLimitBytes:1024,maxConnections:1}});
 const first=await api(0,'/api/native/users/cluster-user'),second=await api(1,'/api/native/users/cluster-user');
 assert.equal(first.uuid,second.uuid);assert.equal(first.subscription_key,second.subscription_key);assert.equal(first.expires_at,second.expires_at);
 for(const control of controls){const sub=await control.fetch('https://manager.example'+created.subscriptionPath+'?format=raw');assert.equal(sub.status,200);const text=await sub.text();assert.ok(text.includes('edge0.example')&&text.includes('edge1.example'))}
 const rpc=(i,action,extra,key=edgeKeys[i])=>controls[i].fetch('https://manager.example/private-cluster-edge',{method:'POST',headers:{authorization:'Bearer '+key},body:JSON.stringify({action,uuid:first.uuid,extra})});
 assert.equal((await rpc(0,'identity',{},dataKeys[0])).status,404);
 assert.equal((await rpc(1,'identity',{},'wrong')).status,404);
 const opened=await rpc(0,'/open',{lease:'cluster-reservation-one',ip:'192.0.2.1'});assert.equal(opened.status,200);
 assert.equal((await api(1,'/api/native/users/cluster-user/status')).usedBytes,1024);
 const denied=await rpc(1,'/open',{lease:'cluster-reservation-two',ip:'192.0.2.2'});assert.ok(denied.status>=400);
 assert.equal((await rpc(1,'/close',{lease:'cluster-reservation-one',ip:'192.0.2.1',consumed:0})).status,200);
 assert.equal((await api(0,'/api/native/users/cluster-user/status')).usedBytes,0);
 for(let i=0;i<2;i++){const edge=await mf.getWorker('edge'+i);assert.equal((await edge.fetch('https://edge.example/private-probe-cluster',{method:'POST',headers:{authorization:'Bearer '+edgeKeys[i]}})).status,200)}
 const d=await mf.getWorker('database');
 assert.equal((await d.fetch('https://database.example/private-cluster-database',{method:'POST',headers:{authorization:'Bearer '+edgeKeys[0]},body:JSON.stringify({statements:[{sql:'DELETE FROM native_accounts',params:[]}]})})).status,404);
 const transaction=await d.fetch('https://database.example/private-cluster-database',{method:'POST',headers:{authorization:'Bearer '+dataKeys[0]},body:JSON.stringify({statements:[{sql:'DELETE FROM native_accounts WHERE username=?',params:['cluster-user']},{sql:'SELECT * FROM nonexistent_cluster_table',params:[]}]})});assert.equal(transaction.status,503);
 assert.equal((await api(1,'/api/native/users/cluster-user')).uuid,first.uuid,'Failed batch must roll back');
 assert.equal((await d.fetch('https://database.example/')).status,404);
 const node=await buildArtifact('node',{role:'management'}),{start}=await import(pathToFileURL(join(node.directory,node.filename)).href);
 portable=await start({port:0,env:{DEPLOYMENT_ROLE:'management',ADMIN_TOKEN:admin,ADMIN_PATH:prefix.slice(1),NATIVE_ENABLED:'true',DATA_CONTROL_URL:'https://database.example/private-cluster-database',DATA_CONTROL_TOKEN:dataKeys[1],DATA_CONTROL_SERVICE:{fetch:(url,init)=>d.fetch(url,init)},BIND_ADDRESS:'127.0.0.1'}});
 const nodeAccount=await fetch('http://127.0.0.1:'+portable.address.port+prefix+'/api/native/users/cluster-user',{headers:{authorization:'Bearer '+admin}});assert.equal(nodeAccount.status,200);assert.equal((await nodeAccount.json()).uuid,first.uuid);
 assert.equal(portable.env.DB,undefined,'Remote Node manager must not open a second local database');
 console.log('PASS cluster: one isolated D1 data worker, two DB-free managers, two connection workers, independent tokens, shared identity/subscription/quota, cross-manager refund, denied privilege escalation and atomic rollback');
}finally{await portable?.close();await mf.dispose()}
