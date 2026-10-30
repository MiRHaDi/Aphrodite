import {activity,report,setProgressReporter} from './progress.mjs';
import {parseArgs} from 'node:util';
import {interfaceFor} from './ui.mjs';
import {showInstallationResult} from './installation-result.mjs';
import {closeDeploymentConnections} from './network.mjs';
import {prepareInstall} from './wizard.mjs';
import {buildArtifact} from './build.mjs';
import {deployCloudflare} from './cloudflare.mjs';
import {deployDocker} from './docker.mjs';
import {deployRailway} from './railway.mjs';
import {deployRender} from './render.mjs';
import {deploySSH} from './ssh.mjs';
import {deploySplit} from './topology.mjs';
const optionNames=['provider','name','account','zone','owner','project','environment','region','plan','repo','branch','host','user','ssh-port','key','fingerprint','domain','port','origin','admin-path','token-env','topology','connections','connection-providers','database-id','state','connection-account','connection-token-env','build-profile'];
let values;try{({values}=parseArgs({options:{...Object.fromEntries(optionNames.map(key=>[key,{type:'string'}])),help:{type:'boolean'},resume:{type:'boolean'},new:{type:'boolean'},'add-account':{type:'boolean'},'no-save':{type:'boolean'},repair:{type:'boolean'},preview:{type:'boolean'},'project-token':{type:'boolean'},'result-page':{type:'boolean'}}}));}catch{console.error('Invalid installer option. Run node installer/cli.mjs --help for supported options.');process.exit(2);}
if(values.help){console.log('node installer/cli.mjs --provider workers|pages|railway|render|docker|vps|bundle [--preview]\nResume: --resume; repair owned services: --repair; add another account: --add-account --connection-token-env NAME --connection-account ID. Checkpoints: --state PATH; explicit fresh install: --new; disable persistence: --no-save.\nCloudflare defaults to split: one management + two connection services. Options: --connections 1..8 --connection-providers workers,pages --database-id UUID; --topology standalone for a single service.\nResults: exits after completion by default; --result-page keeps a private copy-token page open.\nCustom hostname: --domain HOST [--zone ZONE_ID]; interactive resume can configure a missing hostname.\nOffline working baseline: --build-profile working-baseline --provider bundle --preview.\nProvider tokens: CLOUDFLARE_API_TOKEN / RAILWAY_API_TOKEN / RENDER_API_KEY.\nSSH: --host --user --fingerprint SHA256:... --key <existing key> or SSH_PASSWORD.\nUnattended: ADMIN_TOKEN and ADMIN_PATH are required. See docs/INSTALLER.fa.md.');process.exit(0);}
const ui=interfaceFor();
let env,options,session;
async function showResult(result){await showInstallationResult(result,env,{ui,interactiveCard:Boolean(values['result-page'])});}

try{
  setProgressReporter(event=>ui.detail(event));
  ui.banner();
  const buildProfile=values['build-profile']||'current';
  if(!['current','working-baseline'].includes(buildProfile))throw Error('Invalid --build-profile; choose current or working-baseline');
  if(buildProfile==='working-baseline'){
    if(!values.preview&&values.provider!=='bundle')throw Error('Working baseline is an offline candidate; use --preview or --provider bundle. Remote deployment is not verified.');
    if(values.topology&&values.topology!=='standalone')throw Error('Working baseline requires --topology standalone');
    if(values.provider&&!['bundle','workers','pages'].includes(values.provider))throw Error('Working baseline supports Workers/Pages bundles only');
    values.topology='standalone';values.provider=values.provider||'bundle';
  }
  const prepared=await prepareInstall(values,ui);
  ({env,options,session}=prepared);const {provider,topology}=prepared;
  if(topology==='split'){
    if(!['workers','pages'].includes(provider))throw Error('Split topology currently supports Workers and Pages');
    options.connections=values.connections??options.connections;options.connectionProviders=values['connection-providers']??options.connectionProviders;options.databaseId=values['database-id']??options.databaseId;
    ui.step('Build separate management and connection services');
    const result=await deploySplit(options,env,{preview:values.preview});console.log(JSON.stringify(result,null,2));
    if(session){session.state.status='verified';await session.save();}
    if(!values.preview&&process.stdout.isTTY)await showResult(result);
  }else{
  ui.step('Build and validate deployment bundle');
  const platform=buildProfile==='working-baseline'||['workers','pages'].includes(provider)?'workers':'node';const artifact=await activity('Build deployment bundle',()=>buildArtifact(platform,{profile:buildProfile}));
  if(values.preview||provider==='bundle'){console.log(JSON.stringify({provider,name:options.name,artifact:artifact.directory,...artifact.manifest,mutations:false},null,2));process.exit(0);}
  const deploy={workers:deployCloudflare,pages:deployCloudflare,docker:deployDocker,railway:deployRailway,render:deployRender,vps:deploySSH}[provider];
  ui.step('Provision resources and verify readiness');
  const result=await activity('Deploy '+provider,()=>deploy(options,env,artifact));
  console.log(JSON.stringify({...result,verified:true,verificationScope:'private-api-and-empty-root',transportVerified:false,buildId:artifact.manifest.buildId},null,2));
  if(process.stdout.isTTY)await showResult(result);
  }
}catch(error){
 let message=String(error.message||'Installation stopped');
 const secrets=[options?.token,options?.password,env?.ADMIN_TOKEN,...(options?.targets||[]).map(profile=>profile.token),...Object.entries(env||{}).filter(([key])=>/TOKEN|SECRET|PASSWORD/.test(key)).map(([,value])=>value)];
 for(const value of secrets)if(value)message=message.replaceAll(value,'[redacted]');
 report(message,'error');
 if(session){session.state.status='paused-after-error';await session.save().catch(()=>{});report('Run the installer again and choose Resume. Saved services and user data are preserved.');report('Saved installation: '+session.path);}
 else report('Correct the issue and run the installer again. No existing database was deleted.');
 process.exitCode=1;
}finally{setProgressReporter(undefined);ui.close();await closeDeploymentConnections();}
