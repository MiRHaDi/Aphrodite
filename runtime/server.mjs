import http from 'node:http';
import {isIP} from 'node:net';
import {Readable} from 'node:stream';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {WebSocketServer} from 'ws';
import application from '../src/index.ts';
import {privateApplication} from '../src/private-entry.ts';
import {nativeTransport} from '../src/native-transport.ts';
import {database} from './database.mjs';
import management from '../src/management-worker.ts';
import dataWorker from '../src/database-worker.ts';
import {installCompatibility,socketFactory} from './compat.mjs';
export async function start(options={}){
  installCompatibility();
  const settings={...process.env,...options.env};
  if(!settings.ADMIN_TOKEN||settings.ADMIN_TOKEN.length<24||!/^[A-Za-z0-9_-]{16,128}$/.test(settings.ADMIN_PATH||''))throw Error('ADMIN_TOKEN and ADMIN_PATH must be configured.');
  if(settings.DATA_CONTROL_URL&&settings.DEPLOYMENT_ROLE!=='management')throw Error('Remote database requires management role');
  const DB=settings.DATA_CONTROL_URL?undefined:await database(settings.DATABASE_PATH||join(settings.DATA_DIR||'/data','aphrodite.sqlite'),options.migrations||join(dirname(fileURLToPath(import.meta.url)),'migrations'));
  const env={...settings,DB,CONTROL_PLANE_ORIGIN:settings.CONTROL_PLANE_ORIGIN||'',NATIVE_ENABLED:settings.NATIVE_ENABLED||'true'};
  const app=settings.DEPLOYMENT_ROLE==='management'?management:settings.DEPLOYMENT_ROLE==='database'?dataWorker:privateApplication({fetch(request,env,ctx){
    if(/^\/edge\/native(?:\/[^/]+)?$/.test(new URL(request.url).pathname))return nativeTransport(request,env,ctx,env.NATIVE_RELAY_UUID&&new URL(request.url).pathname!='/edge/native'?undefined:socketFactory);
    return application.fetch(request,env,ctx);
  }});
  const tasks=new Set(),ctx={waitUntil(promise){const p=Promise.resolve(promise).catch(()=>{}).finally(()=>tasks.delete(p));tasks.add(p);},passThroughOnException(){}};
  const requestFor=(req,body)=>{const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);const forwarded=headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();headers.set('cf-connecting-ip',settings.TRUST_PROXY==='true'&&isIP(forwarded||'')?forwarded:req.socket.remoteAddress||'unknown');const scheme=settings.TRUST_PROXY==='true'&&headers.get('x-forwarded-proto')==='https'?'https':'http';return new Request(scheme+'://'+(req.headers.host||'localhost')+req.url,{method:req.method,headers,body,duplex:body?'half':undefined});};
  const server=http.createServer(async(req,res)=>{
    try{const response=await app.fetch(requestFor(req,['GET','HEAD'].includes(req.method)?undefined:Readable.toWeb(req)),env,ctx);res.writeHead(response.status,Object.fromEntries(response.headers));if(req.method==='HEAD'||!response.body)res.end();else Readable.fromWeb(response.body).on('error',()=>res.destroy()).pipe(res);}catch{res.writeHead(404);res.end();}
  });
  const sockets=new WebSocketServer({noServer:true,maxPayload:2*1024*1024});
  server.on('upgrade',async(req,network,head)=>{
    try{const response=await app.fetch(requestFor(req),env,ctx);if(response.status!==101||!response.webSocket){network.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');return;}
      sockets.handleUpgrade(req,network,head,client=>{const remote=response.webSocket;if(remote.attach)remote.attach(client);else {client.on('message',(data,binary)=>remote.send(data,{binary}));remote.on('message',(data,binary)=>client.send(data,{binary}));client.on('close',()=>remote.close());remote.on('close',()=>client.close());client.on('error',()=>remote.terminate());remote.on('error',()=>client.terminate());}});
    }catch{network.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');}
  });
  await new Promise(resolve=>server.listen(Number(options.port??settings.PORT??8080),settings.BIND_ADDRESS||'0.0.0.0',resolve));
  return {server,env,address:server.address(),async close(){for(const client of sockets.clients)client.terminate();await new Promise(resolve=>server.close(resolve));await Promise.allSettled(tasks);DB?.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start().then(()=>console.log('Service ready')).catch(()=>{console.error('Startup failed: check runtime configuration and database access.');process.exitCode=1;});
