import { parse, stringify } from 'yaml';
import type { Env } from './types';

export interface EdgeEndpoint { address: string; sni: string; host: string; id?: string; name?: string; country?: string; protocols?: string[] }
const hostname=(value:unknown):value is string=>typeof value==='string'&&value.length<=253&&/^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(value);
function address(value:unknown):value is string {
  if(hostname(value))return true;
  if(typeof value!=='string')return false;
  try{return value.includes(':')&&new URL('https://['+value.replace(/^\[|\]$/g,'')+']/').hostname.startsWith('[')}catch{return false}
}
export function subscriptionEndpoints(env:Env):EdgeEndpoint[] {
  const primaries=(env.PUBLIC_EDGE_HOSTS||env.PUBLIC_EDGE_HOST||'smart.dr-mirhadi.ir').split(',').map((v:string)=>v.trim()).filter(hostname);
  const primary=primaries[0]||'smart.dr-mirhadi.ir';
  let pool:EdgeEndpoint[]=[];
  try{const input=JSON.parse(env.EDGE_ENDPOINTS_JSON||'[]');if(Array.isArray(input))pool=input.slice(0,64).filter((e:EdgeEndpoint)=>e&&address(e.address)&&hostname(e.sni)&&hostname(e.host)).map((e:EdgeEndpoint)=>({...e,country:typeof e.country==='string'?e.country.toLowerCase():undefined,protocols:Array.isArray(e.protocols)?e.protocols.filter(p=>typeof p==='string').slice(0,8):[]}));}catch{}
  if(!pool.length)return primaries.map((host:string,index:number)=>({address:host,sni:host,host,id:'domain-'+(index+1),name:host,country:'smart',protocols:['VLESS · WS']}));
  return pool.filter((item,index)=>pool.findIndex(other=>other.address===item.address&&other.sni===item.sni&&other.host===item.host)===index);
}
export function subscriptionEndpoint(env:Env,username:string,now=Date.now()):EdgeEndpoint {
  const pool=subscriptionEndpoints(env);
  const minutes=Math.min(1440,Math.max(1,Number(env.EDGE_ROTATION_MINUTES)||60));
  const hash=Array.from(username).reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,0);
  return pool[(Math.floor(now/(minutes*60000))+hash)%pool.length]!;
}
export function rotationEpoch(env:Env,now=Date.now()):number {return Math.floor(now/(Math.min(1440,Math.max(1,Number(env.EDGE_ROTATION_MINUTES)||60))*60000));}
export function cleanSubscriptionName(value:string):string {
  if(/smart|auto|هوشمند|خودکار|🧠/i.test(value))return '🧠 هوشمند';
  const countries:Array<[RegExp,string]>=[[/🇮🇷|iran|ایران|\bIR\b/i,'🇮🇷 ایران'],[/🇺🇸|united states|america|آمریکا|\bUS\b/i,'🇺🇸 آمریکا'],[/🇳🇱|netherlands|هلند|\bNL\b/i,'🇳🇱 هلند'],[/🇸🇬|singapore|سنگاپور|\bSG\b/i,'🇸🇬 سنگاپور'],[/🇩🇪|germany|آلمان|\bDE\b/i,'🇩🇪 آلمان'],[/🇹🇷|turkey|ترکیه|\bTR\b/i,'🇹🇷 ترکیه']];
  const known=countries.find(([pattern])=>pattern.test(value))?.[1];if(known)return known;
  const flag=value.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0];
  if(flag){const code=[...flag].map(c=>String.fromCharCode(c.codePointAt(0)!-127397)).join('');const name=new Intl.DisplayNames(['fa'],{type:'region'}).of(code);if(name&&name!==code)return flag+' '+name;}
  return 'اتصال';
}
function decode64(value:string):string{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replace(/\s/g,'')),char=>char.charCodeAt(0)));}
function encode64(value:string):string {let binary='';for(const byte of new TextEncoder().encode(value))binary+=String.fromCharCode(byte);return btoa(binary);}
function smartFirst(line:string):number {
  try{const label=line.startsWith('vmess://')?JSON.parse(decode64(line.slice(8))).ps:decodeURIComponent(new URL(line).hash.slice(1));return cleanSubscriptionName(String(label)).includes('🧠')?0:1;}catch{return 1;}
}
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
      if(['name','remarks','ps','tag'].includes(key)&&typeof item==='string'){if(!names.has(item))names.set(item,cleanSubscriptionName(item)+' · '+(names.size+1));}
      else collect(item,depth+1);
    }
  }
  function structured(value:unknown,key='',depth=0):unknown {
    if(depth>48)throw new Error('Configuration too deep');
    if(typeof value==='string') {
      if(['name','remarks','ps','tag'].includes(key))return names.get(value)||cleanSubscriptionName(value);
      if(['proxies','outbounds','outbound','outboundTag','inboundTag','inbound','final','default','detour'].includes(key))return names.get(value)||value;
      if(key==='rules'){const parts=value.split(',');parts[parts.length-1]=names.get(parts[parts.length-1]!)||parts[parts.length-1]!;return parts.join(',');}
      if(same(value))return ['sni','servername','serverName'].includes(key)?endpoint.sni:['host','Host'].includes(key)?endpoint.host:['address','server','add'].includes(key)?endpoint.address:value;
      return value;
    }
    if(Array.isArray(value)){
      const items=key==='proxies'&&value.every(item=>item&&typeof item==='object')?[...value].sort((a,b)=>Number(!cleanSubscriptionName(String(a.name)).includes('🧠'))-Number(!cleanSubscriptionName(String(b.name)).includes('🧠'))):value;
      return items.map(item=>structured(item,key,depth+1));
    }
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,structured(v,k,depth+1)]));
    return value;
  }
  let decoded=body,encoded=false;
  if(!/^\s*(?:vless|trojan|vmess|ss):\/\//i.test(body)) {
    try {const doc=JSON.parse(body);collect(doc);return JSON.stringify(structured(doc),null,2);}catch{}
    try {const candidate=decode64(body);if(/^(?:vless|trojan|vmess|ss):\/\//im.test(candidate)){decoded=candidate;encoded=true;}}catch{}
    if(!encoded){try {const doc=parse(body,{maxAliasCount:0});if(doc&&typeof doc==='object'){collect(doc);return stringify(structured(doc));}}catch{}return body;}
  }
  const output=decoded.split(/\r?\n/).sort((a,b)=>smartFirst(a)-smartFirst(b)).map((line,index)=>{
    if(line.startsWith('vmess://')) {try{const original=JSON.parse(decode64(line.slice(8)));const converted=structured(original) as Record<string,unknown>;converted.ps=cleanSubscriptionName(String(original.ps||''))+' · '+(index+1);return 'vmess://'+encode64(JSON.stringify(converted));}catch{return line}}
    if(!/^(?:vless|trojan|ss):\/\//i.test(line))return line;
    try {
      const u=new URL(line);let label=u.hash.slice(1);try{label=decodeURIComponent(label)}catch{}
      u.hash=encodeURIComponent(cleanSubscriptionName(label)+' · '+(index+1));
      if(u.searchParams.get('type')==='ws'&&u.searchParams.get('security')==='tls'&&[u.hostname,u.searchParams.get('sni'),u.searchParams.get('host')].some(same)) {
        u.hostname=endpoint.address.includes(':')?'['+endpoint.address.replace(/^\[|\]$/g,'')+']':endpoint.address;
        u.searchParams.set('sni',endpoint.sni);u.searchParams.set('host',endpoint.host);u.searchParams.set('allowInsecure','0');u.searchParams.delete('insecure');
      }
      return u.href;
    }catch{return line}
  }).join('\n');
  return encoded?encode64(output):output;
}
