import {openSession} from './session.mjs';
import {configuration,name} from './common.mjs';
import {activity,report} from './progress.mjs';
import {tokenGuide} from './ui.mjs';
import {chooseCloudflareDomain,normalizeDomain} from './domains.mjs';
const providers=['workers','pages','railway','render','docker','vps','bundle'];
const tokenNames={workers:'CLOUDFLARE_API_TOKEN',pages:'CLOUDFLARE_API_TOKEN',railway:'RAILWAY_API_TOKEN',render:'RENDER_API_KEY'};
const savedKeys=['provider','name','account','zone','zoneName','subdomain','domain','connections','connectionProviders','databaseId','topology'];
export async function prepareInstall(values,ui,{sessionFactory=openSession,interactive=Boolean(process.stdin.isTTY),environment=process.env,domainChooser=chooseCloudflareDomain}={}){
 const preview=values.preview;
 let session,adding=values['add-account'];
 if(!preview&&!values['no-save']&&(!values.provider||['workers','pages'].includes(values.provider))){
  session=await sessionFactory({path:values.state,fresh:values.new});
  if(session.state.options.name&&interactive&&!values.resume&&!values.new&&!adding){
   const action=(await ui.ask('Saved '+session.state.options.name+': [R]esume, [A]dd account, [N]ew installation [R]')).toLowerCase();
   if(action==='n')session=await sessionFactory({path:values.state,fresh:true});
   else if(action==='a')adding=true;
  }
 }
 const saved=session?.state.options||{};
 const choose=async(label,value,fallback)=>value!==undefined?value:interactive?(await ui.ask(label+' ['+(fallback||'')+']'))||fallback:fallback;
 ui.step('Resolve deployment destination');
 const provider=values.provider||(interactive?await ui.provider(saved.provider||'workers'):saved.provider);if(!provider)throw Error('Specify --provider or resume a saved installation');if(!providers.includes(provider))throw Error('Unknown provider');
 if(!['workers','pages'].includes(provider))session=undefined;
 const installationName=name(await choose('Installation name',values.name,saved.name||'aphrodite-'+Date.now().toString(36)));
 if(session&&Object.keys(session.state.services).length&&(provider!==saved.provider||installationName!==saved.name))throw Error('Changing an existing management destination requires --new; its current users and database are preserved');
 const options={...values,provider,name:installationName,account:values.account||saved.account,zone:values.zone||saved.zone,domain:values.domain||saved.domain,connections:(adding?saved.connections:values.connections)||saved.connections||'2',connectionProviders:(adding?saved.connectionProviders:values['connection-providers'])||saved.connectionProviders||'workers,pages',databaseId:values['database-id']||saved.databaseId,session};
 options.zoneName=values['base-domain']||saved.zoneName;options.subdomain=values.subdomain??saved.subdomain;
 if(values.domain){options.zoneName=undefined;options.subdomain=undefined;if(!values.zone)options.zone=undefined;}
 if(values['base-domain']||values.subdomain!==undefined){options.domain=undefined;if(values['base-domain']!==saved.zoneName&&!values.zone)options.zone=undefined;}
 if(values['domain-conflict']&&!['reuse','new','fail'].includes(values['domain-conflict']))throw Error('domain-conflict must be reuse, new or fail');
 if(['reuse','new'].includes(values['domain-conflict']))options.askDomain=async()=>values['domain-conflict']==='reuse'?'1':'2';
 else if(interactive&&values['domain-conflict']!=='fail')options.askDomain=label=>ui.ask(label);
 const topology=values.topology||saved.topology||(['workers','pages'].includes(provider)?'split':'standalone');
 options.topology=topology;
 if(session&&Object.keys(session.state.services).length){if(saved.topology&&topology!==saved.topology)throw Error('Changing an existing topology requires --new; saved user data is preserved');if(saved.account&&values.account&&values.account!==saved.account)throw Error('Use Add account to extend this installation; its management account is preserved');}
 if(topology==='split'&&!adding){
  options.connections=await choose('Connection services for primary profile (1-8)',values.connections,saved.connections||'2');
  options.connectionProviders=await choose('Connection providers',values['connection-providers'],saved.connectionProviders||'workers,pages');
 }
 if(!['split','standalone'].includes(topology))throw Error('Unknown topology');
 if(adding&&!session)throw Error('Adding account profiles requires saved installation checkpoints');
 if(adding&&topology!=='split')throw Error('Adding account profiles requires Cloudflare split topology');
 if(session&&session.state.profiles.length>1&&Number(options.connections)<Number(saved.connections))throw Error('Resume does not remove existing subscription nodes; keep the saved connection count or add a new profile');
 if(session){session.state.options=Object.fromEntries(savedKeys.filter(k=>options[k]!==undefined).map(k=>[k,options[k]]));session.state.status='configuring';await session.save();}
 report('Destination: '+provider+' | deployment name: '+options.name);
 ui.step('Configure provider access and credentials');
 if(values.domain&&!['vps','workers','pages'].includes(provider))throw Error('--domain is supported for VPS and Cloudflare');
 if((values['base-domain']||values.subdomain!==undefined)&&!['workers','pages'].includes(provider))throw Error('--base-domain and --subdomain are supported for Cloudflare');
 if(preview||provider==='bundle')report('Preview/build-only mode: provider credentials are not required');
 if(tokenNames[provider]&&!preview){
  const envName=values['token-env']||(provider==='railway'&&values['project-token']?'RAILWAY_TOKEN':tokenNames[provider]);
  const stored=session?await activity('Read provider credentials from system storage',()=>session.secret('provider-token')):undefined;
  const fallback=environment[envName]||stored;
  if(interactive&&!fallback&&['workers','pages'].includes(provider))tokenGuide();
  options.token=interactive?(await ui.ask('Provider API token'+(fallback?' [saved/environment; Enter to keep]':'')))||fallback:fallback;
  if(!options.token)throw Error('Provider token is required; enter it interactively or set '+envName);
  if(session&&options.token!==stored)await activity('Save provider token in system credential storage',()=>session.secret('provider-token',options.token));
  if(['workers','pages'].includes(provider)){options.account=await choose('Cloudflare account ID (blank to auto-detect)',values.account,saved.account||'');if(Object.keys(session?.state.services||{}).length&&saved.account&&options.account!==saved.account)throw Error('Use Add account to extend the existing installation; its management account is preserved');}
 }
 if(options.domain)options.domain=normalizeDomain(options.domain);
 if(!preview&&!adding&&['workers','pages'].includes(provider)){
  const configure=interactive?(options.domain||options.zoneName||!saved.name||(await ui.ask('Configure a custom hostname for this installation? [y/N]')).toLowerCase()==='y'):(options.domain||options.zoneName)&&(!options.zone||!options.zoneName||!options.domain);
  if(configure)await domainChooser(options,ui,{interactive});
  report(options.domain?'Custom hostname: '+options.domain+' | DNS zone: '+options.zone:'Custom hostname not selected; using provider addresses');
 }
 if(provider==='render'&&!preview){options.plan=options.plan||await ui.ask('Render plan with persistent disk (paid; for example starter)');if(options.plan==='free')throw Error('Render persistent disk requires a paid plan');}
 if(provider==='vps'&&!preview){options.host=options.host||await ui.ask('SSH host');options.sshPort=values['ssh-port'];options.password=environment.SSH_PASSWORD;if(!options.key&&!options.password)options.password=await ui.ask('SSH password',true);options.fingerprint=options.fingerprint||await ui.ask('Verified SSH fingerprint (SHA256:...)');}
 let variables=environment.APHRODITE_VARIABLES;
 if(!variables&&session)variables=await session.secret('advanced-variables');
 try{options.variables=JSON.parse(variables||'{}');}catch{throw Error('Invalid APHRODITE_VARIABLES JSON');}
 if(!options.variables||Array.isArray(options.variables)||typeof options.variables!=='object'||Object.entries(options.variables).some(([k,v])=>!/^[A-Z][A-Z0-9_]*$/.test(k)||typeof v!=='string'||['ADMIN_PATH','ADMIN_TOKEN'].includes(k)))throw Error('Invalid advanced variables');
 let administrator=session?await session.secret('administrator'):undefined;
 if(administrator)administrator=JSON.parse(administrator);
 if(session&&Object.keys(session.state.services).length&&!administrator)throw Error('Saved administrator credentials are unavailable. Restore the system credential store before resuming');
 if(!interactive&&!preview&&provider!=='bundle'&&!administrator&&(!environment.ADMIN_TOKEN||!(values['admin-path']||environment.ADMIN_PATH)))throw Error('Unattended first installation requires ADMIN_TOKEN and ADMIN_PATH');
 if(values['no-save']&&!preview&&['workers','pages'].includes(provider)&&(!environment.ADMIN_TOKEN||!(values['admin-path']||environment.ADMIN_PATH)))throw Error('--no-save requires ADMIN_TOKEN and ADMIN_PATH so recovery credentials are not lost');
 const env=configuration({...options,adminPath:administrator?.path||values['admin-path']||environment.ADMIN_PATH,adminToken:administrator?.token||environment.ADMIN_TOKEN});
 if(['render','railway'].includes(provider))env.TRUST_PROXY='true';
 if(session){
  if(!administrator)await activity('Save administrator credentials securely',()=>session.secret('administrator',JSON.stringify({path:env.ADMIN_PATH,token:env.ADMIN_TOKEN})));
  if(variables)await session.secret('advanced-variables',variables);
  session.state.options=Object.fromEntries(savedKeys.filter(k=>options[k]!==undefined).map(k=>[k,options[k]]));
  session.state.profiles||=[];
  if(!session.state.profiles.length)session.state.profiles.push({id:'primary',account:options.account,connections:options.connections,providers:options.connectionProviders});
  Object.assign(session.state.profiles[0],{account:options.account,connections:options.connections,providers:options.connectionProviders});
  if(adding){
   const id='p'+session.state.profiles.length;
   const token=environment[values['connection-token-env']||'CLOUDFLARE_CONNECTION_TOKEN']||(interactive?await ui.ask('Additional account API token'):undefined);
   if(!token)throw Error('Additional account token required: set CLOUDFLARE_CONNECTION_TOKEN or --connection-token-env');
   await activity('Save additional account token securely',()=>session.secret('profile-'+id,token));
   const account=await choose('Additional Cloudflare account ID',values['connection-account'],'');
   const connections=await choose('Number of additional connections (1-8)',values.connections,'2');
   const connectionProviders=await choose('Additional connection providers',values['connection-providers'],'workers,pages');
   session.state.profiles.push({id,account,connections,providers:connectionProviders});
  }
  options.targets=[];
  for(const profile of session.state.profiles){
   let token=profile.id==='primary'?options.token:await session.secret('profile-'+profile.id);
   if(profile.id!=='primary'&&interactive&&!adding){const changed=await ui.ask('API token for profile '+profile.id+' [saved; Enter to keep]');if(changed){token=changed;await session.secret('profile-'+profile.id,token);}}
   if(!token)throw Error('Token missing for profile '+profile.id+'; restore credentials or enter it interactively');
   options.targets.push({...profile,token});
  }
  await session.save();report('Installation checkpoints: '+session.path);
 }
 report('Administrator configuration prepared; existing credentials are reused on resume');
 return {provider,options,env,session,topology};
}
