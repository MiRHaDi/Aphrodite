import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';
import WS from 'ws';
import {verify} from '../installer/common.mjs';
import {deploymentFetch as fetch,deploymentSocketOptions,closeDeploymentConnections} from '../installer/network.mjs';
const url=process.env.TEST_DEPLOYMENT_URL,env=process.env;
if(!url||new URL(url).protocol!=='https:'||!env.ADMIN_PATH||!env.ADMIN_TOKEN)throw Error('Set TEST_DEPLOYMENT_URL, ADMIN_PATH and ADMIN_TOKEN in the process environment');
const username='check-'+randomBytes(6).toString('hex');let created=false,socket;
async function api(path,body,method){
 const response=await fetch(url+'/'+env.ADMIN_PATH+path,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 assert.equal(response.ok,true,'Private API request failed');return response.json();
}
try{
 await verify(url,env,{attempts:6,delay:1000});
 const panel=await fetch(url+'/'+env.ADMIN_PATH);assert.equal(panel.status,200);const html=await panel.text();assert.ok(!html.includes(env.ADMIN_TOKEN),'Administrator token leaked into HTML');const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.ok(scripts.length);for(const script of scripts)new Function(script[1]);
 const unauthorized=await fetch(url+'/'+env.ADMIN_PATH+'/api/users');assert.equal(unauthorized.status,401);
 const account=await api('/api/users',{username,days:1,dataGb:1,settings:{dataLimitBytes:8*1024*1024,maxConnections:2}});created=true;
 assert.match(account.subscriptionPath,/^\/[a-f0-9]{64}$/);
 for(const agent of ['Happ/1.0','Hiddify/2.0','v2rayN/7.0','Clash.Meta','Stash/2.0','Shadowrocket/2.0']){
  const response=await fetch(url+account.subscriptionPath,{headers:{'User-Agent':agent},signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,'Client subscription failed');
  const body=await response.text();if(/Hiddify|v2rayN/.test(agent))JSON.parse(body);else if(/Happ|Shadowrocket/.test(agent))assert.match(Buffer.from(body,'base64').toString(),/vless:\/\//);
 }
 const identity=await api('/api/native/users/'+username);
 const users=await api('/api/users');assert.ok(users.users.some(user=>user.username===username));
 socket=new WS(url.replace(/^https:/,'wss:')+'/edge/native',{handshakeTimeout:20000,...deploymentSocketOptions(url)});await once(socket,'open');
 const host=Buffer.from('neverssl.com');const header=Buffer.concat([Buffer.from([0]),Buffer.from(identity.uuid.replaceAll('-',''),'hex'),Buffer.from([0,1,0,80,2,host.length]),host]);
 const received=new Promise((resolve,reject)=>{let data=Buffer.alloc(0);const timer=setTimeout(()=>reject(Error('Outbound TCP timeout')),20000);const stop=(error)=>{clearTimeout(timer);error?reject(error):resolve(data);};socket.on('message',chunk=>{data=Buffer.concat([data,Buffer.from(chunk)]);if(data.includes(Buffer.from('\r\n\r\n'))||data.length>65536)stop();});socket.once('close',()=>stop());socket.once('error',()=>stop(Error('WebSocket failed')));});
 socket.send(Buffer.concat([header,Buffer.from('GET / HTTP/1.1\r\nHost: neverssl.com\r\nConnection: close\r\n\r\n')]));
 const result=await received;assert.equal(result[0],0);assert.equal(result[1],0);assert.match(result.toString(),/HTTP\/1\.[01] \d{3}/);socket.close();await new Promise(r=>setTimeout(r,2000));
 const status=await api('/api/native/users/'+username+'/status');assert.ok(status.usedBytes>0,'Traffic was not accounted');
 console.log(JSON.stringify({ok:true,panel:true,privateApi:true,unauthorizedDenied:true,clientProfiles:6,outboundTcp:true,accounting:true}));
}finally{
 socket?.terminate();try{if(created)await api('/api/native/users/'+username,undefined,'DELETE');}finally{await closeDeploymentConnections();}
}
