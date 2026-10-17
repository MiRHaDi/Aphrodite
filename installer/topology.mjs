import {activity,report} from './progress.mjs';
import {randomBytes} from 'node:crypto';
import {buildArtifact} from './build.mjs';
import {deployCloudflare} from './cloudflare.mjs';
import {jsonRequest,name} from './common.mjs';
export function splitPlan(options){
 const count=Number(options.connections??2);if(!Number.isInteger(count)||count<1||count>8)throw Error('--connections must be 1 through 8');
 const prefix=name(options.name).slice(0,38);
 const providers=(options.connectionProviders||'workers,pages').split(',');
 if(!providers.length||providers.some(p=>!['workers','pages'].includes(p)))throw Error('Connection providers must be workers,pages');
 return {management:{name:prefix+'-control',provider:options.provider},connections:Array.from({length:count},(_,i)=>({name:prefix+'-connect-'+(i+1),provider:providers[i%providers.length]}))};
}
export async function deploySplit(options,env,{preview=false,deploy=deployCloudflare}={}){
 const plan=splitPlan(options);
 report('Topology: one management service and '+plan.connections.length+' database-free connection services');
 const management=await activity('Build management service',()=>buildArtifact('workers',{role:'management'})),connection=await activity('Build connection service',()=>buildArtifact('workers',{role:'connection'}));
 if(preview){report('Preview complete; no cloud resources were changed','done');return {topology:'split',plan,artifacts:[management.manifest,connection.manifest],mutations:false};}
 const token=options.token;let account=options.account;
 if(!account){const accounts=(await jsonRequest('https://api.cloudflare.com/client/v4/accounts',{token})).result;if(accounts.length!==1)throw Error('Specify --account');account=accounts[0].id;}
 const subdomain=(await jsonRequest('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/subdomain',{token})).result.subdomain;
 const origin=(item)=>'https://'+item.name+(item.provider==='workers'?'.'+subdomain+'.workers.dev':'.pages.dev');
 const pool=plan.connections.map(item=>{const host=new URL(origin(item)).hostname;return {address:host,sni:host,host}});
 const secret=randomBytes(32).toString('base64url'),controlPath=randomBytes(24).toString('hex');
 const centralEnv={...env,DEPLOYMENT_ROLE:'management',EDGE_CONTROL_TOKEN:secret,EDGE_CONTROL_PATH:controlPath,EDGE_ENDPOINTS_JSON:JSON.stringify(pool),CONNECTION_ENDPOINTS_JSON:JSON.stringify(pool)};
 // Deploy the control plane first and stop immediately on any provider restriction.
 report('Builds complete; deploy and verify management before connection services','step');
 const central=await deploy({...options,...plan.management,account,databaseId:options.databaseId},centralEnv,management);
 report('Management is ready; provision connection services','done');
 const edges=[];
 for(const [index,item] of plan.connections.entries()){
  report('Deploy connection '+(index+1)+'/'+plan.connections.length+' ('+item.provider+')');
  const routing=Object.fromEntries(['NATIVE_RELAY_UUID','TUNNEL_ROUTES_JSON'].filter(key=>env[key]).map(key=>[key,env[key]]));
  const edgeEnv={...routing,DEPLOYMENT_ROLE:'connection',NATIVE_ENABLED:'true',EDGE_CONTROL_URL:central.url+'/'+controlPath,EDGE_CONTROL_TOKEN:secret,EDGE_PROBE_PATH:randomBytes(24).toString('hex')};
  edges.push(await deploy({...options,...item,account,domain:undefined,zone:undefined,databaseId:undefined},edgeEnv,connection));
 }
 return {topology:'split',url:central.url,database:central.database,connections:edges.map(e=>({url:e.url})),verified:true,transportVerified:false};
}
