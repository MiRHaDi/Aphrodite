import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import {interfaceFor} from './ui.mjs';
import {showInstallationResult} from './installation-result.mjs';
import {runInstallation} from './runner.mjs';
import {optionSchema,validateOptions,validateRequest} from './options.mjs';
let values,environment=process.env,prepared;
let json=process.argv.includes('--json');
let ui;
try{
 const parsed=parseArgs({options:{...optionSchema,config:{type:'string'}}}).values;
 const config=parsed.config;delete parsed.config;
 if(config){
  let source;
  if(config==='-'){
   const chunks=[];let size=0;
   for await(const chunk of process.stdin){size+=chunk.length;if(size>65536)throw Error('Configuration exceeds 64 KiB');chunks.push(chunk);}
   source=Buffer.concat(chunks).toString('utf8');
  }else source=await readFile(config,'utf8');
  let request;try{request=validateRequest(JSON.parse(source));}catch{throw Error('Invalid JSON installer configuration');}
  if(config!=='-'&&Object.keys(request.environment).length)throw Error('Pass credentials through environment variables or stdin, not configuration files');
  values=validateOptions({...request.options,...parsed});environment={...process.env,...request.environment};
 }else values=validateOptions(parsed);
 json=Boolean(values.json);
 if(values.help){
  const help='node installer/cli.mjs --provider workers|pages|railway|render|docker|vps|bundle [--preview]\nResume: --resume; repair owned services: --repair; add another account: --add-account --connection-token-env NAME --connection-account ID. Checkpoints: --state PATH; fresh install: --new; disable persistence: --no-save.\nCloudflare split: --connections 1..8 --connection-providers workers,pages --database-id UUID; --topology standalone for a single service.\nResults: exits after completion; --result-page keeps a private copy-token page open.\nCustom hostname: --base-domain DOMAIN --subdomain NAME, or --domain HOST [--zone ZONE_ID]; --domain-conflict reuse|new|fail. Interactive resume can configure a missing hostname.\nAutomation: --non-interactive --json --config PATH (or - for JSON stdin); --include-credentials explicitly includes private administrator credentials in the result.\nLocal HTTP API: node installer/api.mjs (INSTALLER_API_TOKEN required). See docs/INSTALLER_API.md.\nOffline working baseline: --build-profile working-baseline --provider bundle --preview.\nTokens: CLOUDFLARE_API_TOKEN / RAILWAY_API_TOKEN / RENDER_API_KEY.\nSSH: --host --user --fingerprint SHA256:... --key PATH or SSH_PASSWORD.\nUnattended first installation requires ADMIN_TOKEN and ADMIN_PATH.';
  console.log(json?JSON.stringify({version:1,ok:true,help,options:optionSchema}):help);
 }else{
  if((json||values['non-interactive']||config==='-')&&values['result-page'])throw Error('result-page requires an interactive installation');
  ui=interfaceFor();
  if(!json)ui.banner();
  const result=await runInstallation(values,{
   ui:json?undefined:ui,environment,interactive:!json&&!values['non-interactive']&&config!=='-'&&Boolean(process.stdin.isTTY),
   onPrepared:value=>{prepared=value;},
   onProgress:json?event=>{if(event.level!=='tick')process.stderr.write(JSON.stringify({version:1,type:'progress',...event})+'\n');}:undefined
  });
  console.log(JSON.stringify(json?{version:1,ok:true,result}:result,null,json?undefined:2));
  if(!json&&!values.preview&&values.provider!=='bundle'&&process.stdout.isTTY)await showInstallationResult(result,prepared.env,{ui,interactiveCard:Boolean(values['result-page'])});
 }
}catch(error){
 if(json)console.log(JSON.stringify({version:1,ok:false,error:{code:error.code||'INVALID_CONFIGURATION',message:error.message}}));
 else console.error('Installation failed: '+error.message);
 process.exitCode=1;
}finally{ui?.close();}
