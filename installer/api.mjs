import {createServer} from 'node:http';
import {randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {optionSchema,validateRequest} from './options.mjs';
import {listCloudflareZones} from './domains.mjs';
const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
export function launchInstaller(request,onProgress){
 return new Promise((resolveResult,reject)=>{
  const env={...process.env};delete env.INSTALLER_API_TOKEN;
  const child=spawn(process.execPath,[cli,'--json','--non-interactive','--config','-'],{env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  let output='',overflow=false;
  child.stdout.on('data',chunk=>{if(output.length+chunk.length>1024*1024)overflow=true;else output+=chunk.toString();});
  const lines=createInterface({input:child.stderr});
  lines.on('line',line=>{if(line.length>16384)return;try{const event=JSON.parse(line);if(event.type==='progress')onProgress(event);}catch{}});
  child.once('error',()=>reject(Error('Unable to start installer process')));
  child.once('close',code=>{
   lines.close();
   try{const receipt=overflow?null:JSON.parse(output);if(!receipt||receipt.version!==1||typeof receipt.ok!=='boolean')throw Error();if(code!==0&&receipt.ok)throw Error();resolveResult(receipt);}
   catch{reject(Error('Installer exited without a valid JSON receipt'));}
  });
  child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify({options:{...request.options,json:true,'non-interactive':true,'result-page':false,help:false},environment:request.environment}));
 });
}
export function createInstallerServer({token,launch=launchInstaller,listDomains=listCloudflareZones}={}){
 if(typeof token!=='string'||token.length<32||/[\r\n]/.test(token))throw Error('Set INSTALLER_API_TOKEN to at least 32 characters');
 const expected=createHash('sha256').update('Bearer '+token).digest();
 const jobs=new Map(),keys=new Map();let active=false;
 const respond=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
 const server=createServer(async(req,res)=>{
  if(req.headers.origin){respond(res,403,{ok:false,error:{code:'ORIGIN_REJECTED'}});return;}
  const actual=createHash('sha256').update(req.headers.authorization||'').digest();
  if(!timingSafeEqual(actual,expected)){respond(res,401,{ok:false,error:{code:'UNAUTHORIZED'}});return;}
  const path=(req.url||'').split('?')[0];
  try{
   if(req.method==='GET'&&path==='/v1/schema'){respond(res,200,{version:1,options:optionSchema,domainConflict:['reuse','new','fail'],endpoints:['POST /v1/domains','POST /v1/jobs','GET /v1/jobs/:id']});return;}
   if(req.method==='GET'&&path.startsWith('/v1/jobs/')){
    const job=jobs.get(path.slice('/v1/jobs/'.length));respond(res,job?200:404,job||{ok:false,error:{code:'JOB_NOT_FOUND'}});return;
   }
   if(req.method!=='POST'||!['/v1/jobs','/v1/domains'].includes(path)){respond(res,404,{ok:false,error:{code:'NOT_FOUND'}});return;}
   if(!String(req.headers['content-type']||'').startsWith('application/json')){respond(res,415,{ok:false,error:{code:'JSON_REQUIRED'}});return;}
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>65536){respond(res,413,{ok:false,error:{code:'REQUEST_TOO_LARGE'}});return;}chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{respond(res,400,{ok:false,error:{code:'INVALID_JSON'}});return;}
   if(path==='/v1/domains'){
    if(!body||typeof body.token!=='string'||(body.account!==undefined&&typeof body.account!=='string'))throw Error('Provider token and optional account are required');
    const zones=await listDomains({token:body.token,account:body.account});
    respond(res,200,{version:1,ok:true,zones:zones.map(zone=>({id:zone.id,name:zone.name,account:zone.account?.id}))});return;
   }
   const request=validateRequest(body);
   if(request.options.help||request.options['result-page'])throw Error('Job requests cannot use help or result-page');
   const key=req.headers['idempotency-key'];
   if(key&&(typeof key!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(key)))throw Error('Invalid Idempotency-Key');
   const fingerprint=createHash('sha256').update(JSON.stringify(request)).digest('hex');
   if(key&&keys.has(key)){
    const existing=keys.get(key);
    if(existing.fingerprint!==fingerprint){respond(res,409,{ok:false,error:{code:'IDEMPOTENCY_CONFLICT'}});return;}
    respond(res,200,jobs.get(existing.id));return;
   }
   if(active){respond(res,409,{ok:false,error:{code:'INSTALLER_BUSY'}});return;}
   while(jobs.size>=20){const id=jobs.keys().next().value;jobs.delete(id);for(const [oldKey,entry] of keys)if(entry.id===id)keys.delete(oldKey);}
   const id=randomUUID(),job={version:1,id,status:'running',createdAt:new Date().toISOString(),events:[]};
   jobs.set(id,job);if(key)keys.set(key,{id,fingerprint});active=true;
   respond(res,202,{version:1,id,status:'running',statusUrl:'/v1/jobs/'+id});
   Promise.resolve().then(()=>launch(request,event=>{job.events.push(event);if(job.events.length>200)job.events.shift();})).then(receipt=>{
    job.status=receipt.ok?'succeeded':'failed';job.receipt=receipt;
   },()=>{job.status='failed';job.receipt={version:1,ok:false,error:{code:'INSTALLER_PROCESS_FAILED',message:'Installer process failed; resume from its saved checkpoint'}};}).finally(()=>{job.finishedAt=new Date().toISOString();active=false;});
  }catch{respond(res,400,{version:1,ok:false,error:{code:'INVALID_REQUEST',message:'Check request schema, provider access and required options'}});}
 });
 server.headersTimeout=10000;server.requestTimeout=30000;
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const port=Number(process.env.INSTALLER_API_PORT||'63546');if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid INSTALLER_API_PORT');
  const server=createInstallerServer({token:process.env.INSTALLER_API_TOKEN});
  server.once('error',()=>{console.error('Installer API could not bind its local port');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log('Installer API: http://127.0.0.1:'+port+' (Bearer authentication required)'));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
