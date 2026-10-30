import {jsonRequest} from './common.mjs';
export function domainParts(domain,zoneName){
 const host=normalizeDomain(domain),zone=normalizeDomain(zoneName);
 if(host!==zone&&!host.endsWith('.'+zone))throw Error('Hostname is outside the selected DNS domain');
 return {zoneName:zone,subdomain:host===zone?'@':host.slice(0,-zone.length-1)};
}
export async function availablePagesDomain(domain,target,readRecords,{zoneName,projectName='app'}={}){
 const original=normalizeDomain(domain);
 // A DNS zone is authoritative; never guess a registrable domain by splitting labels.
 const relative=zoneName?domainParts(original,zoneName).subdomain:undefined;
 for(let attempt=0;attempt<50;attempt++){
  let candidate=original;
  if(attempt){
   if(!zoneName)throw Error('The selected DNS domain is required before choosing a new subdomain');
   const labels=(relative==='@'?projectName:relative).split('.'),label=labels.shift();
   const number=relative==='@'?attempt:attempt+1;
   labels.unshift(number===1?label:label.slice(0,59)+'-'+number);
   candidate=normalizeDomain(labels.join('.')+'.'+zoneName);
  }
  const records=await readRecords(candidate);
  if(!records.length||pagesDnsMatches(records,target))return candidate;
 }
 throw Error('No free custom hostname found after 50 DNS checks; existing records were preserved');
}
export function pagesDnsMatches(records,target){
 const addresses=records.filter(record=>['A','AAAA','CNAME'].includes(record.type));
 return addresses.length>0&&addresses.every(record=>record.type==='CNAME'&&String(record.content).toLowerCase().replace(/\.$/,'')===target.toLowerCase().replace(/\.$/,''));
}
export async function selectPagesDomain(domain,target,readRecords,ask,context={}){
 if(context.zoneName)domainParts(domain,context.zoneName);
 const records=await readRecords(domain);
 if(!records.length)return {domain};
 if(!ask){
  if(pagesDnsMatches(records,target))return {domain};
  throw Object.assign(Error('Custom hostname is already configured; choose domain-conflict reuse, new or fail'),{code:'DOMAIN_DECISION_REQUIRED'});
 }
 const replaceable=records.length===1&&['A','AAAA','CNAME'].includes(records[0].type);
 const addresses=records.filter(record=>['A','AAAA','CNAME'].includes(record.type));
 const summary=addresses.length?addresses.map(record=>record.type+' '+record.content).join(', '):'No A/AAAA/CNAME record';
 let choice;
 do{choice=(await ask('Existing hostname '+domain+': '+summary+(records.length>addresses.length?'\nOther DNS records are preserved.':'')+'\n1) Reuse this hostname'+(pagesDnsMatches(records,target)?' (keep existing DNS)':' (replace its DNS target; old service traffic will move here)')+'\n2) Choose another subdomain within '+(context.zoneName||'the selected domain')+'\nChoose 1 or 2'+(pagesDnsMatches(records,target)?' [1]':''))).trim()||(pagesDnsMatches(records,target)?'1':'');}while(!['1','2'].includes(choice));
 if(choice==='2')return {domain:await availablePagesDomain(domain,target,async candidate=>candidate===domain?[{type:'RESERVED'}]:readRecords(candidate),context)};
 if(pagesDnsMatches(records,target))return {domain};
 if(!replaceable)throw Error('This hostname contains multiple or non-address DNS records; choose another hostname to preserve those records');
 return {domain,replacement:{...records[0]}};
}
export async function bindPagesDns(domain,target,{readRecords,createRecord,replaceRecord},replacement){
 const records=await readRecords(domain);
 if(!records.length||pagesDnsMatches(records,target)){
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
export async function listCloudflareZones(options,{request=jsonRequest}={}){
 const base='https://api.cloudflare.com/client/v4/';
 const zones=[];let page=1;
 while(true){
  const data=await request(base+'zones?per_page=50&page='+page+(options.account?'&account.id='+encodeURIComponent(options.account):''),{token:options.token});
  zones.push(...(data.result||[]));if(page>=(data.result_info?.total_pages||1))break;page++;
 }
 return zones;
}
export async function chooseCloudflareDomain(options,ui,{request=jsonRequest,interactive=false}={}){
 const zones=await listCloudflareZones(options,{request});
 if(!zones.length){ui.detail({level:'info',message:'No accessible DNS zones; keep provider hostname or supply --domain and --zone.'});return;}
 let answer=options.domain;
 let zone;
 if(interactive||!answer){
  const matching=zones.filter(item=>item.name===options.zoneName||options.domain===item.name||options.domain?.endsWith('.'+item.name)).sort((a,b)=>b.name.length-a.name.length);
  const preferred=zones.find(item=>item.id===options.zone)||zones.find(item=>item.name===options.zoneName)||matching[0];
  const defaultIndex=preferred?zones.indexOf(preferred)+1:undefined;
  const menu=zones.map((item,index)=>(index+1)+') '+item.name).join('\n');
  let selected;
  if(!interactive&&options.zoneName){selected=zones.find(item=>item.name===options.zoneName);if(!selected)throw Error('Selected DNS domain is not accessible');}
  else{
  while(true){
   const choice=(await ui.ask('Choose DNS domain by number'+(defaultIndex?' ['+defaultIndex+']':'')+' (0 keeps provider hostname):\n'+menu)).trim()||(defaultIndex?String(defaultIndex):'0');
   if(choice==='0'){delete options.domain;delete options.zone;delete options.zoneName;delete options.subdomain;return;}
   if(/^[1-9][0-9]*$/.test(choice)&&Number(choice)<=zones.length){selected=zones[Number(choice)-1];break;}
  }
  }
  let fallback=options.subdomain||options.name;
  if(options.domain&&(options.domain===selected.name||options.domain.endsWith('.'+selected.name)))fallback=domainParts(options.domain,selected.name).subdomain;
  const subdomain=(interactive||!options.zoneName?(await ui.ask('Subdomain ['+fallback+'] (Enter keeps this choice; @ uses the domain root)')).trim():options.subdomain)||fallback;
  if(!subdomain||subdomain!=='@'&&!subdomain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))throw Error('Enter a valid subdomain');
  answer=subdomain==='@'?selected.name:subdomain+'.'+selected.name;zone=selected;
 }
 const domain=normalizeDomain(answer),matches=zones.filter(z=>domain===z.name||domain.endsWith('.'+z.name)).sort((a,b)=>b.name.length-a.name.length);
 zone||=matches[0];if(!zone)throw Error('Hostname does not belong to an accessible DNS zone');
 if(options.account&&zone.account?.id!==options.account)throw Error('DNS zone belongs to another Cloudflare account');
 const parts=domainParts(domain,zone.name);
 options.domain=domain;options.zone=zone.id;options.zoneName=parts.zoneName;options.subdomain=parts.subdomain;options.account=options.account||zone.account?.id;
}
