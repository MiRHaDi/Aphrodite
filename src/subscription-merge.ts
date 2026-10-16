import { parse, stringify } from 'yaml';
import type { Env } from './types';
export function subscriptionClient(request:Request):string {
  const format=new URL(request.url).searchParams.get('format');
  if(format==='clash'||format==='clash-meta')return 'clash-meta';
  if(format==='xray'||format==='v2ray-json')return 'v2ray-json';
  if(format==='sing-box')return 'sing-box';
  if(format==='base64'||format==='raw'||format==='v2ray')return 'v2ray';
  const agent=request.headers.get('user-agent')||'';
  if(/^(clash|mihomo|flclash|stash)/i.test(agent))return 'clash-meta';
  if(/^(sfa|sfi|sfm|sft|karing|hiddifynext)/i.test(agent))return 'sing-box';
  return 'v2ray';
}
const schemes=/^(?:vless|vmess|trojan|ss):\/\//i;
function decode(value:string):string {return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
function encode(value:string):string {let binary='';for(const b of new TextEncoder().encode(value))binary+=String.fromCharCode(b);return btoa(binary);}
function lines(body:string):{lines:string[];encoded:boolean}|null {
  let source=body,encoded=false;
  if(!source.split(/\r?\n/).some(s=>schemes.test(s))){try{source=decode(source);encoded=true}catch{return null}}
  const list=source.split(/\r?\n/).filter(s=>schemes.test(s));return list.length?{lines:list,encoded}:null;
}
function identity(line:string):string {
  if(line.startsWith('vmess://')){try{const v=JSON.parse(decode(line.slice(8)));delete v.ps;return JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))))}catch{return line}}
  try{const u=new URL(line);u.hash='';u.searchParams.sort();return u.href}catch{return line}
}
export function mergeSubscriptionBodies(bodies:string[]):string {
  if(!bodies.length)return '';
  const first=lines(bodies[0]!);
  if(first){const seen=new Set<string>(),merged:string[]=[];for(const body of bodies){const list=lines(body);if(!list)continue;for(const line of list.lines){const id=identity(line);if(!seen.has(id)){seen.add(id);merged.push(line)}}}return first.encoded?encode(merged.join('\n')):merged.join('\n');}
  // Merge Clash documents without modifying routing actions or account credentials.
  try {
    const docs=bodies.map(body=>parse(body,{maxAliasCount:0}));const base=docs[0];
    if(base&&Array.isArray(base.proxies)){
      const existing=new Set<string>(),used=new Set<string>();const proxies:Array<Record<string,unknown>>=[];
      for(const doc of docs){if(!doc||!Array.isArray(doc.proxies))continue;for(const proxy of doc.proxies){const copy={...proxy};delete copy.name;const id=JSON.stringify(copy);if(existing.has(id))continue;existing.add(id);let name=String(proxy.name||'Connection');while(used.has(name))name+=' +';used.add(name);proxies.push({...proxy,name});}}
      base.proxies=proxies;
      if(Array.isArray(base['proxy-groups']))for(const group of base['proxy-groups'])if(Array.isArray(group.proxies)){group.proxies=[...new Set([...group.proxies,...proxies.map(p=>p.name)])].filter(name=>name!==group.name);}
      return bodies[0]!.trim().startsWith('{')?JSON.stringify(base,null,2):stringify(base);
    }
    if(Array.isArray(base)&&base.every(v=>v&&Array.isArray(v.outbounds))){return JSON.stringify(docs.filter(Array.isArray).flat(),null,2);}
  }catch{}
  return bodies[0]!;
}
export function gatewayVariants(body:string,env:Env):string {
  const list=lines(body);
  let gateways:Array<{host:string;paths:string[]}>=[];
  try{const input=JSON.parse(env.SUBSCRIPTION_GATEWAYS_JSON||'[]');if(Array.isArray(input))gateways=input.slice(0,12).filter(g=>g&&typeof g.host==='string'&&/^[a-z0-9.-]+$/i.test(g.host)&&Array.isArray(g.paths));}catch{}
  if(!list){
    try{
      const doc=parse(body,{maxAliasCount:0});
      if(doc&&Array.isArray(doc.outbounds)){
        const extra:Array<Record<string,unknown>>=[];
        for(const outbound of doc.outbounds){const path=outbound.transport?.path;if(outbound.transport?.type!=='ws'||outbound.tls?.enabled!==true||typeof path!=='string'||!path.startsWith('/edge/'))continue;
          for(const gateway of gateways)if(gateway.paths.includes(path))extra.push({...outbound,tag:String(outbound.tag)+' '+(extra.length+1),server:gateway.host,tls:{...outbound.tls,server_name:gateway.host},transport:{...outbound.transport,headers:{...outbound.transport.headers,Host:gateway.host}}});
        }
        for(const outbound of doc.outbounds)if(['selector','urltest'].includes(outbound.type)&&Array.isArray(outbound.outbounds))outbound.outbounds.push(...extra.map(item=>item.tag));
        doc.outbounds.push(...extra);return JSON.stringify(doc,null,2);
      }
      if(doc&&Array.isArray(doc.proxies)){
        const extra:unknown[]=[];
        for(const proxy of doc.proxies){const path=proxy['ws-opts']?.path;if(proxy.network!=='ws'||proxy.tls!==true||typeof path!=='string'||!path.startsWith('/edge/'))continue;
          for(const gateway of gateways)if(gateway.paths.includes(path))extra.push({...proxy,server:gateway.host,servername:gateway.host,'ws-opts':{...proxy['ws-opts'],headers:{...proxy['ws-opts'].headers,Host:gateway.host}}});
        }
        return mergeSubscriptionBodies([body,JSON.stringify({proxies:extra})]);
      }
      if(Array.isArray(doc)){
        const extra:unknown[]=[];
        for(const config of doc){const outbound=config?.outbounds?.find((item:Record<string,any>)=>item.streamSettings?.network==='ws'&&item.streamSettings?.security==='tls');const path=outbound?.streamSettings?.wsSettings?.path;
          if(typeof path!=='string'||!path.startsWith('/edge/'))continue;
          for(const gateway of gateways)if(gateway.paths.includes(path)){const copy=structuredClone(config);const target=copy.outbounds[config.outbounds.indexOf(outbound)];const servers=target.settings?.vnext||target.settings?.servers;if(!Array.isArray(servers))continue;for(const server of servers)server.address=gateway.host;target.streamSettings.tlsSettings={...target.streamSettings.tlsSettings,serverName:gateway.host};target.streamSettings.wsSettings.headers={...target.streamSettings.wsSettings.headers,Host:gateway.host};extra.push(copy);}
        }
        return JSON.stringify([...doc,...extra],null,2);
      }
    }catch{}
    return body;
  }
  const extra:string[]=[];
  for(const line of list.lines){
    if(line.startsWith('vmess://')){
      try{const v=JSON.parse(decode(line.slice(8)));if(v.net!=='ws'||v.tls!=='tls'||!String(v.path).startsWith('/edge/'))continue;for(const g of gateways)if(g.paths.includes(v.path))extra.push('vmess://'+encode(JSON.stringify({...v,add:g.host,sni:g.host,host:g.host})));}catch{}continue;
    }
    if(!/^(?:vless|trojan):\/\//i.test(line))continue;
    try{const u=new URL(line),path=u.searchParams.get('path')||'';if(u.searchParams.get('type')!=='ws'||u.searchParams.get('security')!=='tls'||!path.startsWith('/edge/'))continue;for(const g of gateways)if(g.paths.includes(path)){const v=new URL(u.href);v.hostname=g.host;v.searchParams.set('sni',g.host);v.searchParams.set('host',g.host);extra.push(v.href);}}catch{}
  }
  return mergeSubscriptionBodies([body,list.encoded?encode(extra.join('\n')):extra.join('\n')]);
}
