import {clientProfile,profileHeaders} from './client-profiles';
import {nativeSingBox,renderClientSubscription} from './client-renderer';
import { subscriptionEndpoint, subscriptionEndpoints, cleanSubscriptionName, type EdgeEndpoint } from './subscription-addresses';
import { settingsFor, type NativeAccount } from './native-types';
import { adaptiveRoutingHeader } from './routing';
import { ledger } from './native-accounts';
import { text } from './responses';
import type { Env } from './types';
import {tunnelMap} from './config';

export function selectedAddresses(account:NativeAccount,host:string,now=Date.now()):string[]{
  const settings=settingsFor(account),pool=[...new Set(settings.addresses)];if(!pool.length)return [host];
  const epoch=settings.rotationMinutes?Math.floor(now/(settings.rotationMinutes*60000)):0;
  const offset=(epoch+account.uuid.split('').reduce((sum,char)=>sum+char.charCodeAt(0),0))%pool.length;
  return Array.from({length:Math.min(settings.addressCount,pool.length)},(_,index)=>pool[(offset+index)%pool.length]!);
}
export function countryLabel(country:string):string{
 if(country==='smart')return '🧠 Smart';
 const code=(country==='turkey'?'TR':country.toUpperCase());
 if(!/^[A-Z]{2}$/.test(code))return country;
 const flag=String.fromCodePoint(...[...code].map(c=>127397+c.charCodeAt(0)));
 const name=new Intl.DisplayNames(['en'],{type:'region'}).of(code)||code;
 return flag+' '+name;
}
export function configuredCountries(routes:Record<string,unknown[]>,relay:boolean):string[]{
 if(!relay)return ['smart'];
 return ['smart',...Object.keys(routes).filter(path=>/^\/edge\/(?:[a-z]{2}|turkey)$/.test(path)&&routes[path]?.length).map(path=>path.slice(6)).sort()];
}
export function nativeLinks(account:NativeAccount,host:string,now=Date.now(),countries=['smart'],endpoint?:EdgeEndpoint):string[]{
  const settings=settingsFor(account);const links:string[]=[];
  for(const country of countries)for(const [index,address] of selectedAddresses(account,endpoint?.address||host,now).entries())for(const port of settings.ports){
    const url=new URL('vless://'+account.uuid+'@'+(address.includes(':')?'['+address.replace(/^\[|\]$/g,'')+']':address)+':'+port);
    for(const [key,value] of Object.entries({encryption:'none',security:'tls',sni:endpoint?.sni||host,host:endpoint?.host||host,type:'ws',path:country==='smart'?'/edge/native':'/edge/native/'+country,fp:settings.fingerprint,alpn:'http/1.1',allowInsecure:'0'}))url.searchParams.set(key,value);
    if(settings.fragment.enabled)url.searchParams.set('fragment',settings.fragment.length+','+settings.fragment.interval+',tlshello');
    url.hash=encodeURIComponent(cleanSubscriptionName('Aphrodite · '+countryLabel(country)+' · '+account.username+' · '+(index+1)+' / '+port)+' · '+(links.length+1));links.push(url.href);
  }return links;
}
function base64(value:string):string{let binary='';for(const byte of new TextEncoder().encode(value))binary+=String.fromCharCode(byte);return btoa(binary)}
export async function nativeSubscription(request:Request,env:Env,account:NativeAccount):Promise<Response>{
  const key=new URL(request.url).searchParams.get('token')||'';
  if(!account.subscription_key||key.length!==account.subscription_key.length)return text('Not found',404);
  let difference=0;for(let i=0;i<key.length;i++)difference|=key.charCodeAt(i)^account.subscription_key.charCodeAt(i);
  if(difference)return text('Not found',404);
  const now=Math.floor(Date.now()/1000),settings=settingsFor(account);
  if(!account.enabled||(account.expires_at!==null&&account.expires_at<=now))return text('Account disabled or expired',403,{'cache-control':'no-store'});
  const response=await ledger(env,account);if(!response.ok)return text('Accounting unavailable',503);
  const status=await response.json() as {usedBytes:number;requests:number};
  if((settings.dataLimitBytes&&status.usedBytes>=settings.dataLimitBytes)||(settings.requestLimit&&status.requests>=settings.requestLimit))return text('Account quota exceeded',403,{'cache-control':'no-store'});
  const routes=tunnelMap(env),countries=configuredCountries(routes,Boolean(env.NATIVE_RELAY_UUID));
  const url=new URL(request.url),edgeEnv={...env,PUBLIC_EDGE_HOST:env.PUBLIC_EDGE_HOST||url.hostname},endpoint=subscriptionEndpoint(edgeEnv,account.username),host=endpoint.host;
  const endpoints=[endpoint,...subscriptionEndpoints(edgeEnv).filter(e=>e.address!==endpoint.address||e.sni!==endpoint.sni||e.host!==endpoint.host)];
  const links=endpoints.flatMap((e,index)=>nativeLinks(account,e.host,Date.now(),countries,e).map(link=>{const u=new URL(link);u.hash=encodeURIComponent(decodeURIComponent(u.hash.slice(1))+' · '+(index+1));return u.href;}));
  const client=clientProfile(request);
  const format=client.format;
  let body='';
  if(format==='clash'){
    const proxies=links.map((link,index)=>{const u=new URL(link);return {name:decodeURIComponent(u.hash.slice(1)),type:'vless',server:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port||443),uuid:account.uuid,tls:true,servername:u.searchParams.get('sni'),'client-fingerprint':settings.fingerprint,network:'ws',udp:false,'ws-opts':{path:u.searchParams.get('path'),headers:{Host:u.searchParams.get('host')}}}});
    const config={ 'mixed-port':7890,mode:'rule',proxies,'proxy-groups':[{name:'🧠 هوشمند',type:'url-test',proxies:proxies.map(proxy=>proxy.name),url:'https://www.gstatic.com/generate_204',interval:300,tolerance:50}],rules:['IP-CIDR,127.0.0.0/8,DIRECT','IP-CIDR,10.0.0.0/8,DIRECT','IP-CIDR,172.16.0.0/12,DIRECT','IP-CIDR,192.168.0.0/16,DIRECT',...(request.cf?.country==='IR'?['DOMAIN-SUFFIX,ir,DIRECT']:[]),'MATCH,🧠 هوشمند'] };
    // JSON is valid YAML 1.2 and avoids external geo databases.
    body=JSON.stringify(config,null,2);
  }else if(format==='xray'){
    body=JSON.stringify(links.map((link,index)=>{const u=new URL(link);return {remarks:decodeURIComponent(u.hash.slice(1)),log:{loglevel:'warning'},inbounds:[{listen:'127.0.0.1',port:10808,protocol:'socks',settings:{udp:false}}],outbounds:[{tag:'proxy',protocol:'vless',settings:{vnext:[{address:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port||443),users:[{id:account.uuid,encryption:'none'}]}]},streamSettings:{network:'ws',security:'tls',tlsSettings:{serverName:u.searchParams.get('sni'),fingerprint:settings.fingerprint,allowInsecure:false},wsSettings:{path:u.searchParams.get('path'),headers:{Host:u.searchParams.get('host')}}}},{tag:'direct',protocol:'freedom'}]}}),null,2);
  }else if(format==='sing-box')body=nativeSingBox(links);
  else if(format==='surge')return text('No Surge-compatible native protocols are configured',406,{'cache-control':'no-store'});
  else if(format==='raw')body=links.join('\n');else if(format==='base64')body=base64(links.join('\n'));else return text('Unsupported subscription format',400);
  const country=typeof request.cf?.country==='string'?request.cf.country:undefined;
  let rendered:ReturnType<typeof renderClientSubscription>;
  try{rendered=renderClientSubscription(body,client,country);}catch{return text('No compatible subscription format',406,{'cache-control':'no-store'});}
  const headers=profileHeaders(client,new Headers({'content-type':rendered.contentType,'cache-control':'private, no-store','subscription-userinfo':`upload=0; download=${status.usedBytes}; total=${settings.dataLimitBytes}; expire=${account.expires_at||0}`,routing:adaptiveRoutingHeader(country),'x-aphrodite-engine':'native'}),env.PROFILE_UPDATE_INTERVAL||'6');
  return new Response(rendered.body,{status:200,headers});
}
