import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildWorkingBaseline,rebuildWorkingReference} from '../../installer/working-baseline.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const original=await rebuildWorkingReference();
const candidate=await buildWorkingBaseline();
const admin='local-baseline-management',token='local-test-admin-token-with-32-characters';
const uuid='be919519-e2e8-4a81-8987-e9ff05015ae1',key='a'.repeat(64),expiry=2100000000;
const workers=[['reference',original],['candidate',candidate.code]].map(([name,script])=>({name,script,modules:true,compatibilityDate:'2026-10-03',d1Databases:{DB:'baseline-'+name},bindings:{ADMIN_PATH:admin,ADMIN_TOKEN:token,NATIVE_ENABLED:'true',CONTROL_PLANE_ORIGIN:'',PUBLIC_EDGE_HOST:'baseline.example'}}));
const config={workers};
const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config);
const sockets=[];
try{
  const results=[];
  for(const {name} of workers){
    const db=await mf.getD1Database('DB',name),worker=await mf.getWorker(name);
    for(const file of (await readdir(root+'migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(root+'migrations/'+file,'utf8')).replace(/^\s*--.*$/gm,'').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
    await db.prepare('INSERT INTO native_accounts(username,uuid,subscription_key,expires_at,settings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind('existing-user',uuid,key,expiry,JSON.stringify({dataLimitBytes:107374182400,ports:[443,8443,2096]}),1792000000,1792000000).run();
    await db.prepare('INSERT INTO subscription_keys(username,token,legacy_allowed) VALUES(?,?,1)').bind('existing-user',key).run();
    await db.prepare('INSERT INTO native_usage(username,used,lifetime,requests,volume_reset,request_reset) VALUES(?,?,?,?,?,?)').bind('existing-user',12567,30000,17,1792000000000,1792000000000).run();
    const fetch=(path,options)=>worker.fetch('https://baseline.example'+path,options);
    const api=async(path)=>{const r=await fetch('/'+admin+'/api/'+path,{headers:{authorization:'Bearer '+token}});assert.equal(r.status,200);return r.json()};
    for(const path of ['/','/panel','/api/users','/feed/existing-user?token=incorrect'])assert.equal((await fetch(path)).status,404);
    assert.equal((await fetch('/'+admin+'/api/users')).status,401);
    const panel=await fetch('/'+admin),html=await panel.text();assert.equal(panel.status,200);
    if(name==='candidate')await writeFile(candidate.directory+'/panel.html',html);
    for(const language of ['en','fa','zh','ru','ar'])assert.ok(html.includes('value="'+language+'"'),'Missing language '+language);
    assert.ok(html.includes('nativeSettingsForm')&&html.includes('nativeBackup'),'Account settings and backup controls must remain available');
    const before=await api('native/users/existing-user');
    const feed=await fetch('/'+key,{headers:{'User-Agent':'Happ/1.0'}});assert.equal(feed.status,200);
    const body=await feed.text(),headers=feed.headers.get('subscription-userinfo');
    const links=Buffer.from(body.trim(),'base64').toString().split('\n');assert.equal(links.length,3);
    for(const link of links){const u=new URL(link);assert.equal(u.username,uuid);assert.equal(u.hostname,'baseline.example');assert.equal(u.searchParams.get('path'),'/edge/native');}
    const response=await fetch('/edge/native',{headers:{Upgrade:'websocket'}});assert.equal(response.status,101);
    const ws=response.webSocket;ws.accept();sockets.push(ws);
    const ack=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Authenticated protocol acknowledgement missing')),10000);ws.addEventListener('message',event=>{clearTimeout(t);resolve(Buffer.from(event.data))},{once:true})});
    ws.send(Buffer.from([0,...Buffer.from(uuid.replaceAll('-',''),'hex'),0,2,0,53,1,1,1,1,1]));
    assert.deepEqual(await ack,Buffer.from([0,0]));ws.close();
    for(let i=0;i<30;i++){const leases=await db.prepare('SELECT count(*) n FROM native_leases').first();if(!leases.n)break;await new Promise(r=>setTimeout(r,50));}
    const after=await api('native/users/existing-user'),usage=await api('native/users/existing-user/status');
    assert.deepEqual(after,before,'Identity, key, expiry and settings must not change');
    assert.equal(usage.usedBytes,12567);assert.equal(usage.requests,18);
    results.push({body,headers,identity:before,usage});
  }
  assert.deepEqual(results[1],results[0],'UI changes must not alter subscription or native accounting behavior');
  console.log('PASS verified baseline and UI candidate: exact artifact reproduction, five languages, private panel, authentication, subscriptions, existing identities, native protocol acknowledgement, quota reservation/refund and unchanged expiry. Local tests only.');
}finally{for(const ws of sockets)try{ws.close()}catch{}await mf.dispose()}
