const cache=new Map<string,{body:Uint8Array;expires:number}>();
function skipName(data:Uint8Array,start:number):number{let i=start;for(let labels=0;labels<128;labels++){if(i>=data.length)throw new Error('Truncated DNS name');const length=data[i++]!;if(!length)return i;if((length&192)===192){if(i>=data.length)throw new Error('Truncated DNS pointer');return i+1}if(length>63||i+length>data.length)throw new Error('Invalid DNS name');i+=length}throw new Error('DNS name too long')}
export function dnsTtl(data:Uint8Array):number{
  try{if(data.length<12||(data[3]!&15)!==0)return 0;const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let offset=12;const questions=view.getUint16(4),answers=view.getUint16(6);if(!answers||questions>16||answers>128)return 0;for(let i=0;i<questions;i++){offset=skipName(data,offset)+4;if(offset>data.length)return 0}let ttl=300;for(let i=0;i<answers;i++){offset=skipName(data,offset);if(offset+10>data.length)return 0;ttl=Math.min(ttl,view.getUint32(offset+4));const length=view.getUint16(offset+8);offset+=10+length;if(offset>data.length)return 0}return ttl}catch{return 0}
}
export async function wireDns(packet:Uint8Array,endpoint:string):Promise<Uint8Array>{
  if(packet.length<12||packet.length>65535)throw new Error('Invalid DNS packet');let key=endpoint+'|';for(const byte of packet.slice(2))key+=String.fromCharCode(byte);
  const saved=cache.get(key);if(saved&&saved.expires>Date.now()){const body=saved.body.slice();body[0]=packet[0]!;body[1]=packet[1]!;return body}
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/dns-message',accept:'application/dns-message'},body:new Uint8Array(packet).buffer,signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw new Error('DNS failed');const body=new Uint8Array(await response.arrayBuffer());if(body.length<12||body.length>65535)throw new Error('Invalid DNS response');
  const ttl=dnsTtl(body);if(ttl>0&&body.length<=8192){if(cache.size>=256)cache.delete(cache.keys().next().value!);cache.set(key,{body:body.slice(),expires:Date.now()+ttl*1000})}return body;
}
