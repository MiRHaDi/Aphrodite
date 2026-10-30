import {jsonRequest} from './common.mjs';
export function normalizeDomain(value){
 const host=String(value||'').trim().toLowerCase();
 if(host.length>253||!host.includes('.')||!host.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)))throw Error('Enter a DNS hostname without a scheme, port or path');
 return host;
}
export function connectionDomain(domain,index,profile='primary'){
 const host=normalizeDomain(domain);
 if(!Number.isInteger(index)||index<0||!/^[a-z0-9-]{1,8}$/.test(profile))throw Error('Invalid connection domain identifier');
 return normalizeDomain('connect-'+profile+'-'+(index+1)+'.'+host);
}
export async function chooseCloudflareDomain(options,ui,{request=jsonRequest}={}){
 const base='https://api.cloudflare.com/client/v4/';
 const zones=[];let page=1;
 while(true){
  const data=await request(base+'zones?per_page=50&page='+page+(options.account?'&account.id='+encodeURIComponent(options.account):''),{token:options.token});
  zones.push(...(data.result||[]));if(page>=(data.result_info?.total_pages||1))break;page++;
 }
 if(!zones.length){ui.detail({level:'info',message:'No accessible DNS zones; keep provider hostname or supply --domain and --zone.'});return;}
 let answer=options.domain;
 if(!answer){
  const menu=zones.map((zone,index)=>(index+1)+') '+zone.name).join('\n');
  let selected;
  while(true){
   const choice=(await ui.ask('Choose DNS domain by number (Enter or 0 keeps provider hostname):\n'+menu)).trim();
   if(!choice||choice==='0')return;
   if(/^[1-9][0-9]*$/.test(choice)&&Number(choice)<=zones.length){selected=zones[Number(choice)-1];break;}
  }
  const subdomain=(await ui.ask('Subdomain ['+options.name+'] (Enter keeps project name)')).trim()||options.name;
  if(!subdomain||!subdomain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))throw Error('Enter a valid subdomain');
  answer=subdomain+'.'+selected.name;
 }
 const domain=normalizeDomain(answer),matches=zones.filter(z=>domain===z.name||domain.endsWith('.'+z.name)).sort((a,b)=>b.name.length-a.name.length);
 const zone=matches[0];if(!zone)throw Error('Hostname does not belong to an accessible DNS zone');
 if(options.account&&zone.account?.id!==options.account)throw Error('DNS zone belongs to another Cloudflare account');
 options.domain=domain;options.zone=zone.id;options.account=options.account||zone.account?.id;
}
