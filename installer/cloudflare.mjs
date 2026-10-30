import {activity,report} from './progress.mjs';
import {readFile,readdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {jsonRequest,required,run,root,verify} from './common.mjs';
import {lockArtifact} from './address-lock.mjs';
import {availablePagesDomain} from './domains.mjs';
const base='https://api.cloudflare.com/client/v4/';
export async function deployCloudflare(options,env,artifact){
  report('Configure '+options.provider+' service: '+options.name+' | role: '+(env.DEPLOYMENT_ROLE||'standalone'));
  const token=required(options.token,'Cloudflare token');
  let account=options.account;
  if(!account){const accounts=(await jsonRequest(base+'accounts',{token})).result;if(accounts.length!==1)throw Error('Specify --account when the token can access zero or multiple accounts');account=accounts[0].id;}
  if(!/^[a-f0-9]{32}$/.test(account))throw Error('Invalid account id');
  const prefix='accounts/'+account+'/';
  const session=options.session,key=account+'/'+options.provider+'/'+options.name;
  const previous=session?.state.services[key];
  const record=previous||{provider:options.provider,account,name:options.name,owner:randomUUID(),migrations:[]};
  const checkpoint=async()=>{if(session){session.state.services[key]=record;await session.save();}};
  const secretName='service-'+record.owner;
  if(previous){const saved=await session.secret(secretName);if(saved)Object.assign(env,JSON.parse(saved));else throw Error('Saved service credentials are unavailable; restore the system credential store before resuming');}
  env.APHRODITE_INSTALLATION_ID=record.owner;
  if(session&&!previous){await activity('Save service credentials in system credential storage',()=>session.secret(secretName,JSON.stringify(env)));await checkpoint();}
  const existing=await activity('Check deployment name availability',()=>fetch(base+prefix+(options.provider==='workers'?'workers/scripts/':'pages/projects/')+options.name,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)}));
  let existingConfig;
  if(existing.ok){
    if(!previous)throw Error('Deployment already exists; select the saved installation to resume it');
    if(options.provider==='workers')existingConfig=(await jsonRequest(base+prefix+'workers/scripts/'+options.name+'/settings',{token})).result;
    else existingConfig=(await existing.json()).result;
    const owner=options.provider==='workers'?existingConfig?.bindings?.find(b=>b.name==='APHRODITE_INSTALLATION_ID')?.text:existingConfig?.deployment_configs?.production?.env_vars?.APHRODITE_INSTALLATION_ID?.value;
    if(owner!==record.owner)throw Error('Existing service ownership does not match the saved installation; no resource was replaced');
    report('Resume owned service; preserve users, database and administrator credentials','done');
  }else{
    if(existing.status===401||existing.status===403)throw Error('Cloudflare token lacks access to '+(options.provider==='workers'?'Workers':'Pages')+'; enable the required account permissions');
    if(existing.status!==404)throw Error('Unable to verify deployment-name availability');
    report('Deployment name is available (HTTP 404)','done');
  }
  let serviceUrl;
  if(options.provider==='workers'){const subdomain=(await jsonRequest(base+prefix+'workers/subdomain',{token})).result.subdomain;serviceUrl='https://'+options.name+'.'+subdomain+'.workers.dev';}
  else serviceUrl='https://'+options.name+'.pages.dev';
  if(options.domain&&options.provider==='pages'){
    required(options.zone,'--zone for custom domain installation');
    const requested=options.domain;
    options.domain=await availablePagesDomain(record.customDomain||requested,new URL(serviceUrl).hostname,async host=>(await jsonRequest(base+'zones/'+options.zone+'/dns_records?name='+encodeURIComponent(host),{token})).result);
    if(options.domain!==requested)report('DNS hostname already in use; selected '+options.domain+' without changing existing records');
    record.customDomain=options.domain;await checkpoint();
  }
  report('Bind executable artifact to this service address and its configured custom domain');
  artifact=await lockArtifact(artifact,[serviceUrl,...(options.domain?['https://'+options.domain]:[])]);
  env.PUBLIC_EDGE_HOST=options.domain||new URL(serviceUrl).hostname;env.EDGE_HOST_ALIASES=env.PUBLIC_EDGE_HOST;
  if(options.domain)required(options.zone,'--zone for custom domain installation');
  const currentDatabase=options.provider==='workers'?existingConfig?.bindings?.find(b=>b.name==='DB')?.id:existingConfig?.deployment_configs?.production?.d1_databases?.DB?.id;
  if(env.DEPLOYMENT_ROLE==='connection'&&currentDatabase)throw Error('Connection service has an unexpected DB binding; no binding or data was changed');
  if(existingConfig&&record.verified&&artifact.manifest?.sha256&&record.buildHash===artifact.manifest.sha256&&record.url===(options.domain?'https://'+options.domain:serviceUrl)&&!options.repair){
    const bound=options.provider==='workers'?existingConfig.bindings?.find(b=>b.name==='DB')?.id:existingConfig.deployment_configs?.production?.d1_databases?.DB?.id;
    if(record.database&&bound!==record.database)throw Error('Current database binding differs from saved installation; no resource was modified');
    report('Completed service found; verify it without uploading again');
    const url=options.domain?'https://'+options.domain:serviceUrl;await verify(url,env,options.readiness);return {url,database:record.database};
  }
  const connection=env.DEPLOYMENT_ROLE==='connection';
  if(connection&&options.databaseId)throw Error('Connection deployments must not have a database');
  if(options.databaseId&&!/^[a-f0-9-]{36}$/i.test(options.databaseId))throw Error('Invalid database id');
  report(connection?'Connection: no database':options.databaseId?'Reuse database without migrations':'Create management database');
  if(options.databaseId&&record.database&&options.databaseId!==record.database)throw Error('The selected database differs from saved user data; use a separate installation for a different database');
  let database=connection?null:record.database?{uuid:record.database}:options.databaseId?{uuid:options.databaseId}:null;
  const suppliedDatabase=Boolean(options.databaseId&&!record.database);
  const query=sql=>jsonRequest(base+prefix+'d1/database/'+database.uuid+'/query',{token,method:'POST',body:{sql}});
  if(!connection&&!database){
    if(record.databasePending){
      const candidates=(await jsonRequest(base+prefix+'d1/database?name='+encodeURIComponent(record.databaseName),{token})).result||[];
      database=candidates.find(item=>item.name===record.databaseName);
      if(!database)throw Error('Database creation outcome needs confirmation; retry later. No duplicate database was created');
    }else{
      record.databaseName=options.name+'-data-'+record.owner.slice(0,8);record.databasePending=true;await checkpoint();
      database=(await jsonRequest(base+prefix+'d1/database',{token,method:'POST',body:{name:record.databaseName}})).result;
    }
  }
  if(database){record.database=database.uuid;record.databasePending=false;await checkpoint();}
  if(existingConfig&&database){const bound=options.provider==='workers'?existingConfig.bindings?.find(b=>b.name==='DB')?.id:existingConfig.deployment_configs?.production?.d1_databases?.DB?.id;if(bound&&bound!==database.uuid)throw Error('Saved database and current DB binding differ; no database or user information was changed');}
  if(suppliedDatabase){
    report('Validate existing database schema (read only; no migrations replayed)');
    const schema=await query('PRAGMA table_info(native_accounts)');
    const columns=schema.result?.[0]?.results?.map(row=>row.name)||[];
    if(!['username','uuid','subscription_key','settings_json','revision'].every(column=>columns.includes(column)))throw Error('Existing database schema is incompatible; no migration or overwrite was attempted');
    record.externalDatabase=true;await checkpoint();
  }
  if(database&&!record.externalDatabase){
    await query('CREATE TABLE IF NOT EXISTS aphrodite_installer_migrations(name TEXT PRIMARY KEY)');
    const applied=(await query('SELECT name FROM aphrodite_installer_migrations')).result?.[0]?.results?.map(row=>row.name)||[];
    for(const migration of (await readdir(join(artifact.directory,'migrations'))).filter(n=>n.endsWith('.sql')).sort()){
      if(applied.includes(migration)){report('Migration already applied: '+migration);continue;}
      let sql=await readFile(join(artifact.directory,'migrations',migration),'utf8');
      if(migration==='0005_native_subscription_keys.sql'){
        const columns=(await query('PRAGMA table_info(native_accounts)')).result?.[0]?.results||[];
        if(columns.some(row=>row.name==='subscription_key'))sql=sql.replace(/ALTER TABLE native_accounts ADD COLUMN subscription_key TEXT;/,'');
      }
      report('Apply migration '+migration);
      await query(sql+"; INSERT OR IGNORE INTO aphrodite_installer_migrations(name) VALUES('"+migration.replaceAll("'","''")+"')");
      record.migrations=[...new Set([...record.migrations,migration])];await checkpoint();
    }
  }
  if(options.provider==='workers'){
    report('Prepare Worker code ('+Buffer.byteLength(artifact.code)+' bytes), environment bindings and secret bindings');
    const bindings=[...(existingConfig?.bindings||[]).filter(binding=>binding.type!=='secret_text'&&binding.name!=='DB'&&!Object.hasOwn(env,binding.name)),...(database?[{type:'d1',name:'DB',id:database.uuid}]:[]),...Object.entries(env).map(([name,text])=>({type:/TOKEN|PASSWORD|SECRET|ADMIN_PATH|EDGE_CONTROL_PATH|EDGE_PROBE_PATH/.test(name)?'secret_text':'plain_text',name,text:String(text)}))];
    const form=new FormData();form.set('metadata',JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-10-03',compatibility_flags:['global_fetch_strictly_public'],keep_bindings:['secret_text'],bindings}));form.set('worker.mjs',new Blob([artifact.code],{type:'application/javascript+module'}),'worker.mjs');
    const response=await activity('Upload Worker and bindings',()=>fetch(base+prefix+'workers/scripts/'+options.name,{method:'PUT',headers:{Authorization:'Bearer '+token},body:form,signal:AbortSignal.timeout(120000)}));report('Worker upload | HTTP '+response.status);const data=await response.json();if(data?.errors?.some(e=>Number(e.code)===8000119))throw Error('Cloudflare blocked this deployment (8000119); request provider review. Existing data is preserved.');if(!response.ok||!data.success)throw Error('Worker upload failed; database id: '+(database?.uuid||'none'));
    await jsonRequest(base+prefix+'workers/scripts/'+options.name+'/subdomain',{token,method:'POST',body:{enabled:true,previews_enabled:false}});
    if(options.domain)await jsonRequest(base+prefix+'workers/domains',{token,method:'PUT',body:{environment:'production',hostname:options.domain,service:options.name,zone_id:options.zone}});
    const url=options.domain?'https://'+options.domain:serviceUrl;record.url=url;record.uploaded=true;record.buildHash=artifact.manifest?.sha256;await checkpoint();await verify(url,env,options.readiness);record.verified=true;await checkpoint();return {url,database:database?.uuid};
  }
  report('Create Pages project and bindings');
  const config={production:{compatibility_date:'2026-10-03',compatibility_flags:['global_fetch_strictly_public'],...(database?{d1_databases:{DB:{id:database.uuid}}}:{}),env_vars:Object.fromEntries(Object.entries(env).map(([name,value])=>[name,{type:/TOKEN|PASSWORD|SECRET|ADMIN_PATH|EDGE_CONTROL_PATH|EDGE_PROBE_PATH/.test(name)?'secret_text':'plain_text',value:String(value)}]))}};
  if(existingConfig){
    for(const mode of ['production','preview'])if(config[mode])config[mode].env_vars={...existingConfig.deployment_configs?.[mode]?.env_vars,...config[mode].env_vars};
    await jsonRequest(base+prefix+'pages/projects/'+options.name,{token,method:'PATCH',body:{deployment_configs:config}});
  }else await jsonRequest(base+prefix+'pages/projects',{token,method:'POST',body:{name:options.name,production_branch:'main',deployment_configs:config}});
  // A separate OS temporary directory prevents ancestor checkout configuration from being read.
  const assets=await mkdtemp(join(tmpdir(),'aphrodite-pages-'));
  try{
    await writeFile(join(assets,'_worker.js'),artifact.code);await writeFile(join(assets,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:[]}));
    report('Upload Pages and wait for provider build');
    await run(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'pages','deploy',assets,'--project-name',options.name,'--branch','main'],{label:'Upload Pages artifact and wait for provider deployment',cwd:assets,env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_SEND_METRICS:'false'}});
  }finally{report('Remove temporary Pages upload files');const target=resolve(assets);if(target.startsWith(resolve(tmpdir())+sep)&&target.split(sep).at(-1).startsWith('aphrodite-pages-'))await rm(target,{recursive:true,force:true});}
  if(options.domain){
    const domains=(await jsonRequest(base+prefix+'pages/projects/'+options.name+'/domains',{token})).result||[];
    if(!domains.some(item=>item.name===options.domain))await jsonRequest(base+prefix+'pages/projects/'+options.name+'/domains',{token,method:'POST',body:{name:options.domain}});
    const records=(await jsonRequest(base+'zones/'+options.zone+'/dns_records?name='+encodeURIComponent(options.domain),{token})).result;
    const target=new URL(serviceUrl).hostname;
    if(records.some(record=>record.type!=='CNAME'||String(record.content).toLowerCase().replace(/\.$/,'')!==target.toLowerCase()))throw Error('DNS changed during installation; resume to select an available hostname. No existing DNS record was overwritten');
    if(!records.length)await jsonRequest(base+'zones/'+options.zone+'/dns_records',{token,method:'POST',body:{type:'CNAME',name:options.domain,content:target,proxied:true}});
  }
  const url=options.domain?'https://'+options.domain:serviceUrl;record.url=url;record.uploaded=true;record.buildHash=artifact.manifest?.sha256;await checkpoint();await verify(url,env,options.readiness);record.verified=true;await checkpoint();return {url,database:database?.uuid};
}
