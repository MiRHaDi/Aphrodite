import {activity,report} from './progress.mjs';
import {randomBytes} from 'node:crypto';
import {buildArtifact} from './build.mjs';
import {deployCloudflare} from './cloudflare.mjs';
import {jsonRequest,name} from './common.mjs';
import {deploymentFetch} from './network.mjs';
import {connectionDomain} from './domains.mjs';
export function splitPlan(options){
 const prefix=name(options.name).slice(0,38),connections=[];
 const targets=options.targets||[{id:'primary',connections:options.connections??2,providers:options.connectionProviders||'workers,pages',account:options.account,token:options.token}];
 for(const target of targets){
  const count=Number(target.connections??2),providers=(target.providers||'workers,pages').split(','),countries=(target.countries||options.connectionCountries||'smart,us,nl,de,sg,tr,ir').split(',').map(v=>v.trim()).filter(Boolean),protocols=(target.protocols||options.connectionProtocols||'VLESS · WS').split(',').map(v=>v.trim()).filter(Boolean);
  if(!Number.isInteger(count)||count<1||count>8)throw Error('--connections must be 1 through 8 per account profile');
  if(!providers.length||providers.some(p=>!['workers','pages'].includes(p)))throw Error('Connection providers must be workers,pages');
  if(!/^[a-z0-9-]{1,8}$/.test(target.id||'primary'))throw Error('Invalid profile identifier');
  for(let i=0;i<count;i++)connections.push({name:(target.id&&target.id!=='primary'?prefix.slice(0,30)+'-'+target.id:prefix)+'-connect-'+(i+1),provider:providers[i%providers.length],profile:target.id||'primary',country:countries[i%countries.length]||'smart',protocols});
 }
 if(connections.length>64)throw Error('A shared subscription supports at most 64 connection services');
 return {management:{name:prefix+'-control',provider:options.provider},connections};
}
export async function registerConnections(central,env,endpoints){
 return activity('Register verified connections in shared subscriptions',async()=>{
  const current=await deploymentFetch(central.url+'/'+env.ADMIN_PATH+'/api/deployment/connections',{headers:{authorization:'Bearer '+env.ADMIN_TOKEN},signal:AbortSignal.timeout(20000)});
  if(current.ok){const data=await current.json();if(Array.isArray(data.endpoints)&&endpoints.every(endpoint=>data.endpoints.some(saved=>JSON.stringify(saved)===JSON.stringify(endpoint)))){report('Connections already registered; no subscription settings changed');return {ok:true,unchanged:true};}}
  const response=await deploymentFetch(central.url+'/'+env.ADMIN_PATH+'/api/deployment/connections',{method:'POST',headers:{authorization:'Bearer '+env.ADMIN_TOKEN,'content-type':'application/json'},body:JSON.stringify({endpoints}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Connection is deployed but registration failed (HTTP '+response.status+'); resume to retry registration');
  const data=await response.json();if(!data.ok)throw Error('Connection registration was not confirmed');return data;
 });
}
export async function deploySplit(options,env,{preview=false,deploy=deployCloudflare,register=registerConnections}={}){
 const plan=splitPlan(options);
 report('Topology: one management service and '+plan.connections.length+' database-free connection services');
 const identity=(role)=>[options.name,options.domain||'',options.provider,role].join('|');
 const management=await activity('Build management service',()=>buildArtifact('workers',{role:'management',identity:identity('management')})),connection=await activity('Build connection service',()=>buildArtifact('workers',{role:'connection',identity:identity('connection')}));
 if(preview){report('Preview complete; no cloud resources were changed','done');return {topology:'split',plan,artifacts:[management.manifest,connection.manifest],mutations:false};}
 const token=options.token;let account=options.account;
 const resolveAccount=async token=>{const accounts=(await jsonRequest('https://api.cloudflare.com/client/v4/accounts',{token})).result;if(accounts.length!==1)throw Error('Specify the Cloudflare account ID');return accounts[0].id;};
 if(!account)account=await resolveAccount(token);
 options.account=account;
 if(options.session){options.session.state.options.account=account;await options.session.save();}
 const profiles=options.targets||[{id:'primary',token,account}];
 const resolved=new Map();
 for(const profile of profiles){resolved.set(profile.id||'primary',{...profile,account:profile.account||(profile.id==='primary'?account:await resolveAccount(profile.token||token)),token:profile.token||token});}
 if(options.session){for(const profile of options.session.state.profiles){const resolvedProfile=resolved.get(profile.id);if(resolvedProfile)profile.account=resolvedProfile.account;}await options.session.save();}
 let secret=randomBytes(32).toString('base64url'),controlPath=randomBytes(24).toString('hex');
 if(options.session){
  const saved=await options.session.secret('split-control');
  if(!saved&&options.session.state.secrets['split-control'])throw Error('Shared connection credentials are missing; restore system credential storage');
  if(saved)({secret,controlPath}=JSON.parse(saved));
  else await activity('Save shared connection credentials securely',()=>options.session.secret('split-control',JSON.stringify({secret,controlPath})));
 }
 const centralEnv={...env,DEPLOYMENT_ROLE:'management',EDGE_CONTROL_TOKEN:secret,EDGE_CONTROL_PATH:controlPath,EDGE_ENDPOINTS_JSON:'[]',CONNECTION_ENDPOINTS_JSON:'[]'};
 report('Builds complete; deploy and verify management before connection services','step');
 const central=await deploy({...options,...plan.management,domainProjectName:options.name,account,databaseId:options.databaseId},centralEnv,management);
 if(options.domain)options.domain=new URL(central.url).hostname;
 report('Management is ready; provision connection services','done');
 const edges=[];
 for(const [index,item] of plan.connections.entries()){
  const profile=resolved.get(item.profile);
  report('Deploy connection '+(index+1)+'/'+plan.connections.length+' ('+item.provider+', profile '+item.profile+')');
  const routing=Object.fromEntries(['NATIVE_RELAY_UUID','TUNNEL_ROUTES_JSON'].filter(key=>env[key]).map(key=>[key,env[key]]));
  const edgeEnv={...routing,DEPLOYMENT_ROLE:'connection',NATIVE_ENABLED:'true',EDGE_CONTROL_URL:central.url+'/'+controlPath,EDGE_CONTROL_TOKEN:secret,EDGE_PROBE_PATH:randomBytes(24).toString('hex')};
  // Custom DNS is scoped to the management account; additional accounts retain their own provider URLs.
  const domain=options.domain&&profile.account===account?connectionDomain(options.domain,index,item.profile):undefined;
  const result=await deploy({...options,...item,variables:routing,adminPasswordHash:undefined,account:profile.account,token:profile.token,domain,zone:domain?options.zone:undefined,databaseId:undefined},edgeEnv,connection);
  edges.push(result);const host=new URL(result.url).hostname;
  await register(central,centralEnv,[{address:host,sni:host,host,id:item.name,name:item.name,country:item.country,protocols:item.protocols}]);
 }
 return {topology:'split',url:central.url,providerUrl:central.providerUrl,database:central.database,connections:edges.map(e=>({url:e.url})),verified:true,transportVerified:false};
}
