import { ledger, nativeEnabled, nativeIdentity } from './native-accounts';
import { wireDns } from './native-dns';
import { relayFactory } from './native-relay';
import type { SocketFactory } from './native-network';
import { settingsFor, type NativeAccount } from './native-types';
import { connectDestination, joinBytes, parseVless, resolver, type Connection } from './native-network';
import type { Env } from './types';
import { text } from './responses';
import {transportFailure,type TransportPhase} from './native-errors';

export async function nativeTransport(request:Request,env:Env,ctx:ExecutionContext,factory?:SocketFactory):Promise<Response>{
  if(!nativeEnabled(env))return text('Native core unavailable',503);
  if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return text('Upgrade required',426);
  const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();server.binaryType='arraybuffer';
  let account:NativeAccount|null=null,connection:Connection|undefined,header:Uint8Array=new Uint8Array(0),dnsBuffer:Uint8Array=new Uint8Array(0),udp=false,closed=false,opened=false,queued=0;
  const lease=crypto.randomUUID();let remaining=0,consumed=0,quotaChain:Promise<void>=Promise.resolve(),queue:Promise<void>=Promise.resolve();
  let phase:TransportPhase='header';
  const fail=(error:unknown)=>{if(!closed)console.warn(JSON.stringify(transportFailure(error,phase)));close(1008);};
  const ipBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('cf-connecting-ip')||'unknown'));
  const ip=Array.from(new Uint8Array(ipBytes),b=>b.toString(16).padStart(2,'0')).join('');
  const release=async()=>{if(account&&opened)await ledger(env,account,'/close',{lease,consumed}).catch(()=>{});};
  const close=(code=1000)=>{if(closed)return;closed=true;clearTimeout(headerTimer);clearInterval(heartbeat);try{server.close(code,code===1000?'':'Connection unavailable')}catch{}if(connection)void connection.socket.close().catch(()=>{});ctx.waitUntil(quotaChain.catch(()=>{}).then(release));};
  const headerTimer=setTimeout(()=>close(1008),10000);
  const heartbeat=setInterval(()=>{if(account&&opened){quotaChain=quotaChain.then(async()=>{const latest=await nativeIdentity(env,account!.uuid,true);if(!latest||latest.uuid!==account!.uuid)throw new Error('Account removed or credentials changed');account=latest;const response=await ledger(env,account,'/heartbeat',{lease,consumed});if(!response.ok)throw new Error('Account policy denied');consumed=0;remaining=(await response.json() as {remaining:number}).remaining;}).catch(()=>close(1008));}},30000);
  const charge=async(bytes:number)=>{
    const work=quotaChain.then(async()=>{if(closed)throw new Error('Closed');
      while(bytes>0){if(!remaining){const response=await ledger(env,account!,'/reserve',{lease,consumed});if(!response.ok)throw new Error('Quota exceeded');const result=await response.json() as {remaining:number};remaining=result.remaining;consumed=0;if(!remaining)throw new Error('Quota exceeded')}
        const amount=Math.min(bytes,remaining);remaining-=amount;consumed+=amount;bytes-=amount;}
    });quotaChain=work;await work;
  };
  const send=async(data:Uint8Array)=>{for(let offset=0;offset<data.length;offset+=32768){const chunk=data.slice(offset,offset+32768);await charge(chunk.length);if(closed)throw new Error('Closed');server.send(chunk)}};
  const process=async(data:Uint8Array)=>{
    if(closed)return;
    if(!account){
      header=joinBytes(header,data);const parsed=parseVless(header);if(!parsed){if(header.length>8192)throw new Error('Header too large');return;}
      phase='identity';account=await nativeIdentity(env,parsed.uuid);
      if(!account||!account.enabled||(account.expires_at!==null&&account.expires_at<=Date.now()/1000))throw new Error('Unauthorized');
      phase='accounting';const response=await ledger(env,account,'/open',{lease,ip});if(!response.ok)throw new Error('Connection denied');remaining=(await response.json() as {remaining:number}).remaining;opened=true;clearTimeout(headerTimer);
      const settings=settingsFor(account);udp=parsed.udp;data=header.slice(parsed.offset);header=new Uint8Array(0);
      if(!udp){
        phase='destination';
        const proxies=settings.proxies.length?settings.proxies:[undefined];let lastError:unknown;
        const country=new URL(request.url).pathname.split('/')[3]||'smart';
        for(const proxy of proxies){try{connection=await connectDestination(parsed.host,parsed.port,proxy,resolver(settings.blockAdult,settings.blockAds),factory||relayFactory(env,country));break}catch(error){lastError=error;if(!settings.rotateProxy)break}}
        if(!connection)throw lastError||new Error('No route');
        server.send(Uint8Array.of(parsed.version,0));
        ctx.waitUntil((async()=>{try{if(connection!.initial.length)await send(connection!.initial);while(!closed){const chunk=await connection!.reader.read();if(chunk.done)break;await send(chunk.value)}}catch{close(1011)}finally{close()}})());
      }else server.send(Uint8Array.of(parsed.version,0));
    }
    phase='transfer';if(!data.length)return;
    await charge(data.length);
    if(!udp){await connection!.writer.write(data);return}
    dnsBuffer=joinBytes(dnsBuffer,data);if(dnsBuffer.length>65537)throw new Error('DNS packet too large');
    while(dnsBuffer.length>=2){const length=(dnsBuffer[0]!<<8)|dnsBuffer[1]!;if(!length)throw new Error('Invalid DNS length');if(dnsBuffer.length<length+2)break;const packet=dnsBuffer.slice(2,length+2);dnsBuffer=dnsBuffer.slice(length+2);const settings=settingsFor(account!);
      const body=await wireDns(packet,resolver(settings.blockAdult,settings.blockAds));await send(joinBytes(Uint8Array.of(body.length>>8,body.length&255),body));
    }
  };
  const early=request.headers.get('sec-websocket-protocol');
  if(early){try{const binary=atob(early.replace(/-/g,'+').replace(/_/g,'/'));const data=Uint8Array.from(binary,c=>c.charCodeAt(0));queue=queue.then(()=>process(data)).catch(fail)}catch(error){fail(error)}}
  server.addEventListener('message',event=>{
    if(typeof event.data==='string'){close(1003);return}const frame=event.data as unknown as ArrayBuffer|Blob;const size=frame instanceof Blob?frame.size:frame.byteLength;queued+=size;if(!Number.isFinite(size)||queued>2*1024*1024){close(1009);return}
    queue=queue.then(async()=>process(new Uint8Array(frame instanceof Blob?await frame.arrayBuffer():frame))).catch(fail).finally(()=>{queued-=size});
  });
  server.addEventListener('close',()=>close());server.addEventListener('error',()=>close(1011));
  return new Response(null,{status:101,webSocket:client});
}
