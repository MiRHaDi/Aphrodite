import {parseArgs} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {configuration,name} from './common.mjs';
import {buildArtifact} from './build.mjs';
import {deployCloudflare} from './cloudflare.mjs';
import {deployDocker} from './docker.mjs';
import {deployRailway} from './railway.mjs';
import {deployRender} from './render.mjs';
import {deploySSH} from './ssh.mjs';
const optionNames=['provider','name','account','zone','owner','project','environment','region','plan','repo','branch','host','user','ssh-port','key','fingerprint','domain','port','origin','admin-path','token-env'];
const {values}=parseArgs({options:{...Object.fromEntries(optionNames.map(key=>[key,{type:'string'}])),help:{type:'boolean'},preview:{type:'boolean'},'project-token':{type:'boolean'}}});
if(values.help){console.log('node installer/cli.mjs --provider workers|pages|railway|render|docker|vps|bundle [--preview]\nProvider tokens: CLOUDFLARE_API_TOKEN / RAILWAY_API_TOKEN / RENDER_API_KEY.\nSSH: --host --user --fingerprint SHA256:... --key <existing key> or SSH_PASSWORD.\nUnattended: ADMIN_TOKEN and ADMIN_PATH are required. See docs/INSTALLER.fa.md.');process.exit(0);}
async function ask(label,secret=false){if(!process.stdin.isTTY)throw Error('Missing interactive input: '+label);process.stdout.write(label+': ');const output=secret?new Writable({write(chunk,encoding,done){done();}}):process.stdout;const reader=createInterface({input:process.stdin,output,terminal:true});try{return (await reader.question('')).trim();}finally{reader.close();if(secret)process.stdout.write('\n');}}
let env,options;
try{
  const provider=values.provider||await ask('Provider (workers/pages/railway/render/docker/vps/bundle)');if(!['workers','pages','railway','render','docker','vps','bundle'].includes(provider))throw Error('Unknown provider');
  if(!process.stdin.isTTY&&!values.preview&&provider!=='bundle'&&(!process.env.ADMIN_TOKEN||!(values['admin-path']||process.env.ADMIN_PATH)))throw Error('Unattended installs require ADMIN_TOKEN and ADMIN_PATH in the process environment.');
  const tokenNames={workers:'CLOUDFLARE_API_TOKEN',pages:'CLOUDFLARE_API_TOKEN',railway:values['project-token']?'RAILWAY_TOKEN':'RAILWAY_API_TOKEN',render:'RENDER_API_KEY'};
  options={...values,provider,name:name(values.name||'aphrodite-'+Date.now().toString(36)),adminPath:values['admin-path']||process.env.ADMIN_PATH,adminToken:process.env.ADMIN_TOKEN,sshPort:values['ssh-port'],projectToken:values['project-token']};
  if(values.domain&&!['vps','workers','pages'].includes(provider))throw Error('--domain is currently supported for VPS and Cloudflare only');
  if(provider==='render'&&!values.preview&&!options.plan)options.plan=await ask('Render plan with a persistent disk (for example starter; paid)');
  if(provider==='render'&&options.plan==='free')throw Error('Free Render services do not provide the persistent disk required by this installer');
  try {options.variables=JSON.parse(process.env.APHRODITE_VARIABLES||'{}');}catch{throw Error('Invalid APHRODITE_VARIABLES JSON');}
  if(!options.variables||Array.isArray(options.variables)||typeof options.variables!=='object'||Object.entries(options.variables).some(([k,v])=>!/^[A-Z][A-Z0-9_]*$/.test(k)||typeof v!=='string'||['ADMIN_PATH','ADMIN_TOKEN'].includes(k)))throw Error('Invalid advanced variables');
  if(tokenNames[provider]&&!values.preview)options.token=process.env[values['token-env']||tokenNames[provider]]||await ask('Provider API token',true);
  if(provider==='vps'&&!values.preview){options.host=options.host||await ask('SSH host');options.password=process.env.SSH_PASSWORD;if(!options.key&&!options.password)options.password=await ask('SSH password',true);options.fingerprint=options.fingerprint||await ask('Verified server fingerprint (SHA256:...)');}
  env=configuration(options);if(['render','railway'].includes(provider))env.TRUST_PROXY='true';
  console.log('Building deployment bundle...');
  const platform=['workers','pages'].includes(provider)?'workers':'node';const artifact=await buildArtifact(platform);
  if(values.preview||provider==='bundle'){console.log(JSON.stringify({provider,name:options.name,artifact:artifact.directory,...artifact.manifest,mutations:false},null,2));process.exit(0);}
  const deploy={workers:deployCloudflare,pages:deployCloudflare,docker:deployDocker,railway:deployRailway,render:deployRender,vps:deploySSH}[provider];
  const result=await deploy(options,env,artifact);
  console.log(JSON.stringify({...result,verified:true,verificationScope:'private-api-and-empty-root',transportVerified:false,buildId:artifact.manifest.buildId},null,2));
  if(process.stdout.isTTY){console.log('Management: '+result.url+'/'+env.ADMIN_PATH);console.log('Administrator token (save privately): '+env.ADMIN_TOKEN);}
}catch(error){let message=String(error.message||'Installation failed');for(const value of [options?.token,options?.password,env?.ADMIN_TOKEN,...Object.entries(env||{}).filter(([key])=>/TOKEN|SECRET|PASSWORD/.test(key)).map(([,value])=>value)])if(value)message=message.replaceAll(value,'[redacted]');console.error(message);if(env&&process.stdout.isTTY){console.log('Recovery path: /'+env.ADMIN_PATH);console.log('Recovery administrator token (save privately): '+env.ADMIN_TOKEN);}process.exitCode=1;}
