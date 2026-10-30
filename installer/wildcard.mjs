import {buildArtifact} from './build.mjs';
import {deployCloudflare} from './cloudflare.mjs';
import {jsonRequest,verify} from './common.mjs';
import {report} from './progress.mjs';
import {randomBytes} from 'node:crypto';
import {deploymentFetch} from './network.mjs';
export async function wildcardReservedHosts(options,{request=jsonRequest}={}){
 const hosts=[];let page=1;
 while(true){const data=await request('https://api.cloudflare.com/client/v4/zones/'+options.zone+'/dns_records?per_page=500&page='+page,{token:options.token});
  for(const record of data.result||[]){const suffix='.'+options.wildcardDomain;if(record.name.endsWith(suffix)){const label=record.name.slice(0,-suffix.length);if(!label.includes('.')&&label!=='*')hosts.push(label.toLowerCase());}}
  if(page++>=(data.result_info?.total_pages||1))break;
 }
 return [...new Set(hosts)].sort();
}
export async function checkWildcardTls(domain){
 const url='https://probe-'+randomBytes(8).toString('hex')+'.'+domain+'/';
 for(let attempt=0;attempt<6;attempt++){
  try{const response=await deploymentFetch(url,{signal:AbortSignal.timeout(15000)});if(response.status===404&&(await response.text())==='')return true;}catch{}
  if(attempt<5)await new Promise(resolve=>setTimeout(resolve,5000));
 }
 throw Error('Wildcard HTTPS is not ready; check DNS and the wildcard certificate before using user hostnames');
}
export async function deployWildcardGateway(options,env,central,{deploy=deployCloudflare,build=buildArtifact,request=jsonRequest,checkTls=checkWildcardTls,checkManagement=(url,settings)=>verify(url,settings,{attempts:1,delay:0,requiredConsecutive:1})}={}){
 const base='https://api.cloudflare.com/client/v4/',domain=options.wildcardDomain;
 if(!domain||!env.WILDCARD_GATEWAY_TOKEN)throw Error('Wildcard subscription configuration is incomplete');
 if(!options.zone||!options.zoneName||domain!==options.zoneName&&!domain.endsWith('.'+options.zoneName))throw Error('Wildcard domain is outside the selected DNS zone');
 if(domain!==options.zoneName&&!options.wildcardTlsReady)throw Error('Wildcard TLS certificate must be configured first');
 const name=options.name.slice(0,34)+'-subscriptions',zone=base+'zones/'+options.zone,token=options.token;
 const routes=(await request(zone+'/workers/routes',{token})).result||[],pattern='*.'+domain+'/*';
 const current=routes.find(route=>route.pattern===pattern);
 if(current&&current.script!==name)throw Error('Existing wildcard route belongs to another service; no route was replaced');
 const records=[];let page=1;
 while(true){const result=await request(zone+'/dns_records?per_page=500&page='+page,{token});records.push(...(result.result||[]));if(page++>=(result.result_info?.total_pages||1))break;}
 const target=new URL(central.url).hostname,wildcard=records.filter(record=>record.name==='*.'+domain);
 if(wildcard.length&&!(wildcard.length===1&&wildcard[0].type==='CNAME'&&wildcard[0].content.toLowerCase()===target.toLowerCase()&&wildcard[0].proxied))throw Error('Existing wildcard DNS belongs to another destination; use a dedicated subdomain');
 const excluded=[...new Set(records.map(record=>record.name).filter(host=>host.endsWith('.'+domain)&&host!=='*.'+domain))];
 const customDomains=(await request(base+'accounts/'+options.account+'/workers/domains',{token})).result||[];
 const services=new Map(customDomains.map(item=>[item.hostname,item.service]));
 const planned=excluded.filter(host=>!routes.some(route=>route.pattern===host+'/*')).map(host=>({pattern:host+'/*',...(services.get(host)?{script:services.get(host)}:{})}));
 // Keep existing Worker origins; bypass the gateway for ordinary DNS names.
 let probe=options.session?await options.session.secret('wildcard-probe'):undefined;
 if(!probe){probe=randomBytes(24).toString('hex');if(options.session)await options.session.secret('wildcard-probe',probe);}
 const artifact=await build('workers',{role:'gateway'});
 const gateway=await deploy({...options,provider:'workers',name,domain:undefined,wildcardDomain:undefined,gatewayWildcardDomain:domain,databaseId:undefined,variables:{},adminPasswordHash:undefined},{DEPLOYMENT_ROLE:'connection',WILDCARD_BASE_DOMAIN:domain,WILDCARD_UPSTREAM_URL:central.providerUrl||central.url,EDGE_CONTROL_TOKEN:env.WILDCARD_GATEWAY_TOKEN,EDGE_PROBE_PATH:probe},artifact);
 for(const body of planned)await request(zone+'/workers/routes',{token,method:'POST',body});
 if(!wildcard.length)await request(zone+'/dns_records',{token,method:'POST',body:{type:'CNAME',name:'*.'+domain,content:target,proxied:true}});
 let createdRoute;
 if(!current)createdRoute=(await request(zone+'/workers/routes',{token,method:'POST',body:{pattern,script:name}})).result?.id;
 try{await checkManagement(central.url,env);await checkTls(domain);}catch(error){
  if(createdRoute)try{await request(zone+'/workers/routes/'+encodeURIComponent(createdRoute),{token,method:'DELETE'});}catch{report('New wildcard route removal was not confirmed; inspect the saved installation before retrying','error');throw Error('Wildcard validation failed and route rollback needs confirmation');}
  throw error;
 }
 report('Wildcard subscription routing ready; existing DNS names and routes preserved');
 return {domain,gateway:gateway.url,excludedHosts:excluded.length,tlsVerified:true};
}
