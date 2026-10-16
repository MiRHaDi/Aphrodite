import { validHost } from './native-types';

const dnsCache = new Map<string,{value:string;expires:number}>();
export function publicAddress(host: string): boolean {
  const ip=host.replace(/^\[|\]$/g,'').toLowerCase();
  if(ip.includes(':'))return !['::','::1'].includes(ip)&&!/^f[cd]|^fe[89ab]|^ff|^::ffff:/i.test(ip);
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip))return false;
  const a=ip.split('.').map(Number);return a.every(n=>n<=255)&&a[0]!==0&&a[0]!==10&&a[0]!==127&&a[0]!<224&&!(a[0]===169&&a[1]===254)&&!(a[0]===172&&a[1]!>=16&&a[1]!<=31)&&!(a[0]===192&&a[1]===168)&&!(a[0]===100&&a[1]!>=64&&a[1]!<=127);
}
export function resolver(adult=false,ads=false):string{return ads?(adult?'https://family.adguard-dns.com/dns-query':'https://dns.adguard-dns.com/dns-query'):adult?'https://family.cloudflare-dns.com/dns-query':'https://cloudflare-dns.com/dns-query'}
export async function resolvePublic(host:string,doh=resolver()):Promise<string>{
  host=host.replace(/^\[|\]$/g,'');if(publicAddress(host))return host;
  if(!validHost(host)||host.includes(':')||/^\d+(?:\.\d+)*$/.test(host)||/(?:^|\.)(localhost|local|internal|invalid|test)$/.test(host))throw new Error('Private destination denied');
  const key=doh+'|'+host,cached=dnsCache.get(key);if(cached&&cached.expires>Date.now())return cached.value;
  for(const type of ['A','AAAA']){
    const url=new URL(doh);url.searchParams.set('name',host);url.searchParams.set('type',type);
    const response=await fetch(url,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000)});
    if(!response.ok)continue;
    const data=await response.json() as {Answer?:Array<{type:number;data:string;TTL:number}>};
    const answer=data.Answer?.find(a=>(a.type===1||a.type===28)&&publicAddress(a.data));
    if(answer){if(dnsCache.size>=2048)dnsCache.delete(dnsCache.keys().next().value!);dnsCache.set(key,{value:answer.data,expires:Date.now()+Math.min(300,Math.max(1,answer.TTL))*1000});return answer.data}
  }throw new Error('Destination lookup failed');
}
export class BufferedReader {
  private buffer:Uint8Array=new Uint8Array(0);
  constructor(readonly reader:ReadableStreamDefaultReader<Uint8Array>){}
  async exact(length:number):Promise<Uint8Array>{
    while(this.buffer.length<length){const part=await this.reader.read();if(part.done)throw new Error('Truncated proxy response');this.buffer=joinBytes(this.buffer,part.value);if(this.buffer.length>65536)throw new Error('Oversized proxy response')}
    const result=this.buffer.slice(0,length);this.buffer=this.buffer.slice(length);return result;
  }
  take():Uint8Array{const result=this.buffer;this.buffer=new Uint8Array(0);return result}
}
export function joinBytes(...parts:Uint8Array[]):Uint8Array{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result}
export interface NativeSocket {readable:ReadableStream<Uint8Array>;writable:WritableStream<Uint8Array>;opened:Promise<unknown>;closed:Promise<void>;close():Promise<void>}
export type SocketFactory=(host:string,port:number,tls?:boolean)=>Promise<NativeSocket>;
export interface Connection{socket:NativeSocket;reader:ReadableStreamDefaultReader<Uint8Array>;writer:WritableStreamDefaultWriter<Uint8Array>;initial:Uint8Array}
async function dial(host:string,port:number,tls=false,factory?:SocketFactory):Promise<NativeSocket>{
  const ip=await resolvePublic(host);
  // TLS SNI must remain the proxy hostname; public DNS validation is done above.
  if(!factory)throw new Error('Socket transport is not configured');
  const socket=await factory(tls?host:ip,port,tls);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([socket.opened,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Connection timeout')),7000)})]);return socket}
  catch(error){void socket.close().catch(()=>{});throw error}finally{clearTimeout(timer)}
}
export async function connectDestination(host:string,port:number,proxy?:string,doh?:string,factory?:SocketFactory):Promise<Connection>{
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
  const ip=await resolvePublic(host,doh);const remote=proxy?new URL(proxy):null;
  const socket=await dial(remote?.hostname||ip,remote?Number(remote.port||(remote.protocol==='https:'?443:remote.protocol==='http:'?8080:1080)):port,remote?.protocol==='https:',factory);
  const reader=socket.readable.getReader(),writer=socket.writable.getWriter(),buffer=new BufferedReader(reader),encoder=new TextEncoder();
  const handshakeTimeout=setTimeout(()=>{void socket.close().catch(()=>{})},8000);
  try{
    if(remote?.protocol==='socks5:'){
      const user=encoder.encode(decodeURIComponent(remote.username)),pass=encoder.encode(decodeURIComponent(remote.password));
      if(user.length>255||pass.length>255)throw new Error('Invalid proxy credentials');
      await writer.write(Uint8Array.of(5,1,user.length?2:0));const selected=await buffer.exact(2);
      if(selected[0]!==5||selected[1]!== (user.length?2:0))throw new Error('SOCKS authentication rejected');
      if(user.length){await writer.write(joinBytes(Uint8Array.of(1,user.length),user,Uint8Array.of(pass.length),pass));const auth=await buffer.exact(2);if(auth[1]!==0)throw new Error('SOCKS credentials rejected')}
      const domain=encoder.encode(host);if(domain.length>255)throw new Error('Host too long');
      await writer.write(joinBytes(Uint8Array.of(5,1,0,3,domain.length),domain,Uint8Array.of(port>>8,port&255)));
      const reply=await buffer.exact(4);if(reply[0]!==5||reply[1]!==0)throw new Error('SOCKS connection rejected');
      const length=reply[3]===1?4:reply[3]===4?16:reply[3]===3?(await buffer.exact(1))[0]!:0;
      if(!length)throw new Error('Invalid SOCKS address');await buffer.exact(length+2);
    }else if(remote?.protocol==='socks4:'){
      const user=encoder.encode(decodeURIComponent(remote.username));if(user.includes(0))throw new Error('Invalid username');
      await writer.write(joinBytes(Uint8Array.of(4,1,port>>8,port&255,0,0,0,1),user,Uint8Array.of(0),encoder.encode(host),Uint8Array.of(0)));
      const reply=await buffer.exact(8);if(reply[1]!==90)throw new Error('SOCKS4 connection rejected');
    }else if(remote){
      const authority=(host.includes(':')?'['+host+']':host)+':'+port;
      const auth=remote.username?'Proxy-Authorization: Basic '+btoa(decodeURIComponent(remote.username)+':'+decodeURIComponent(remote.password))+'\r\n':'';
      await writer.write(encoder.encode('CONNECT '+authority+' HTTP/1.1\r\nHost: '+authority+'\r\n'+auth+'\r\n'));
      let response='';while(!response.endsWith('\r\n\r\n')){response+=String.fromCharCode((await buffer.exact(1))[0]!);if(response.length>16384)throw new Error('Proxy response too large')}
      if(!/^HTTP\/1\.[01] 200\b/.test(response))throw new Error('HTTP proxy rejected');
    }
    return {socket,reader,writer,initial:buffer.take()};
  }catch(error){reader.releaseLock();writer.releaseLock();void socket.close().catch(()=>{});throw error}finally{clearTimeout(handshakeTimeout)}
}
export interface VlessHeader{uuid:string;host:string;port:number;udp:boolean;version:number;offset:number}
export function parseVless(data:Uint8Array):VlessHeader|null{
  if(data.length<18)return null;if(data[0]!==0&&data[0]!==1)throw new Error('Invalid protocol version');
  const hex=Array.from(data.slice(1,17),v=>v.toString(16).padStart(2,'0')).join('');
  const uuid=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  let i=18+data[17]!;if(data.length<i+4)return null;const command=data[i++]!;if(command!==1&&command!==2)throw new Error('Unsupported command');
  const port=(data[i++]!<<8)|data[i++]!,type=data[i++]!;let host='';
  if(type===1){if(data.length<i+4)return null;host=Array.from(data.slice(i,i+4)).join('.');i+=4}
  else if(type===2){if(data.length<i+1)return null;const length=data[i++]!;if(!length)throw new Error('Invalid host');if(data.length<i+length)return null;host=new TextDecoder('utf-8',{fatal:true}).decode(data.slice(i,i+length));i+=length}
  else if(type===3){if(data.length<i+16)return null;for(let j=0;j<8;j++)host+=(j?':':'')+((data[i++]!<<8)|data[i++]!).toString(16)}
  else throw new Error('Unsupported address');
  if(!port||!validHost(host))throw new Error('Invalid destination');if(command===2&&port!==53)throw new Error('Only DNS UDP is supported');
  return {uuid,host,port,udp:command===2,version:data[0]!,offset:i};
}
