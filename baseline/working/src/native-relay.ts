import { tunnelMap } from './config';
import type { Env } from './types';
import type { NativeSocket, SocketFactory } from './native-network';

export function relayFactory(env:Env,country='smart'):SocketFactory{
  return async(host,port,tls=false)=>{
    if(tls)throw new Error('TLS proxy transport requires the direct socket entry');
    if(!env.NATIVE_RELAY_UUID||!/^[a-f\d-]{36}$/i.test(env.NATIVE_RELAY_UUID))throw new Error('Relay credential is not configured');
    const routes=tunnelMap(env)['/edge/'+country]||[];let lastError:unknown;
    for(const target of routes){try{
      const response=await fetch(new URL(target.path,target.origin),{headers:{Upgrade:'websocket'},signal:AbortSignal.timeout(7000)});
      if(response.status!==101||!response.webSocket)throw new Error('Relay upgrade failed');
      const ws=response.webSocket;ws.accept();ws.binaryType='arraybuffer';
      const id=Uint8Array.from(env.NATIVE_RELAY_UUID.replaceAll('-','').match(/../g)!.map(v=>parseInt(v,16))),name=new TextEncoder().encode(host);
      if(name.length>255)throw new Error('Destination name too long');
      ws.send(Uint8Array.from([0,...id,0,1,port>>8,port&255,2,name.length,...name]));
      let controller:ReadableStreamDefaultController<Uint8Array>,closed=false,accepted=false,initial:Uint8Array=new Uint8Array(0),messageChain:Promise<void>=Promise.resolve();let finish!:()=>void;
      const done=new Promise<void>(resolve=>{finish=resolve});
      const end=()=>{if(closed)return;closed=true;try{controller.close()}catch{}try{ws.close()}catch{}finish()};
      const readable=new ReadableStream<Uint8Array>({start(value){controller=value},cancel(){end()}},new ByteLengthQueuingStrategy({highWaterMark:2*1024*1024}));
      ws.addEventListener('message',event=>{messageChain=messageChain.then(async()=>{
        if(closed)return;if(typeof event.data==='string')throw new Error('Unexpected relay message');const frame=event.data as unknown as ArrayBuffer|Blob;let data=new Uint8Array(frame instanceof Blob?await frame.arrayBuffer():frame);
        if(!accepted){const merged=new Uint8Array(initial.length+data.length);merged.set(initial);merged.set(data,initial.length);initial=merged;if(initial.length<2)return;if(initial[0]!==0)throw new Error('Relay authentication rejected');const skip=2+initial[1]!;if(initial.length<skip)return;data=initial.slice(skip);initial=new Uint8Array(0);accepted=true}
        if(data.length){if((controller.desiredSize||0)<-2*1024*1024)throw new Error('Relay receive queue full');controller.enqueue(data)}
      }).catch(()=>end())});
      ws.addEventListener('close',end);ws.addEventListener('error',end);
      const writable=new WritableStream<Uint8Array>({write(data){if(closed)throw new Error('Relay closed');ws.send(data)},close(){end()},abort(){end()}});
      return {readable,writable,opened:Promise.resolve({remoteAddress:null,localAddress:null}),closed:done,close:async()=>end()} as NativeSocket;
    }catch(error){lastError=error}}
    throw lastError||new Error('No relay route is configured');
  };
}
