import {connect} from 'cloudflare:sockets';
import {nativeTransport} from './native-transport';
import {blank} from './private-entry';
import type {Env} from './types';
import {edgeControl} from './edge-control-client';
export default {async fetch(request:Request,env:Env,ctx:ExecutionContext){
 const path=new URL(request.url).pathname;
 if(env.EDGE_PROBE_PATH&&path==='/'+env.EDGE_PROBE_PATH&&request.method==='POST'&&request.headers.get('authorization')==='Bearer '+env.EDGE_CONTROL_TOKEN){
  try{const response=await edgeControl(env,{action:'probe'});return response.ok?Response.json({ok:true,role:'connection'}):blank()}catch{return blank()}
 }
 if(!/^\/edge\/native(?:\/(smart|us|nl|sg|ir|de|turkey))?$/.test(path)||request.headers.get('upgrade')?.toLowerCase()!=='websocket')return blank();
 try{return await nativeTransport(request,{...env,DEPLOYMENT_ROLE:'connection',NATIVE_ENABLED:'true'},ctx,env.NATIVE_RELAY_UUID&&path!=='/edge/native'?undefined:async(host,port,tls)=>connect({hostname:host,port},{secureTransport:tls?'on':'off',allowHalfOpen:false}));}catch{return blank()}
}};


