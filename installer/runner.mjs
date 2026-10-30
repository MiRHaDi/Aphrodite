import {activity,report,setProgressReporter} from './progress.mjs';
import {closeDeploymentConnections} from './network.mjs';
import {prepareInstall} from './wizard.mjs';
import {buildArtifact} from './build.mjs';
import {deployCloudflare} from './cloudflare.mjs';
import {deployDocker} from './docker.mjs';
import {deployRailway} from './railway.mjs';
import {deployRender} from './render.mjs';
import {deploySSH} from './ssh.mjs';
import {deploySplit} from './topology.mjs';
import {validateOptions} from './options.mjs';
import {deployWildcardGateway,wildcardReservedHosts} from './wildcard.mjs';
import {validateCluster,restoreCluster} from './cluster.mjs';
let running=false;
export function redact(message,values){
 let result=String(message);
 for(const value of [...values].filter(value=>typeof value==='string'&&value).sort((a,b)=>b.length-a.length))result=result.replaceAll(value,'[redacted]');
 return result;
}
export async function runInstallation(input,{ui,interactive=false,environment=process.env,onProgress,onPrepared,prepare=prepareInstall,build=buildArtifact,split=deploySplit,deployers={workers:deployCloudflare,pages:deployCloudflare,docker:deployDocker,railway:deployRailway,render:deployRender,vps:deploySSH}}={}){
 if(running)throw Object.assign(Error('An installation is already running in this process'),{code:'INSTALLER_BUSY'});
 running=true;
 let prepared;
 const secrets=Object.entries(environment).filter(([key])=>/TOKEN|SECRET|PASSWORD|ADMIN_PATH|VARIABLES/.test(key)).map(([,value])=>value);
 const safe=message=>redact(message,secrets);
 const interfaceUi=ui||{step:message=>report(message,'step'),ask:async()=>{throw Object.assign(Error('Missing input; provide the required option for unattended installation'),{code:'INTERACTION_REQUIRED'});},provider:async()=>{throw Error('Specify provider');}};
 setProgressReporter(event=>{const output={...event,message:safe(event.message)};if(onProgress)onProgress(output);else interfaceUi.detail?.(output);});
 try{
  const values=validateOptions(input),profile=values['build-profile']||'current';
  if(!['current','working-baseline'].includes(profile))throw Error('Invalid --build-profile; choose current or working-baseline');
  if(profile==='working-baseline'){
   if(!values.preview&&values.provider!=='bundle')throw Error('Working baseline is an offline candidate; use --preview or --provider bundle. Remote deployment is not verified.');
   if(values.topology&&values.topology!=='standalone')throw Error('Working baseline requires --topology standalone');
   if(values.provider&&!['bundle','workers','pages'].includes(values.provider))throw Error('Working baseline supports Workers/Pages bundles only');
   values.topology='standalone';values.provider||='bundle';
  }
  prepared=await prepare(values,interfaceUi,{interactive,environment});
  const {options,env,session,provider,topology}=prepared;
  await restoreCluster(env,options,session,topology);
  validateCluster(env,topology);
  secrets.push(options.token,options.password,...(options.targets||[]).map(item=>item.token),...Object.entries(env).filter(([key])=>/TOKEN|SECRET|PASSWORD|ADMIN_PATH|EDGE_CONTROL_PATH|EDGE_PROBE_PATH|DATA_CONTROL_PATH|DATA_CONTROL_URL/.test(key)).map(([,value])=>value));
  onPrepared?.(prepared);
  if(options.wildcardDomain&&!values.preview&&provider!=='bundle')env.SUBSCRIPTION_RESERVED_HOSTS_JSON=JSON.stringify(await wildcardReservedHosts(options));
  let result;
  if(topology==='split'){
   if(!['workers','pages'].includes(provider))throw Error('Split topology currently supports Workers and Pages');
   options.connections=values.connections??options.connections;options.connectionProviders=values['connection-providers']??options.connectionProviders;options.databaseId=values['database-id']??options.databaseId;
   interfaceUi.step('Build separate management and connection services');
   result=await split(options,env,{preview:values.preview});
  }else{
   interfaceUi.step('Build and validate deployment bundle');
   const platform=profile==='working-baseline'||['workers','pages'].includes(provider)?'workers':'node';
   const role=env.DEPLOYMENT_ROLE||'standalone';
   if(!['standalone','management','database'].includes(role))throw Error('Use split topology for connection nodes');
   if(env.DATA_CONTROL_URL&&role!=='management')throw Error('Remote database clients require management role');
   const artifact=await activity('Build deployment bundle',()=>build(platform,{profile,role}));
   if(values.preview||provider==='bundle')result={provider,name:options.name,artifact:artifact.directory,...artifact.manifest,mutations:false};
   else{
    interfaceUi.step('Provision resources and verify readiness');
    result={...await activity('Deploy '+provider,()=>deployers[provider](options,env,artifact)),verified:true,verificationScope:'private-api-and-empty-root',transportVerified:false,buildId:artifact.manifest.buildId};
   }
  }
  if(options.wildcardDomain&&!values.preview&&provider!=='bundle')result={...result,wildcard:await deployWildcardGateway(options,env,result)};
  if(session&&!values.preview&&provider!=='bundle'){session.state.status='verified';await session.save();}
  result={...result,deploymentRole:topology==='split'?'management':env.DEPLOYMENT_ROLE||'standalone'};
  if(values['include-credentials']&&!values.preview&&provider!=='bundle')result={...result,credentials:env.DEPLOYMENT_ROLE==='database'?{dataControlPath:env.DATA_CONTROL_PATH,dataControlToken:env.DATA_CONTROL_TOKEN}:{administratorPath:env.ADMIN_PATH,administratorToken:env.ADMIN_TOKEN}};
  return result;
 }catch(error){
  const session=prepared?.session;
  if(session){session.state.status='paused-after-error';await session.save().catch(()=>{});report('Run the installer again and choose Resume. Saved services and user data are preserved.');report('Saved installation: '+session.path);}
  const code=error.code||(/8000119/.test(error.message)?'PROVIDER_BLOCKED':'INSTALLATION_FAILED');
  throw Object.assign(Error(safe(error.message||'Installation stopped')),{code});
 }finally{setProgressReporter(undefined);try{await closeDeploymentConnections();}finally{running=false;}}
}
