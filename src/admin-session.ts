import type {Env} from './types';
import {json,error} from './responses';
const encoder=new TextEncoder();
const encode=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));
async function key(env:Env){return crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_TOKEN+'\0'+(env.ADMIN_PASSWORD_HASH||'')),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function validSession(token:string,env:Env):Promise<boolean>{
 try{const parts=token.split('.');if(parts.length!==3||parts[0]!=='s1'||token.length>1024)return false;
  const valid=await crypto.subtle.verify('HMAC',await key(env),decode(parts[2]!),encoder.encode(parts[0]+'.'+parts[1]));if(!valid)return false;
  const data=JSON.parse(new TextDecoder().decode(decode(parts[1]!))) as {exp:number};return Number.isSafeInteger(data.exp)&&data.exp>Date.now()/1000;
 }catch{return false;}
}
export async function passwordMatches(password:string,encoded:string):Promise<boolean>{
 try{const [kind,iterations,salt,expected]=encoded.split('$');if(kind!=='pbkdf2-sha256'||iterations!=='100000'||!salt||!expected||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(expected))return false;
  const raw=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bytes=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/../g)!,part=>parseInt(part,16)),iterations:100000},raw,256));
  const actual=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');let difference=0;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^expected.charCodeAt(i);return difference===0;
 }catch{return false;}
}
export async function adminSession(request:Request,env:Env):Promise<Response>{
 if(request.method!=='POST')return error('Method not allowed',405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return error('Origin not allowed',403);
 let input:{credential?:unknown};try{const reader=request.body?.getReader();if(!reader)return error('Invalid credentials',400);const chunks:Uint8Array[]=[];let bytes=0;try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>2048){await reader.cancel();return error('Invalid credentials',400);}chunks.push(next.value);}}finally{reader.releaseLock();}const raw=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}input=JSON.parse(new TextDecoder().decode(raw));}catch{return error('Invalid credentials',400);}
 if(!input||typeof input.credential!=='string'||input.credential.length>256||!input.credential)return error('Unauthorized',401);
 const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
 const [a,b]=await Promise.all([hash(input.credential),hash(env.ADMIN_TOKEN)]);let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]!^b[i]!;
 if(difference!==0){
  if(!env.ADMIN_PASSWORD_HASH)return error('Unauthorized',401);
  const address=request.headers.get('cf-connecting-ip')||'unknown';const id=encode(await hash(address));const window=Math.floor(Date.now()/300000)*300;
  let attempts:number;
  try{const row=await env.DB.prepare('INSERT INTO admin_login_attempts(id,window_start,attempts) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts').bind(id,window).first<{attempts:number}>();attempts=row?.attempts||99;}catch{return error('Login storage unavailable',503);}
  if(attempts>8)return json({ok:false,error:'Too many login attempts'},429,{'retry-after':'300'});
  if(!await passwordMatches(input.credential,env.ADMIN_PASSWORD_HASH))return error('Unauthorized',401);
 }
 const payload=encode(encoder.encode(JSON.stringify({exp:Math.floor(Date.now()/1000)+28800,nonce:crypto.randomUUID()}))),body='s1.'+payload;
 const signature=encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),encoder.encode(body))));
 return json({ok:true,token:body+'.'+signature,expiresIn:28800});
}
