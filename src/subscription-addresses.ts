import { parse, stringify } from 'yaml';
import type { Env } from './types';

export interface EdgeEndpoint { address: string; sni: string; host: string }
const hostname=(value:unknown):value is string=>typeof value==='string'&&value.length<=253&&/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(value);
function address(value:unknown):value is string {
  if(hostname(value))return true;
  if(typeof value!=='string')return false;
  try{return value.includes(':')&&new URL('https://['+value.replace(/^\[|\]$/g,'')+']/').hostname.startsWith('[')}catch{return false}
}
export function subscriptionEndpoint(env:Env,username:string,now=Date.now()):EdgeEndpoint {
  const primary=hostname(env.PUBLIC_EDGE_HOST)?env.PUBLIC_EDGE_HOST:'smart.dr-mirhadi.ir';
  let pool:EdgeEndpoint[]=[];
  try{const input=JSON.parse(env.EDGE_ENDPOINTS_JSON||'[]');if(Array.isArray(input))pool=input.slice(0,16).filter((e:EdgeEndpoint)=>e&&address(e.address)&&hostname(e.sni)&&hostname(e.host));}catch{}
  if(!pool.length)return {address:primary,sni:primary,host:primary};
  const minutes=Math.min(1440,Math.max(1,Number(env.EDGE_ROTATION_MINUTES)||60));
  const hash=Array.from(username).reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,0);
  return pool[(Math.floor(now/(minutes*60000))+hash)%pool.length]!;
}
export function rotationEpoch(env:Env,now=Date.now()):number {return Math.floor(now/(Math.min(1440,Math.max(1,Number(env.EDGE_ROTATION_MINUTES)||60))*60000));}
export function cleanSubscriptionName(value:string):string{return value.replace(/vpn/ig,'').replace(/ {2,}/g,' ').trim();}
function decode64(value:string):string{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replace(/\s/g,'')),char=>char.charCodeAt(0)));}
function encode64(value:string):string {let binary='';for(const byte of new TextEncoder().encode(value))binary+=String.fromCharCode(byte);return btoa(binary);}
export function rewriteSubscription(body:string,env:Env,username:string,now=Date.now()):string {
  if(body.length>2*1024*1024)throw new Error('Subscription too large');
  const endpoint=subscriptionEndpoint(env,username,now);
  const aliases=new Set((env.EDGE_HOST_ALIASES||'vpn.dr-mirhadi.ir,zeus.dr-mirhadi.ir,smart.dr-mirhadi.ir,aphrodite.dr-mirhadi.ir').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
  const same=(value:unknown)=>typeof value==='string'&&aliases.has(value.toLowerCase());
  const names=new Map<string,string>();
  function collect(value:unknown,depth=0):void {
    if(depth>48)throw new Error('Configuration too deep');
    if(Array.isArray(value)){for(const item of value)collect(item,depth+1);return;}
    if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
      if(['name','remarks','ps'].includes(key)&&typeof item==='string')names.set(item,cleanSubscriptionName(item));
      else collect(item,depth+1);
    }
  }
  function structured(value:unknown,key='',depth=0):unknown {
    if(depth>48)throw new Error('Configuration too deep');
    if(typeof value==='string') {
      if(['name','remarks','ps'].includes(key))return cleanSubscriptionName(value);
      if(key==='proxies')return names.get(value)||value;
      if(key==='rules'){const parts=value.split(',');parts[parts.length-1]=names.get(parts[parts.length-1]!)||parts[parts.length-1]!;return parts.join(',');}
      if(same(value))return ['sni','servername','serverName'].includes(key)?endpoint.sni:['host','Host'].includes(key)?endpoint.host:['address','server','add'].includes(key)?endpoint.address:value;
      return value;
    }
    if(Array.isArray(value))return value.map(item=>structured(item,key,depth+1));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,structured(v,k,depth+1)]));
    return value;
  }
  let decoded=body,encoded=false;
  if(!/^\s*(?:vless|trojan|vmess|ss):\/\//i.test(body)) {
    try {const doc=JSON.parse(body);collect(doc);return JSON.stringify(structured(doc),null,2);}catch{}
    try {const candidate=decode64(body);if(/^(?:vless|trojan|vmess|ss):\/\//im.test(candidate)){decoded=candidate;encoded=true;}}catch{}
    if(!encoded){try {const doc=parse(body,{maxAliasCount:0});if(doc&&typeof doc==='object'){collect(doc);return stringify(structured(doc));}}catch{}return body;}
  }
  const output=decoded.split(/\r?\n/).map(line=>{
    if(line.startsWith('vmess://')) {try{return 'vmess://'+encode64(JSON.stringify(structured(JSON.parse(decode64(line.slice(8))))));}catch{return line}}
    if(!/^(?:vless|trojan|ss):\/\//i.test(line))return line;
    try {
      const u=new URL(line);let label=u.hash.slice(1);try{label=decodeURIComponent(label)}catch{}
      u.hash=encodeURIComponent(cleanSubscriptionName(label));
      if(u.searchParams.get('type')==='ws'&&u.searchParams.get('security')==='tls'&&[u.hostname,u.searchParams.get('sni'),u.searchParams.get('host')].some(same)) {
        u.hostname=endpoint.address.includes(':')?'['+endpoint.address.replace(/^\[|\]$/g,'')+']':endpoint.address;
        u.searchParams.set('sni',endpoint.sni);u.searchParams.set('host',endpoint.host);u.searchParams.set('allowInsecure','0');u.searchParams.delete('insecure');
      }
      return u.href;
    }catch{return line}
  }).join('\n');
  return encoded?encode64(output):output;
}
