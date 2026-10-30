import {spawn} from 'node:child_process';
import {interfaceFor} from './ui.mjs';
import {activity,report,setProgressReporter} from './progress.mjs';
import {ensureDependencies} from './dependency-cache.mjs';
const ui=interfaceFor();setProgressReporter(event=>ui.detail({...event,sequence:'BOOTSTRAP'}));
function npm(command,args=[]){return new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[process.argv[2],command,...args],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
 let output='';const capture=chunk=>{output=(output+chunk).slice(-12000);};child.stdout.on('data',capture);child.stderr.on('data',capture);
 child.once('error',()=>reject(Error('Cannot start dependency installation')));
 child.once('close',code=>code===0?resolve():reject(Error('Dependency installation failed (exit '+code+'). '+(output.trim()||'No npm diagnostic was returned. Check registry/network access and retry.'))));
});}
try{
 const result=await ensureDependencies(process.cwd(),()=>activity('Install locked dependencies',async()=>{
  const args=['--include=dev','--ignore-scripts','--no-fund','--no-audit','--loglevel=error'];
  try{await npm('ci',args);}catch(firstError){report('First dependency download failed; verify npm cache and retry once','waiting');await npm('cache',['verify','--loglevel=error']).catch(()=>{});try{await npm('ci',[...args,'--prefer-online']);}catch{throw firstError;}}
 }));
 if(result.unchanged)report('Dependencies unchanged; skip npm ci','done');
}catch(error){report(error.message,'error');process.exitCode=1;}finally{ui.close();setProgressReporter(undefined);}
