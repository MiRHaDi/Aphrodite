import {parseArgs} from 'node:util';
import {interfaceFor} from './ui.mjs';
import {configuration,name} from './common.mjs';
import {buildArtifact} from './build.mjs';
import {deployCloudflare} from './cloudflare.mjs';
import {deployDocker} from './docker.mjs';
import {deployRailway} from './railway.mjs';
import {deployRender} from './render.mjs';
import {deploySSH} from './ssh.mjs';
const optionNames=['language','provider','name','account','zone','owner','project','environment','region','plan','repo','branch','host','user','ssh-port','key','fingerprint','domain','port','origin','admin-path','token-env'];
const {values}=parseArgs({options:{...Object.fromEntries(optionNames.map(key=>[key,{type:'string'}])),help:{type:'boolean'},preview:{type:'boolean'},'project-token':{type:'boolean'}}});
if(values.help){console.log('node installer/cli.mjs --provider workers|pages|railway|render|docker|vps|bundle [--preview]\nProvider tokens: CLOUDFLARE_API_TOKEN / RAILWAY_API_TOKEN / RENDER_API_KEY.\nSSH: --host --user --fingerprint SHA256:... --key <existing key> or SSH_PASSWORD.\nUnattended: ADMIN_TOKEN and ADMIN_PATH are required. See docs/INSTALLER.fa.md.');process.exit(0);}
let ui=interfaceFor(values.language||process.env.APHRODITE_LANG||'en');
const ask=(label,secret=false)=>ui.ask(label,secret);
let env,options;
try{
  if(!values.language&&!values.provider&&!process.env.APHRODITE_LANG&&process.stdin.isTTY){const language=await ask('Language / زبان: 1 English, 2 فارسی [1]');ui=interfaceFor(['2','۲','fa'].includes(language)?'fa':'en');}
  ui.banner();ui.step(1,'Choose destination','انتخاب مقصد');
  const provider=values.provider||await ui.provider();if(!['workers','pages','railway','render','docker','vps','bundle'].includes(provider))throw Error('Unknown provider');
  if(!process.stdin.isTTY&&!values.preview&&provider!=='bundle'&&(!process.env.ADMIN_TOKEN||!(values['admin-path']||process.env.ADMIN_PATH)))throw Error('Unattended installs require ADMIN_TOKEN and ADMIN_PATH in the process environment.');
  const tokenNames={workers:'CLOUDFLARE_API_TOKEN',pages:'CLOUDFLARE_API_TOKEN',railway:values['project-token']?'RAILWAY_TOKEN':'RAILWAY_API_TOKEN',render:'RENDER_API_KEY'};
  options={...values,provider,name:name(values.name||'aphrodite-'+Date.now().toString(36)),adminPath:values['admin-path']||process.env.ADMIN_PATH,adminToken:process.env.ADMIN_TOKEN,sshPort:values['ssh-port'],projectToken:values['project-token']};
  if(values.domain&&!['vps','workers','pages'].includes(provider))throw Error('--domain is currently supported for VPS and Cloudflare only');
  if(provider==='render'&&!values.preview&&!options.plan)options.plan=await ask('Render plan with a persistent disk (for example starter; paid)');
  if(provider==='render'&&options.plan==='free')throw Error('Free Render services do not provide the persistent disk required by this installer');
  try {options.variables=JSON.parse(process.env.APHRODITE_VARIABLES||'{}');}catch{throw Error('Invalid APHRODITE_VARIABLES JSON');}
  if(!options.variables||Array.isArray(options.variables)||typeof options.variables!=='object'||Object.entries(options.variables).some(([k,v])=>!/^[A-Z][A-Z0-9_]*$/.test(k)||typeof v!=='string'||['ADMIN_PATH','ADMIN_TOKEN'].includes(k)))throw Error('Invalid advanced variables');
  ui.step(2,'Credentials stay private; input is hidden','اطلاعات ورود خصوصی است؛ ورودی توکن نمایش داده نمی‌شود');
  if(['workers','pages'].includes(provider)&&!values.preview&&process.stdout.isTTY)console.log('  Cloudflare permissions: '+(provider==='workers'?'Workers Scripts Edit':'Cloudflare Pages Edit')+' + D1 Edit.');
  if(tokenNames[provider]&&!values.preview)options.token=process.env[values['token-env']||tokenNames[provider]]||await ask(ui.pick('Provider API token','توکن API ارائه‌دهنده'),true);
  if(provider==='vps'&&!values.preview){options.host=options.host||await ask('SSH host');options.password=process.env.SSH_PASSWORD;if(!options.key&&!options.password)options.password=await ask('SSH password',true);options.fingerprint=options.fingerprint||await ask('Verified server fingerprint (SHA256:...)');}
  env=configuration(options);if(['render','railway'].includes(provider))env.TRUST_PROXY='true';
  ui.step(3,'Build and validate deployment bundle','ساخت خروجی استقرار');
  const platform=['workers','pages'].includes(provider)?'workers':'node';const artifact=await buildArtifact(platform);
  if(values.preview||provider==='bundle'){console.log(JSON.stringify({provider,name:options.name,artifact:artifact.directory,...artifact.manifest,mutations:false},null,2));process.exit(0);}
  const deploy={workers:deployCloudflare,pages:deployCloudflare,docker:deployDocker,railway:deployRailway,render:deployRender,vps:deploySSH}[provider];
  ui.step(4,'Provision and check readiness · this may take a few minutes','ایجاد منابع و بررسی سلامت؛ ممکن است چند دقیقه طول بکشد');
  const result=await deploy(options,env,artifact);
  console.log(JSON.stringify({...result,verified:true,verificationScope:'private-api-and-empty-root',transportVerified:false,buildId:artifact.manifest.buildId},null,2));
  if(process.stdout.isTTY){ui.success(ui.pick('Private API and empty-root readiness passed.','سلامت API خصوصی و پاسخ خالی ریشه تأیید شد.'));console.log('Management: '+result.url+'/'+env.ADMIN_PATH);console.log('Administrator token (save privately): '+env.ADMIN_TOKEN);console.log(ui.pick('Save both values. Outbound connectivity requires npm run test:live.','هر دو مقدار را خصوصی ذخیره کنید. آزمون اتصال خروجی با npm run test:live انجام می‌شود.'));}
}catch(error){let message=String(error.message||'Installation failed');for(const value of [options?.token,options?.password,env?.ADMIN_TOKEN,...Object.entries(env||{}).filter(([key])=>/TOKEN|SECRET|PASSWORD/.test(key)).map(([,value])=>value)])if(value)message=message.replaceAll(value,'[redacted]');console.error(message);if(env&&process.stdout.isTTY){console.log('Recovery path: /'+env.ADMIN_PATH);console.log('Recovery administrator token (save privately): '+env.ADMIN_TOKEN);}process.exitCode=1;}
