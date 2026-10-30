import {clientProfile,profileHeaders} from './client-profiles';
import {nativeSingBox,renderClientSubscription} from './client-renderer';
import { subscriptionEndpoint, subscriptionEndpoints, cleanSubscriptionName, type EdgeEndpoint } from './subscription-addresses';
import { settingsFor, type NativeAccount } from './native-types';
import { adaptiveRoutingHeader } from './routing';
import { ledger } from './native-accounts';
import { text } from './responses';
import type { Env } from './types';
import {tunnelMap} from './config';
import qrcode from 'qrcode-generator';
import {subscriptionAppearance} from './native-appearance';

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
export const countryCodes=['af','al','dz','ad','ao','ag','ar','am','au','at','az','bs','bh','bd','bb','by','be','bz','bj','bt','bo','ba','bw','br','bn','bg','bf','bi','cv','kh','cm','ca','cf','td','cl','cn','co','km','cg','cd','cr','ci','hr','cu','cy','cz','dk','dj','dm','do','ec','eg','sv','gq','er','ee','sz','et','fj','fi','fr','ga','gm','ge','de','gh','gr','gd','gt','gn','gw','gy','ht','hn','hu','is','in','id','ir','iq','ie','il','it','jm','jp','jo','kz','ke','ki','kp','kr','kw','kg','la','lv','lb','ls','lr','ly','li','lt','lu','mg','mw','my','mv','ml','mt','mh','mr','mu','mx','fm','md','mc','mn','me','ma','mz','mm','na','nr','np','nl','nz','ni','ne','ng','mk','no','om','pk','pw','pa','pg','py','pe','ph','pl','pt','qa','ro','ru','rw','kn','lc','vc','ws','sm','st','sa','sn','rs','sc','sl','sg','sk','si','sb','so','za','ss','es','lk','sd','sr','se','ch','sy','tj','tz','th','tl','tg','to','tt','tn','tr','tm','tv','ug','ua','ae','gb','us','uy','uz','vu','va','ve','vn','ye','zm','zw'] as const;
export function orderedCountries(values:string[]):string[]{return [...new Set(values.map(value=>value.toLowerCase()))].sort((a,b)=>a==='smart'?-1:b==='smart'?1:countryLabel(a).localeCompare(countryLabel(b),'fa'));}
export function readableBytes(value:number):string{if(!Number.isFinite(value)||value<0)return '—';const units=['B','KB','MB','GB','TB'];let index=0,amount=value;while(amount>=1024&&index<units.length-1){amount/=1024;index++;}return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:index?2:0}).format(amount)+' '+units[index];}
function escapeHtml(value:string):string{return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));}
function browserPage(request:Request,account:NativeAccount,status:{usedBytes:number;requests:number},settings:ReturnType<typeof settingsFor>,links:string[],appearance:Awaited<ReturnType<typeof subscriptionAppearance>>):Response {
 const url=new URL(request.url),token=url.searchParams.get('token'),base=url.origin+url.pathname+(token?'?token='+encodeURIComponent(token):'');
 const rows:Array<[string,string]>=[['کاربر',account.username],['وضعیت',account.enabled?'فعال':'غیرفعال'],['مصرف',readableBytes(status.usedBytes)+(settings.dataLimitBytes?' از '+readableBytes(settings.dataLimitBytes):' · نامحدود')],['درخواست‌ها',new Intl.NumberFormat('fa-IR').format(status.requests)],['انقضا',account.expires_at?new Date(account.expires_at*1000).toLocaleDateString('fa-IR'):'بدون انقضا']];
 const options:Array<[string,string]>=[['raw','متن خام'],['base64','Base64'],['clash','Clash/Mihomo'],['sing-box','Sing-box'],['xray','Xray']];
 const {title,message,accent}=appearance;
 const html='<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(title)+'</title><style>:root{--accent:'+escapeHtml(accent)+'}*{box-sizing:border-box}body{font-family:Vazirmatn,IRANSans,Segoe UI,Tahoma,sans-serif;background:radial-gradient(circle at top right,#28214b,#0d1020 62%);color:#f8f8ff;max-width:820px;margin:0 auto;padding:28px 18px;line-height:1.7}main{background:#151a30e8;border:1px solid #ffffff1c;box-shadow:0 25px 80px #0006;border-radius:24px;padding:clamp(20px,5vw,42px)}h1{font-size:clamp(24px,4vw,35px);margin:0 0 6px;color:white}.lead{color:#c7c9df;margin:0 0 24px}table{width:100%;border-collapse:separate;border-spacing:0 8px}td{padding:13px 16px;background:#0c1020;border-block:1px solid #ffffff10}td:first-child{border-radius:0 12px 12px 0;color:#aeb3cc;width:36%}td:last-child{border-radius:12px 0 0 12px;font-variant-numeric:tabular-nums;direction:auto}.links{display:flex;flex-wrap:wrap;gap:9px;margin-top:26px}a{display:inline-flex;align-items:center;justify-content:center;color:white;background:linear-gradient(135deg,var(--accent),#4c9bff);padding:11px 14px;border-radius:12px;text-decoration:none;font-weight:650;box-shadow:0 8px 22px color-mix(in srgb,var(--accent),transparent 65%)}a:not(:first-child){background:#222943;color:#e3e7ff;box-shadow:none}.qr{display:block;background:white;border-radius:16px;padding:12px;width:min(220px,100%);margin:30px auto 15px}.foot{color:#aeb3cc;text-align:center;font-size:14px}</style><main><h1>'+escapeHtml(title)+'</h1><p class="lead">'+escapeHtml(message)+'</p><table>'+rows.map(r=>'<tr><td>'+escapeHtml(r[0])+'</td><td>'+escapeHtml(r[1])+'</td></tr>').join('')+'</table><div class="links"><a href="'+escapeHtml(base)+'">لینک اشتراک</a>'+options.map(([fmt,label])=>'<a href="'+escapeHtml(base+'&format='+fmt)+'">'+label+'</a>').join('')+'</div><img class="qr" alt="Subscription QR" src="'+escapeHtml(base+'&format=qr')+'"><p class="foot">'+new Intl.NumberFormat('fa-IR').format(links.length)+' کانفیگ فعال · سقف داده: '+(settings.dataLimitBytes?readableBytes(settings.dataLimitBytes):'نامحدود')+'</p></main></html>';
 return new Response(html,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
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
  const urlForKey=new URL(request.url),opaqueKey=urlForKey.pathname.match(/^\/([a-f0-9]{64})(?:\/[^/]+)?$/i)?.[1]||'';
  const key=urlForKey.searchParams.get('token')||opaqueKey;
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
  const links=endpoints.flatMap((e,index)=>{
    const endpointCountries=e.country&&e.country!=='smart'?[e.country]:countries;
    return nativeLinks(account,e.host,Date.now(),endpointCountries,e).map(link=>{const u=new URL(link);const label=(e.name?e.name+' · ':'')+decodeURIComponent(u.hash.slice(1));u.hash=encodeURIComponent(label+' · '+(index+1));return u.href;});
  });
  const client=clientProfile(request);
  const accepts=(request.headers.get('accept')||'').toLowerCase(),agent=(request.headers.get('user-agent')||'').toLowerCase();
  if(url.searchParams.get('format')==='qr'){const qr=qrcode(0,'M');qr.addData(url.origin+url.pathname+(url.search||''));qr.make();return new Response(qr.createSvgTag({cellSize:5,margin:8,scalable:true}),{headers:{'content-type':'image/svg+xml','cache-control':'private, no-store','x-content-type-options':'nosniff'}});}
  if(accepts.includes('text/html')&&client.family==='generic'&&!/curl|wget|python|go-http|axios|node-fetch/.test(agent))return browserPage(request,account,status,settings,links,await subscriptionAppearance(env));
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
