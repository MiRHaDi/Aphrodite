import WS from 'ws';
import net from 'node:net';
import tls from 'node:tls';
import {Readable,Writable} from 'node:stream';
const NativeResponse=globalThis.Response,originalFetch=globalThis.fetch;
export class WorkerResponse extends NativeResponse {
  constructor(body,init={}){super(body,{...init,status:init.status===101?200:init.status});this.cfStatus=init.status;this.webSocket=init.webSocket;}
  get status(){return this.cfStatus||super.status;}
}
class Endpoint extends EventTarget {
  readyState=0;queue=[];binaryType='arraybuffer';
  accept(){this.readyState=1;}
  send(data){if(this.peer.wire){if(this.peer.wire.bufferedAmount>4*1024*1024)throw Error('Send queue full');this.peer.wire.send(data);}else{if(this.peer.queue.reduce((n,d)=>n+(d.byteLength||d.length||0),0)>2*1024*1024)throw Error('Handshake queue full');this.peer.queue.push(data);}}
  close(code=1000,reason=''){this.readyState=3;this.peer.wire?.close(code,reason);this.peer.dispatchEvent(new Event('close'));}
  attach(wire){this.wire=wire;this.readyState=1;for(const frame of this.queue)wire.send(frame);this.queue=[];wire.on('message',(data,binary)=>this.peer.dispatchEvent(new MessageEvent('message',{data:binary?data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength):data.toString()})));wire.on('close',()=>{this.peer.readyState=3;this.peer.dispatchEvent(new Event('close'));});wire.on('error',()=>this.peer.dispatchEvent(new Event('error')));}
}
export function installCompatibility(){
  globalThis.Response=WorkerResponse;
  globalThis.WebSocketPair=class {constructor(){this[0]=new Endpoint();this[1]=new Endpoint();this[0].peer=this[1];this[1].peer=this[0];}};
  globalThis.fetch=async(input,init={})=>{
    const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
    if(headers.get('upgrade')?.toLowerCase()!=='websocket')return originalFetch(input,init);
    const url=new URL(input instanceof Request?input.url:input);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    for(const name of ['upgrade','connection','host','sec-websocket-key','sec-websocket-version','sec-websocket-extensions'])headers.delete(name);
    const socket=new WS(url,{headers:Object.fromEntries(headers)});socket.binaryType='arraybuffer';socket.accept=()=>{};
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.terminate();reject(Error('Upgrade timeout'));},8000);socket.once('open',()=>{clearTimeout(timeout);resolve();});socket.once('error',()=>{clearTimeout(timeout);reject(Error('Upgrade failed'));});});
    return new WorkerResponse(null,{status:101,webSocket:socket});
  };
  const entries=new Map();globalThis.caches={default:{async match(request){const saved=entries.get(request.url);return saved&&saved.until>Date.now()?saved.response.clone():undefined;},async put(request,response){if(entries.size>=256)entries.delete(entries.keys().next().value);const ttl=Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||30);entries.set(request.url,{until:Date.now()+Math.min(ttl,900)*1000,response:response.clone()});}}};
}
export async function socketFactory(host,port,secure=false){
  const socket=secure?tls.connect({host,port,servername:net.isIP(host)?undefined:host,rejectUnauthorized:true}):net.connect({host,port});
  const opened=new Promise((resolve,reject)=>{socket.once(secure?'secureConnect':'connect',()=>resolve({remoteAddress:socket.remoteAddress,localAddress:socket.localAddress}));socket.once('error',reject);});
  const closed=new Promise(resolve=>socket.once('close',resolve));
  socket.setNoDelay(true);return {opened,closed,readable:Readable.toWeb(socket),writable:Writable.toWeb(socket),close:async()=>socket.destroy()};
}
