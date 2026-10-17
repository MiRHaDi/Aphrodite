import {activity,report} from './progress.mjs';
import {readFile,readdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {jsonRequest,required,run,root,verify} from './common.mjs';
const base='https://api.cloudflare.com/client/v4/';
export async function deployCloudflare(options,env,artifact){
  report('Configure '+options.provider+' service: '+options.name+' | role: '+(env.DEPLOYMENT_ROLE||'standalone'));
  const token=required(options.token,'Cloudflare token');
  let account=options.account;
  if(!account){const accounts=(await jsonRequest(base+'accounts',{token})).result;if(accounts.length!==1)throw Error('Specify --account when the token can access zero or multiple accounts');account=accounts[0].id;}
  if(!/^[a-f0-9]{32}$/.test(account))throw Error('Invalid account id');
  const prefix='accounts/'+account+'/';
  const existing=await activity('Check deployment name availability',()=>fetch(base+prefix+(options.provider==='workers'?'workers/scripts/':'pages/projects/')+options.name,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)}));
  if(existing.ok)throw Error('Deployment already exists; refusing replacement');
  if(existing.status===401||existing.status===403)throw Error('Cloudflare token lacks access to '+(options.provider==='workers'?'Workers':'Pages')+'; enable the required account permissions before retrying');
  if(existing.status!==404)throw Error('Unable to verify deployment-name availability');
  report('Deployment name is available (HTTP 404)','done');
  let serviceUrl;
  if(options.provider==='workers'){const subdomain=(await jsonRequest(base+prefix+'workers/subdomain',{token})).result.subdomain;serviceUrl='https://'+options.name+'.'+subdomain+'.workers.dev';}
  else serviceUrl='https://'+options.name+'.pages.dev';
  env.PUBLIC_EDGE_HOST=options.domain||new URL(serviceUrl).hostname;env.EDGE_HOST_ALIASES=env.PUBLIC_EDGE_HOST;
  if(options.domain)required(options.zone,'--zone for custom domain installation');
  const connection=env.DEPLOYMENT_ROLE==='connection';
  if(connection&&options.databaseId)throw Error('Connection deployments must not have a database');
  if(options.databaseId&&!/^[a-f0-9-]{36}$/i.test(options.databaseId))throw Error('Invalid database id');
  report(connection?'Connection: no database':options.databaseId?'Reuse database without migrations':'Create management database');
  const database=connection?null:options.databaseId?{uuid:options.databaseId}:(await jsonRequest(base+prefix+'d1/database',{token,method:'POST',body:{name:options.name+'-data'}})).result;
  if(options.databaseId){
    report('Validate existing database schema (read only; no migrations replayed)');
    const schema=await jsonRequest(base+prefix+'d1/database/'+database.uuid+'/query',{token,method:'POST',body:{sql:'PRAGMA table_info(native_accounts)'}});
    const columns=schema.result?.[0]?.results?.map(row=>row.name)||[];
    if(!['username','uuid','subscription_key','settings_json','revision'].every(column=>columns.includes(column)))throw Error('Existing database schema is incompatible; no migration or overwrite was attempted');
  }
  const migrationFiles=(await readdir(join(artifact.directory,'migrations'))).filter(n=>n.endsWith('.sql')).sort();
  // Existing databases are reused without replaying migrations or replacing rows.
  if(database&&!options.databaseId)for(const migration of migrationFiles){report('Apply migration '+migration);await jsonRequest(base+prefix+'d1/database/'+database.uuid+'/query',{token,method:'POST',body:{sql:await readFile(join(artifact.directory,'migrations',migration),'utf8')}});}
  if(options.provider==='workers'){
    report('Prepare Worker code ('+Buffer.byteLength(artifact.code)+' bytes), environment bindings and secret bindings');
    const bindings=[...(database?[{type:'d1',name:'DB',id:database.uuid}]:[]),...Object.entries(env).map(([name,text])=>({type:/TOKEN|PASSWORD|SECRET|ADMIN_PATH|EDGE_CONTROL_PATH|EDGE_PROBE_PATH/.test(name)?'secret_text':'plain_text',name,text:String(text)}))];
    const form=new FormData();form.set('metadata',JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-10-03',compatibility_flags:['global_fetch_strictly_public'],bindings}));form.set('worker.mjs',new Blob([artifact.code],{type:'application/javascript+module'}),'worker.mjs');
    const response=await activity('Upload Worker and bindings',()=>fetch(base+prefix+'workers/scripts/'+options.name,{method:'PUT',headers:{Authorization:'Bearer '+token},body:form,signal:AbortSignal.timeout(120000)}));report('Worker upload | HTTP '+response.status);const data=await response.json();if(!response.ok||!data.success)throw Error('Worker upload failed; database id: '+(database?.uuid||'none'));
    await jsonRequest(base+prefix+'workers/scripts/'+options.name+'/subdomain',{token,method:'POST',body:{enabled:true,previews_enabled:false}});
    if(options.domain)await jsonRequest(base+prefix+'workers/domains',{token,method:'PUT',body:{environment:'production',hostname:options.domain,service:options.name,zone_id:options.zone}});
    const url=options.domain?'https://'+options.domain:serviceUrl;await verify(url,env,options.readiness);return {url,database:database?.uuid};
  }
  report('Create Pages project and bindings');
  const config={production:{compatibility_date:'2026-10-03',compatibility_flags:['global_fetch_strictly_public'],...(database?{d1_databases:{DB:{id:database.uuid}}}:{}),env_vars:Object.fromEntries(Object.entries(env).map(([name,value])=>[name,{type:/TOKEN|PASSWORD|SECRET|ADMIN_PATH|EDGE_CONTROL_PATH|EDGE_PROBE_PATH/.test(name)?'secret_text':'plain_text',value:String(value)}]))}};
  await jsonRequest(base+prefix+'pages/projects',{token,method:'POST',body:{name:options.name,production_branch:'main',deployment_configs:config}});
  // A separate OS temporary directory prevents ancestor checkout configuration from being read.
  const assets=await mkdtemp(join(tmpdir(),'aphrodite-pages-'));
  try{
    await writeFile(join(assets,'_worker.js'),artifact.code);await writeFile(join(assets,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:[]}));
    report('Upload Pages and wait for provider build');
    await run(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'pages','deploy',assets,'--project-name',options.name,'--branch','main'],{label:'Upload Pages artifact and wait for provider deployment',cwd:assets,env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_SEND_METRICS:'false'}});
  }finally{report('Remove temporary Pages upload files');const target=resolve(assets);if(target.startsWith(resolve(tmpdir())+sep)&&target.split(sep).at(-1).startsWith('aphrodite-pages-'))await rm(target,{recursive:true,force:true});}
  if(options.domain){
    await jsonRequest(base+prefix+'pages/projects/'+options.name+'/domains',{token,method:'POST',body:{name:options.domain}});
    const records=(await jsonRequest(base+'zones/'+options.zone+'/dns_records?name='+encodeURIComponent(options.domain),{token})).result;
    if(records.length)throw Error('Custom domain has existing DNS records; no records were overwritten');
    await jsonRequest(base+'zones/'+options.zone+'/dns_records',{token,method:'POST',body:{type:'CNAME',name:options.domain,content:new URL(serviceUrl).hostname,proxied:true}});
  }
  const url=options.domain?'https://'+options.domain:serviceUrl;await verify(url,env,options.readiness);return {url,database:database?.uuid};
}
