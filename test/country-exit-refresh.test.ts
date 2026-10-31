import {expect,it} from 'vitest';
import {countryExits,countryProxies} from '../src/country-exits';
// @ts-expect-error Node runtime module deliberately stays out of the Worker bundle.
import {candidate,createCountryRefresher} from '../runtime/country-exit-refresh.mjs';
const item={status:'live',proxy_norm:'http://8.8.8.8:8080',country:'DE'};
const source=(items:typeof item[])=>async(url:string)=>url.endsWith('/countries')?Response.json({countries:[...new Set(items.map(x=>x.country))].map(code=>({code,protocols:{http:1}}))}):Response.json({items:items.filter(x=>x.country===new URL(url).searchParams.get('country'))});
it('rejects credentials, private/reserved destinations and unsupported transports',()=>{
 for(const proxy_norm of ['http://127.0.0.1:80','http://169.254.169.254:80','http://10.0.0.1:80','http://192.0.2.1:80','http://u:p@8.8.8.8:80','socks5://8.8.8.8:80','http://localhost:80'])expect(candidate({...item,proxy_norm})).toBeNull();
 expect(candidate(item)).toEqual({proxy:'http://8.8.8.8:8080/',country:'de'});
});
it('publishes only verified candidates, removes a failing old candidate, expires routes without wrong-country fallback',async()=>{
 let clock=1000;
 const env={AUTO_COUNTRY_EXITS:'true',VERIFIED_COUNTRY_EXITS_JSON:JSON.stringify([{proxy:'http://9.9.9.9:80/',country:'us',expires:999999}])};
 const refresh=createCountryRefresher({env,now:()=>clock,fetchSource:source([item,{...item,proxy_norm:'http://9.9.9.9:80',country:'US'}]),verify:async(x:{country:string})=>x.country==='de'});
 await refresh.refresh();expect(Object.keys(countryExits(env,clock))).toEqual(['de']);
 expect(()=>countryProxies(env,'us',clock)).toThrow();
 clock+=7*60*60*1000;expect(countryExits(env,clock)).toEqual({});expect(()=>countryProxies(env,'de',clock)).toThrow();
 expect(countryProxies(env,'smart',clock)).toBeUndefined();
});
it('rotates across country batches instead of starving countries beyond a global top list',async()=>{
 let clock=1000;const env={COUNTRY_EXIT_BATCH:'2',VERIFIED_COUNTRY_EXITS_JSON:'[]'};
 const rows=['US','DE','CA','JP','CH'].map((country,i)=>({...item,country,proxy_norm:'http://8.8.8.'+(i+1)+':8080'}));
 const refresh=createCountryRefresher({env,now:()=>clock,fetchSource:source(rows),verify:async()=>true});
 for(let i=0;i<3;i++){await refresh.refresh();clock+=1800001}
 expect(Object.keys(countryExits(env,clock)).sort()).toEqual(['ca','ch','de','jp','us']);
});
it('keeps unexpired good routes on source outage but does not renew them; coalesces concurrent refreshes',async()=>{
 let calls=0,clock=1000;
 const env={VERIFIED_COUNTRY_EXITS_JSON:JSON.stringify([{proxy:'http://8.8.8.8:8080/',country:'de',expires:5000}])};
 const refresh=createCountryRefresher({env,now:()=>clock,fetchSource:async()=>{calls++;throw Error('offline')}});
 await Promise.all([refresh.refresh(),refresh.refresh()]);expect(calls).toBe(1);expect(countryExits(env,clock).de).toHaveLength(1);
 clock=2000000;await refresh.refresh();expect(countryExits(env,clock)).toEqual({});
 refresh.stop();await refresh.refresh();expect(calls).toBe(2);
});
