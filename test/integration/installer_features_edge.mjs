import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {buildArtifact,root} from '../../installer/build.mjs';
import {passwordHash} from '../../installer/password.mjs';
const artifact=await buildArtifact('workers',{role:'management'});
const env={ADMIN_PATH:'fixture-private-management',ADMIN_TOKEN:'fixture-preserved-random-admin-token',ADMIN_PASSWORD_HASH:passwordHash('fixture-chosen-password'),NATIVE_ENABLED:'true',CONTROL_PLANE_ORIGIN:'',PUBLIC_EDGE_HOST:'control.example.test',SUBSCRIPTION_DOMAIN:'example.test',SUBSCRIPTION_ID_MODE:'uuid',WILDCARD_GATEWAY_TOKEN:'fixture-gateway-secret'};
const config={name:'feature-test',modules:true,script:artifact.code,compatibilityDate:'2026-10-03',bindings:env,d1Databases:{DB:'feature-test'}};
const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(config):config);
try{
 const DB=await mf.getD1Database('DB');
 for(const file of (await readdir(join(root,'migrations'))).filter(file=>file.endsWith('.sql')).sort())for(const query of (await readFile(join(root,'migrations',file),'utf8')).replace(/^\s*--.*$/gm,'').split(';').filter(query=>query.trim()))await DB.prepare(query).run();
 const dispatch=(path,init)=>mf.dispatchFetch('https://control.example.test'+path,init);
 const response=await dispatch('/'+env.ADMIN_PATH+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({credential:'fixture-chosen-password'})});assert.equal(response.status,200);
 const session=await response.json(),headers={authorization:'Bearer '+session.token,'content-type':'application/json'};
 const created=await dispatch('/'+env.ADMIN_PATH+'/api/users',{method:'POST',headers,body:JSON.stringify({username:'edge-feature-user',days:1,dataGb:1})});assert.equal(created.status,201);
 const user=await created.json();assert.match(user.subscriptionPath,/^\/[a-f0-9]{64}\/[a-f0-9-]{36}$/);
 const key=user.subscriptionPath.split('/')[1],uuid=user.subscriptionPath.split('/')[2];
 for(const path of ['/'+key,user.subscriptionPath])assert.equal((await dispatch(path+'?format=raw')).status,200);
 assert.equal((await dispatch('/'+key,{headers:{'x-aphrodite-original-host':uuid+'.example.test','x-aphrodite-gateway-token':env.WILDCARD_GATEWAY_TOKEN}})).status,200);
 assert.equal((await dispatch('/'+key,{headers:{'x-aphrodite-original-host':'different-user.example.test','x-aphrodite-gateway-token':env.WILDCARD_GATEWAY_TOKEN}})).status,404);
 assert.equal((await dispatch('/'+env.ADMIN_PATH+'/api/overview',{headers:{authorization:'Bearer '+env.ADMIN_TOKEN}})).status,200);
 console.log('PASS local workerd management: selected password PBKDF2/session, original token recovery, UUID/opaque subscription aliases and protected per-user hostname. Synthetic D1 only.');
}finally{await mf.dispose();}
