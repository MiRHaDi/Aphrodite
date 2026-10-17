import {activity,report,setProgressReporter} from './progress.mjs';
import {parseArgs} from 'node:util';
import {interfaceFor,tokenGuide,terminalLink} from './ui.mjs';
import {resultCard} from './result-card.mjs';
import {closeDeploymentConnections} from './network.mjs';
import {configuration,name} from './common.mjs';
import {buildArtifact} from './build.mjs';
import {deployCloudflare} from './cloudflare.mjs';
import {deployDocker} from './docker.mjs';
import {deployRailway} from './railway.mjs';
import {deployRender} from './render.mjs';
import {deploySSH} from './ssh.mjs';
import {deploySplit} from './topology.mjs';
const optionNames=['provider','name','account','zone','owner','project','environment','region','plan','repo','branch','host','user','ssh-port','key','fingerprint','domain','port','origin','admin-path','token-env','topology','connections','connection-providers','database-id'];
const {values}=parseArgs({options:{...Object.fromEntries(optionNames.map(key=>[key,{type:'string'}])),help:{type:'boolean'},preview:{type:'boolean'},'project-token':{type:'boolean'}}});
if(values.help){console.log('node installer/cli.mjs --provider workers|pages|railway|render|docker|vps|bundle [--preview]\nCloudflare defaults to split: one management + two connection services. Options: --connections 1..8 --connection-providers workers,pages --database-id UUID; --topology standalone for a single service.\nProvider tokens: CLOUDFLARE_API_TOKEN / RAILWAY_API_TOKEN / RENDER_API_KEY.\nSSH: --host --user --fingerprint SHA256:... --key <existing key> or SSH_PASSWORD.\nUnattended: ADMIN_TOKEN and ADMIN_PATH are required. See docs/INSTALLER.fa.md.');process.exit(0);}
const ui=interfaceFor();
const ask=(label,secret=false)=>ui.ask(label,secret);
let env,options;
async function showResult(result){
 const management=result.url+'/'+env.ADMIN_PATH;
 ui.success('Installation verified');
 console.log('\n  Management: '+terminalLink(management));
 for(const node of result.connections||[])console.log('  Connection service: '+terminalLink(node.url));
 try{
  const card=await resultCard({management,token:env.ADMIN_TOKEN,connections:(result.connections||[]).map(n=>n.url)});
  console.log('  Administrator token: '+terminalLink(card.url,env.ADMIN_TOKEN));
  console.log('  Open result and copy token: '+terminalLink(card.url));
  console.log('  Private result page stays available for 10 minutes while this process runs. Click its token to copy. Ctrl+C closes it.');
 }catch{console.log('  Administrator token (save privately): '+env.ADMIN_TOKEN);}
 console.log('  Readiness is verified; outbound transport still needs npm run test:live.');
}
try{
  setProgressReporter(event=>ui.detail(event));
  ui.banner();ui.step('Resolve deployment destination');
  const provider=values.provider||await ui.provider();if(!['workers','pages','railway','render','docker','vps','bundle'].includes(provider))throw Error('Unknown provider');
  if(!process.stdin.isTTY&&!values.preview&&provider!=='bundle'&&(!process.env.ADMIN_TOKEN||!(values['admin-path']||process.env.ADMIN_PATH)))throw Error('Unattended installs require ADMIN_TOKEN and ADMIN_PATH in the process environment.');
  const tokenNames={workers:'CLOUDFLARE_API_TOKEN',pages:'CLOUDFLARE_API_TOKEN',railway:values['project-token']?'RAILWAY_TOKEN':'RAILWAY_API_TOKEN',render:'RENDER_API_KEY'};
  options={...values,provider,name:name(values.name||'aphrodite-'+Date.now().toString(36)),adminPath:values['admin-path']||process.env.ADMIN_PATH,adminToken:process.env.ADMIN_TOKEN,sshPort:values['ssh-port'],projectToken:values['project-token']};
  report('Destination: '+provider+' | deployment name: '+options.name);
  if(values.domain&&!['vps','workers','pages'].includes(provider))throw Error('--domain is currently supported for VPS and Cloudflare only');
  if(provider==='render'&&!values.preview&&!options.plan)options.plan=await ask('Render plan with a persistent disk (for example starter; paid)');
  if(provider==='render'&&options.plan==='free')throw Error('Free Render services do not provide the persistent disk required by this installer');
  try {options.variables=JSON.parse(process.env.APHRODITE_VARIABLES||'{}');}catch{throw Error('Invalid APHRODITE_VARIABLES JSON');}
  if(!options.variables||Array.isArray(options.variables)||typeof options.variables!=='object'||Object.entries(options.variables).some(([k,v])=>!/^[A-Z][A-Z0-9_]*$/.test(k)||typeof v!=='string'||['ADMIN_PATH','ADMIN_TOKEN'].includes(k)))throw Error('Invalid advanced variables');
  ui.step('Configure provider access and credentials');
  if(['workers','pages'].includes(provider)&&!values.preview&&process.stdout.isTTY)console.log('  Cloudflare permissions: '+'Workers Scripts Edit + Cloudflare Pages Edit + D1 Edit for the default split topology.');
  if(values.preview||provider==='bundle')report('Preview/build-only mode: provider credentials are not required');
  if(tokenNames[provider]&&!values.preview){
    options.token=process.env[values['token-env']||tokenNames[provider]];
    report(options.token?'Using provider credentials from process environment':'Request provider credentials interactively');
    if(!options.token){if(['workers','pages'].includes(provider))tokenGuide();options.token=await ask('Provider API token');}
  }
  if(provider==='vps'&&!values.preview){options.host=options.host||await ask('SSH host');options.password=process.env.SSH_PASSWORD;if(!options.key&&!options.password)options.password=await ask('SSH password',true);options.fingerprint=options.fingerprint||await ask('Verified server fingerprint (SHA256:...)');}
  env=configuration(options);if(['render','railway'].includes(provider))env.TRUST_PROXY='true';
  report('Administrator configuration prepared; secret values excluded from progress');
  const topology=values.topology||(['workers','pages'].includes(provider)?'split':'standalone');
  if(!['split','standalone'].includes(topology))throw Error('Unknown topology');
  if(topology==='split'){
    if(!['workers','pages'].includes(provider))throw Error('Split topology currently supports Workers and Pages');
    options.connections=values.connections;options.connectionProviders=values['connection-providers'];options.databaseId=values['database-id'];
    ui.step('Build separate management and connection services');
    const result=await deploySplit(options,env,{preview:values.preview});console.log(JSON.stringify(result,null,2));
    if(!values.preview&&process.stdout.isTTY)await showResult(result);
  }else{
  ui.step('Build and validate deployment bundle');
  const platform=['workers','pages'].includes(provider)?'workers':'node';const artifact=await activity('Build deployment bundle',()=>buildArtifact(platform));
  if(values.preview||provider==='bundle'){console.log(JSON.stringify({provider,name:options.name,artifact:artifact.directory,...artifact.manifest,mutations:false},null,2));process.exit(0);}
  const deploy={workers:deployCloudflare,pages:deployCloudflare,docker:deployDocker,railway:deployRailway,render:deployRender,vps:deploySSH}[provider];
  ui.step('Provision resources and verify readiness');
  const result=await activity('Deploy '+provider,()=>deploy(options,env,artifact));
  console.log(JSON.stringify({...result,verified:true,verificationScope:'private-api-and-empty-root',transportVerified:false,buildId:artifact.manifest.buildId},null,2));
  if(process.stdout.isTTY)await showResult(result);
  }
}catch(error){let message=String(error.message||'Installation failed');for(const value of [options?.token,options?.password,env?.ADMIN_TOKEN,...Object.entries(env||{}).filter(([key])=>/TOKEN|SECRET|PASSWORD/.test(key)).map(([,value])=>value)])if(value)message=message.replaceAll(value,'[redacted]');report('Installation stopped: '+message,'error');if(env&&process.stdout.isTTY){console.log('Recovery path: /'+env.ADMIN_PATH);console.log('Recovery administrator token (save privately): '+env.ADMIN_TOKEN);}process.exitCode=1;}finally{setProgressReporter(undefined);ui.close();await closeDeploymentConnections();}
