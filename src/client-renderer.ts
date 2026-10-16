import {parse,stringify} from 'yaml';
import type {ClientProfile} from './client-profiles';
type ObjectValue=Record<string,any>;
const SMART='🧠 هوشمند',AUTO='⚡ خودکار';
const smart=(name:string)=>/🧠|هوشمند|smart/i.test(name);
const iran=(name:string)=>/🇮🇷|ایران|\biran\b/i.test(name);
// Keep independent transports in the pool: a smart-labelled primary can fail too.
function automaticCandidates(names:string[]):string[]{const foreign=names.filter(n=>!iran(n));return [...(foreign.length?foreign:names)].sort((a,b)=>Number(!smart(a))-Number(!smart(b)));}
function unique(preferred:string,used:Set<string>):string {let value=preferred;while(used.has(value))value+=' +';used.add(value);return value;}
function decode64(value:string):string{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
function uriBody(body:string,raw:boolean):string {
  if(/^\s*(vless|vmess|trojan|ss):\/\//i.test(body))return raw?body:encode64(body);
  if(!raw)return body;
  const decoded=decode64(body);if(!/^\s*(vless|vmess|trojan|ss):\/\//i.test(decoded))throw Error('Invalid URI subscription');return decoded;
}
function encode64(value:string):string{let binary='';for(const byte of new TextEncoder().encode(value))binary+=String.fromCharCode(byte);return btoa(binary);}
function tuneClash(config:ObjectValue,profile:ClientProfile,country?:string):ObjectValue {
  if(!Array.isArray(config.proxies))throw Error('Invalid Clash subscription');
  const proxies=config.proxies as ObjectValue[];if(!proxies.length)throw Error('No compatible proxies');
  const groups=Array.isArray(config['proxy-groups'])?config['proxy-groups']:[];
  const used=new Set<string>([...proxies,...groups].map(p=>String(p.name)));
  const names=proxies.map(p=>String(p.name)),candidates=automaticCandidates(names);
  const auto=unique(AUTO,used),main=unique(SMART,used);
  const backup=unique('🛟 پشتیبان',used);
  groups.unshift({name:main,type:'select',proxies:[auto,backup,...names]},{name:auto,type:'url-test',proxies:candidates,url:'https://www.gstatic.com/generate_204',interval:300,tolerance:50},{name:backup,type:'fallback',proxies:candidates,url:'https://www.gstatic.com/generate_204',interval:300});
  const rules=Array.isArray(config.rules)?config.rules:[];
  const ir=names.filter(iran);const prefix:string[]=[];
  if(country==='IR')prefix.push('DOMAIN-SUFFIX,ir,DIRECT');
  else if(ir.length){const tag=unique('🇮🇷 ایران',used);groups.push({name:tag,type:'url-test',proxies:ir,url:'https://www.gstatic.com/generate_204',interval:300,tolerance:50});prefix.push('DOMAIN-SUFFIX,ir,'+tag);}
  config['proxy-groups']=groups;config.rules=[...prefix,...rules.map((rule:unknown)=>typeof rule==='string'&&/^MATCH,/i.test(rule)?'MATCH,'+main:rule)];
  if(!rules.some((rule:unknown)=>typeof rule==='string'&&/^MATCH,/i.test(rule)))config.rules.push('MATCH,'+main);
  config.mode=config.mode||'rule';if(profile.family==='mihomo'&&config['tcp-concurrent']===undefined)config['tcp-concurrent']=true;
  if(config.ipv6===undefined)config.ipv6=true;
  if(profile.family==='mihomo'&&config['geox-url']){
    if(config['geo-auto-update']===undefined)config['geo-auto-update']=true;
    if(config['geo-update-interval']===undefined)config['geo-update-interval']=24;
  }
  // DNS, certificate validation, credentials and per-node transport settings remain provider-owned.
  return config;
}
function tuneSingBox(config:ObjectValue,country?:string):ObjectValue {
  if(!Array.isArray(config.outbounds))throw Error('Invalid sing-box subscription');
  const outbounds=config.outbounds as ObjectValue[];
  const nodes=outbounds.filter(o=>!['direct','block','dns','selector','urltest'].includes(String(o.type))&&typeof o.tag==='string');
  if(!nodes.length)throw Error('No compatible outbounds');
  const used=new Set<string>(outbounds.map(o=>String(o.tag))),names=nodes.map(o=>String(o.tag)),preferred=automaticCandidates(names);
  const auto=unique(AUTO,used),main=unique(SMART,used);
  outbounds.unshift({type:'selector',tag:main,outbounds:[auto,...names],default:auto},{type:'urltest',tag:auto,outbounds:preferred,url:'https://www.gstatic.com/generate_204',interval:'5m',tolerance:50});
  config.route=config.route||{};const rules=Array.isArray(config.route.rules)?config.route.rules:[];
  const prefix:ObjectValue[]=[];
  let direct=outbounds.find(o=>o.type==='direct')?.tag;
  if(!direct){direct=unique('محلی',used);outbounds.push({type:'direct',tag:direct});}
  prefix.push({ip_is_private:true,outbound:direct});
  const ir=names.filter(iran);
  if(country==='IR')prefix.push({domain_suffix:['ir'],outbound:direct});
  else if(ir.length){const tag=unique('🇮🇷 ایران',used);outbounds.push({type:'urltest',tag,outbounds:ir,url:'https://www.gstatic.com/generate_204',interval:'5m',tolerance:50});prefix.push({domain_suffix:['ir'],outbound:tag});}
  config.route.rules=[...prefix,...rules];config.route.final=main;
  return config;
}
function atom(value:unknown):string {
  const text=String(value??'');if(!text||/[\r\n\0]/.test(text))throw Error('Invalid Surge value');
  return /[,="|]/.test(text)?JSON.stringify(text):text;
}
export function surgeProfile(config:ObjectValue,country?:string):string {
  if(!Array.isArray(config.proxies))throw Error('Invalid proxy source');
  const lines:string[]=[],names:string[]=[],ir:string[]=[];
  for(const node of config.proxies as ObjectValue[]){
    const network=node.network||'tcp';let parameters:string[]=[];
    // Do not silently downgrade unsupported VLESS, gRPC, XHTTP, plugins or REALITY.
    if(node['reality-opts']||node.plugin||node.flow)continue;
    if(node.type==='vmess'&&['tcp','ws'].includes(network)&&(!node.cipher||['auto','aes-128-gcm'].includes(node.cipher))){
      parameters=['vmess',atom(node.server),atom(node.port),'username='+atom(node.uuid),'vmess-aead='+(Number(node.alterId||0)===0)];
      if(node.tls)parameters.push('tls=true');
      if(network==='ws'){parameters.push('ws=true','ws-path='+atom(node['ws-opts']?.path||'/'));const host=node['ws-opts']?.headers?.Host;if(host)parameters.push('ws-headers='+atom('Host:'+host));}
    }else if(node.type==='trojan'&&network==='tcp')parameters=['trojan',atom(node.server),atom(node.port),'password='+atom(node.password)];
    else if(node.type==='ss'&&network==='tcp'&&!node.tls&&['aes-128-gcm','aes-256-gcm','chacha20-ietf-poly1305'].includes(node.cipher))parameters=['ss',atom(node.server),atom(node.port),'encrypt-method='+atom(node.cipher),'password='+atom(node.password)];
    else continue;
    const name=String(node.name);if(/[=,\r\n]/.test(name))continue;
    if(node.tls||node.type==='trojan'){parameters.push('skip-cert-verify=false');if(node.sni||node.servername)parameters.push('sni='+atom(node.sni||node.servername));}
    lines.push(name+' = '+parameters.join(', '));names.push(name);if(iran(name))ir.push(name);
  }
  if(!names.length)throw Error('No Surge-compatible protocols are configured');
  const used=new Set(names),main=unique(SMART,used),auto=unique(AUTO,used),preferred=automaticCandidates(names),backup=unique('🛟 پشتیبان',used);
  const groups=[main+' = select, '+[auto,backup,...names].join(', '),auto+' = url-test, '+preferred.join(', ')+', interval=300',backup+' = fallback, '+preferred.join(', ')+', interval=300'];
  const rules=['IP-CIDR,127.0.0.0/8,DIRECT,no-resolve','IP-CIDR,10.0.0.0/8,DIRECT,no-resolve','IP-CIDR,172.16.0.0/12,DIRECT,no-resolve','IP-CIDR,192.168.0.0/16,DIRECT,no-resolve'];
  if(country==='IR')rules.push('DOMAIN-SUFFIX,ir,DIRECT');else if(ir.length){const tag=unique('🇮🇷 ایران',used);groups.push(tag+' = url-test, '+ir.join(', ')+', interval=300');rules.push('DOMAIN-SUFFIX,ir,'+tag);}
  return ['[General]','loglevel = notify','ipv6 = true','proxy-test-url = https://www.gstatic.com/generate_204','','[Proxy]',...lines,'','[Proxy Group]',...groups,'','[Rule]',...rules,'FINAL,'+main,''].join('\n');
}
export function renderClientSubscription(body:string,profile:ClientProfile,country?:string):{body:string;contentType:string} {
  if(body.length>2*1024*1024)throw Error('Subscription too large');
  if(profile.format==='base64'||profile.format==='raw')return {body:uriBody(body,profile.format==='raw'),contentType:'text/plain; charset=utf-8'};
  if(profile.format==='clash')return {body:stringify(tuneClash(parse(body,{maxAliasCount:0}),profile,country)),contentType:'text/yaml; charset=utf-8'};
  if(profile.format==='surge')return {body:surgeProfile(parse(body,{maxAliasCount:0}),country),contentType:'text/plain; charset=utf-8'};
  const config=JSON.parse(body);
  if(profile.format==='sing-box')return {body:JSON.stringify(tuneSingBox(config,country),null,2),contentType:'application/json; charset=utf-8'};
  if(!Array.isArray(config)&&!Array.isArray(config?.outbounds))throw Error('Invalid Xray subscription');
  return {body:JSON.stringify(config,null,2),contentType:'application/json; charset=utf-8'};
}
/** Native accounts currently implement VLESS; build a portable sing-box profile without external rule files. */
export function nativeSingBox(links:string[]):string {
  const outbounds=links.map(link=>{const u=new URL(link),p=u.searchParams;const node:ObjectValue={type:'vless',tag:decodeURIComponent(u.hash.slice(1)),server:u.hostname.replace(/^\[|\]$/g,''),server_port:Number(u.port||443),uuid:u.username,tls:{enabled:true,server_name:p.get('sni')||u.hostname,utls:{enabled:true,fingerprint:p.get('fp')||'chrome'}},transport:{type:'ws',path:p.get('path')||'/',headers:{Host:p.get('host')||u.hostname}}};return node;});
  return JSON.stringify({log:{level:'warn'},inbounds:[{type:'mixed',tag:'local',listen:'127.0.0.1',listen_port:10808}],outbounds});
}
