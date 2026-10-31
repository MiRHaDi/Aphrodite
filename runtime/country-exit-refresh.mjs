import {ProxyAgent,fetch as proxyFetch} from 'undici';

export const SOURCE='https://proxycheck.app/api/v1/public-proxies?protocol=http&quality=full&limit=32&sort=uptime_desc';
export const COUNTRIES_SOURCE='https://proxycheck.app/api/v1/public-proxies/countries';
const TTL=6*60*60*1000;
export function candidate(row){
 try{
  if(row.status!=='live'||!/^([A-Z]{2})$/.test(row.country))return null;
  const u=new URL(row.proxy_norm),parts=u.hostname.split('.').map(Number);
  if(u.protocol!=='http:'||u.username||u.password||!u.port||u.pathname!=='/'||u.search||u.hash||parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return null;
  const [a,b,c]=parts;
  if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113||a===100&&b>=64&&b<=127)return null;
  return {proxy:u.href,country:row.country.toLowerCase()};
 }catch{return null}
}
async function boundedJson(response){
 if(!response.ok)throw Error('Source unavailable');
 const reader=response.body.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>262144)throw Error('Response too large');text+=decoder.decode(part.value,{stream:true})}return JSON.parse(text+decoder.decode())}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
export async function verifyCandidate(item){
 const agent=new ProxyAgent({uri:item.proxy,requestTls:{rejectUnauthorized:true},proxyTls:{rejectUnauthorized:true}});
 const signal=AbortSignal.timeout(8000);
 try{
  // Synthetic requests only. No user UUID, token, cookie or subscription is sent.
  const geo=await boundedJson(await proxyFetch('https://ipinfo.io/json',{dispatcher:agent,signal,redirect:'error'}));
  if(typeof geo.country!=='string'||geo.country.toLowerCase()!==item.country)throw Error('Exit country mismatch');
  for(const url of ['https://www.google.com/generate_204','https://www.cloudflare.com/cdn-cgi/trace']){
   const r=await proxyFetch(url,{dispatcher:agent,signal,redirect:'error'});
   try{if(url.includes('google.com')?r.status!==204:r.status!==200)throw Error('HTTPS probe failed')}
   finally{await r.body?.cancel()}
  }
  return true;
 }finally{await agent.destroy()}
}
export function createCountryRefresher({env,fetchSource=fetch,verify=verifyCandidate,now=Date.now,report=()=>{}}){
 let pending=null,next=0,stopped=false,cursor=0;
 const refresh=()=>{
  if(stopped||now()<next)return pending||Promise.resolve();
  if(pending)return pending;
  pending=(async()=>{
   const summary={sourceAvailable:false,candidates:0,passed:0,failed:0,verified:0};
   let previous=[];try{const saved=JSON.parse(env.VERIFIED_COUNTRY_EXITS_JSON||'[]');if(Array.isArray(saved))previous=saved}catch{}
   const live=new Map(previous.filter(x=>x.expires>now()).map(x=>[x.proxy,x]));
   try{
    const catalog=await boundedJson(await fetchSource(COUNTRIES_SOURCE,{signal:AbortSignal.timeout(10000),redirect:'error'}));
    if(!Array.isArray(catalog.countries))throw Error('Invalid country catalog');
    const codes=[...new Set(catalog.countries.slice(0,256).filter(x=>/^[A-Z]{2}$/.test(x.code)&&Number(x.protocols?.http)>0).map(x=>x.code))].sort();
    const batch=Math.min(32,Math.max(1,Number(env.COUNTRY_EXIT_BATCH)||32)),selected=[];
    for(let i=0;i<Math.min(batch,codes.length);i++)selected.push(codes[(cursor+i)%codes.length]);
    cursor=codes.length?(cursor+selected.length)%codes.length:0;
    const discovered=[];
    for(let offset=0;offset<selected.length;offset+=2)await Promise.all(selected.slice(offset,offset+2).map(async code=>{
     try{
      const url=new URL(SOURCE);url.searchParams.set('country',code);url.searchParams.set('limit','2');
      const data=await boundedJson(await fetchSource(url.href,{signal:AbortSignal.timeout(10000),redirect:'error'}));
      if(Array.isArray(data.items))discovered.push(...data.items.slice(0,2).filter(x=>x.country===code));
     }catch{/* One country's source outage must not suppress other countries. */}
    }));
    const items=[...new Map(discovered.map(candidate).filter(Boolean).map(x=>[x.proxy,x])).values()];
    summary.sourceAvailable=true;summary.candidates=items.length;
    for(let offset=0;offset<items.length;offset+=2)await Promise.all(items.slice(offset,offset+2).map(async item=>{
     try{if(await verify(item)){live.set(item.proxy,{...item,expires:now()+TTL});summary.passed++;return}}catch{}
     summary.failed++;
     live.delete(item.proxy);
    }));
    next=now()+30*60*1000;
   }catch{next=now()+30*60*1000}
   // Keep at most two verified exits per country, not the first countries in a global list.
   const counts=new Map();
   env.VERIFIED_COUNTRY_EXITS_JSON=JSON.stringify([...live.values()].filter(x=>x.expires>now()).sort((a,b)=>b.expires-a.expires).filter(x=>{const n=counts.get(x.country)||0;counts.set(x.country,n+1);return n<2}).slice(0,512));
   summary.verified=JSON.parse(env.VERIFIED_COUNTRY_EXITS_JSON).length;report(summary);
  })().finally(()=>{pending=null});
  return pending;
 };
 return {refresh,stop(){stopped=true},get pending(){return pending}};
}
