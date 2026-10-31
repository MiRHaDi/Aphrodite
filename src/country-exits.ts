import type {Env} from './types';

// Only the server-side verifier publishes this value. Never accept it from a client.
type ExitEnvironment=Pick<Env,'AUTO_COUNTRY_EXITS'|'VERIFIED_COUNTRY_EXITS_JSON'>;
export function countryExits(env:ExitEnvironment,now=Date.now()):Record<string,string[]>{
 try{
  const rows=JSON.parse(env.VERIFIED_COUNTRY_EXITS_JSON||'[]') as unknown;
  if(!Array.isArray(rows))return {};
  const result:Record<string,string[]>={};
  for(const row of rows.slice(0,512)){
   if(!row||typeof row.country!=='string'||!/^([a-z]{2})$/.test(row.country)||!Number.isFinite(row.expires)||row.expires<=now||typeof row.proxy!=='string')continue;
   const url=new URL(row.proxy);
   if(url.protocol!=='http:'||url.username||url.password||!url.port||url.pathname!=='/'||url.search||url.hash)continue;
   (result[row.country]||=[]).push(row.proxy);
  }
  return result;
 }catch{return {}}
}
export function countryProxies(env:ExitEnvironment,country:string,now=Date.now()):string[]|undefined{
 if(env.AUTO_COUNTRY_EXITS!=='true'||country==='smart')return undefined;
 const exits=countryExits(env,now),key=country==='turkey'?'tr':country;
 // An advertised country must never silently fall back to another country.
 if(!exits[key]?.length)throw Error('Verified country exit unavailable');
 return exits[key];
}
