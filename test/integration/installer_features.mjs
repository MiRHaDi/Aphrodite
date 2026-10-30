import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildArtifact,root} from '../../installer/build.mjs';
import {passwordHash} from '../../installer/password.mjs';
const artifact=await buildArtifact('node'),directory=await mkdtemp(join(tmpdir(),'aphrodite-features-'));
let service;
try{
 const module=await import(pathToFileURL(join(artifact.directory,artifact.filename)).href);
 const env={ADMIN_PATH:'fixture-private-management',ADMIN_TOKEN:'fixture-preserved-random-admin-token',ADMIN_PASSWORD_HASH:passwordHash('fixture-chosen-password'),NATIVE_ENABLED:'true',PUBLIC_EDGE_HOST:'control.example.test',SUBSCRIPTION_DOMAIN:'example.test',SUBSCRIPTION_ID_MODE:'username',WILDCARD_GATEWAY_TOKEN:'fixture-gateway-secret'};
 service=await module.start({port:0,env:{...env,DATABASE_PATH:join(directory,'database.sqlite')},migrations:join(root,'migrations')});
 const origin='http://127.0.0.1:'+service.address.port;
 const login=await fetch(origin+'/'+env.ADMIN_PATH+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({credential:'fixture-chosen-password'})});assert.equal(login.status,200);
 const session=await login.json(),headers={authorization:'Bearer '+session.token,'content-type':'application/json'};
 const api=async(path,body)=>{const response=await fetch(origin+'/'+env.ADMIN_PATH+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});assert.equal(response.ok,true);return response.json();};
 const user=await api('/api/users',{username:'fixture-user',days:2,dataGb:1});assert.match(user.subscriptionPath,/^\/[a-f0-9]{64}\/fixture-user$/);assert.match(user.subscriptionUrl,/^https:\/\/fixture-user.example.test\//);
 const account=await api('/api/native/users/fixture-user'),key=user.subscriptionPath.split('/')[1];
 for(const suffix of ['', '/fixture-user','/'+account.uuid]){
  const response=await fetch(origin+'/'+key+suffix+'?format=raw');assert.equal(response.status,200);assert.match(await response.text(),/vless:/);
 }
 for(const label of ['fixture-user',account.uuid]){
  const response=await fetch(origin+'/'+key,{headers:{'x-aphrodite-original-host':label+'.example.test','x-aphrodite-gateway-token':env.WILDCARD_GATEWAY_TOKEN}});assert.equal(response.status,200);
 }
 assert.equal((await fetch(origin+'/'+key,{headers:{'x-aphrodite-original-host':'other-user.example.test','x-aphrodite-gateway-token':env.WILDCARD_GATEWAY_TOKEN}})).status,404);
 service.env.SUBSCRIPTION_ID_MODE='uuid';const again=await api('/api/native/users/fixture-user');assert.equal(again.uuid,account.uuid);assert.equal(again.subscription_key,account.subscription_key);assert.equal(again.expires_at,account.expires_at);assert.equal(again.settings.dataLimitBytes,account.settings.dataLimitBytes);assert.equal(again.subscriptionPath,'/'+key+'/'+account.uuid);
 const recovery=await fetch(origin+'/'+env.ADMIN_PATH+'/api/overview',{headers:{authorization:'Bearer '+env.ADMIN_TOKEN}});assert.equal(recovery.status,200);
 console.log('PASS installer features: selected password and preserved token, private session, username/UUID/old subscription links, per-user hosts, identity/quota/expiry preservation. Synthetic local database only.');
}finally{if(service)await service.close();await rm(directory,{recursive:true,force:true});}
