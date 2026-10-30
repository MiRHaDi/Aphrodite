import {jsonRequest} from './common.mjs';
export async function availablePagesDomain(domain,target,readRecords){
 const original=normalizeDomain(domain),parts=original.split('.'),label=parts.shift(),suffix=parts.join('.');
 for(let attempt=0;attempt<50;attempt++){
  const candidate=attempt?label.slice(0,59)+'-'+(attempt+1)+'.'+suffix:original;
  const records=await readRecords(candidate);
  if(records.every(record=>record.type==='CNAME'&&String(record.content).toLowerCase().replace(/\.$/,'')===target.toLowerCase().replace(/\.$/,'')))return candidate;
 }
 throw Error('No free custom hostname found after 50 DNS checks; existing records were preserved');
}
export function pagesDnsMatches(records,target){
 return records.every(record=>record.type==='CNAME'&&String(record.content).toLowerCase().replace(/\.$/,'')===target.toLowerCase().replace(/\.$/,''));
}
export async function selectPagesDomain(domain,target,readRecords,ask){
 const records=await readRecords(domain);
 if(!records.length)return {domain};
 if(!ask){
  if(pagesDnsMatches(records,target))return {domain};
  throw Error('Custom hostname is already configured; run interactively to reuse it or choose another hostname');
 }
 const replaceable=records.length===1&&['A','AAAA','CNAME'].includes(records[0].type);
 let choice;
 do{choice=(await ask('Existing hostname '+domain+': '+records.map(record=>record.type+' '+record.content).join(', ')+'\n1) Reuse this hostname'+(pagesDnsMatches(records,target)?' (keep existing DNS)':' (replace its DNS target; old service traffic will move here)')+'\n2) Choose an available numbered hostname\nChoose 1 or 2'+(pagesDnsMatches(records,target)?' [1]':''))).trim()||(pagesDnsMatches(records,target)?'1':'');}while(!['1','2'].includes(choice));
 if(choice==='2')return {domain:await availablePagesDomain(domain,target,async candidate=>candidate===domain?[{type:'RESERVED'}]:readRecords(candidate))};
 if(pagesDnsMatches(records,target))return {domain};
 if(!replaceable)throw Error('This hostname contains multiple or non-address DNS records; choose another hostname to preserve those records');
 return {domain,replacement:{...records[0]}};
}
export async function bindPagesDns(domain,target,{readRecords,createRecord,replaceRecord},replacement){
 const records=await readRecords(domain);
 if(pagesDnsMatches(records,target)){
  if(!records.length)await createRecord({type:'CNAME',name:domain,content:target,proxied:true});
  return;
 }
 if(!replacement||records.length!==1||['id','type','content','name'].some(key=>records[0][key]!==replacement[key]))throw Error('DNS changed after selection; resume to confirm the current record. No DNS record was overwritten');
 await replaceRecord(replacement.id,{type:'CNAME',name:domain,content:target,proxied:true,ttl:1});
}
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
