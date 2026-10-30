import {spawn} from 'node:child_process';
import {interfaceFor} from './ui.mjs';
import {activity,report,setProgressReporter} from './progress.mjs';
import {ensureDependencies} from './dependency-cache.mjs';
const ui=interfaceFor();setProgressReporter(event=>ui.detail({...event,sequence:'BOOTSTRAP'}));
try{
 const result=await ensureDependencies(process.cwd(),()=>activity('Install locked dependencies',()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[process.argv[2],'ci','--include=dev','--ignore-scripts','--no-fund','--no-audit','--loglevel=error'],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  child.stdout.resume();child.stderr.resume();
  child.once('error',()=>reject(Error('Cannot start dependency installation')));
  child.once('close',code=>code===0?resolve():reject(Error('Dependency installation failed (exit '+code+'). Check registry/network access and retry.')));
 })));
 if(result.unchanged)report('Dependencies unchanged; skip npm ci','done');
}catch(error){report(error.message,'error');process.exitCode=1;}finally{ui.close();setProgressReporter(undefined);}
