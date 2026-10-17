import {spawn} from 'node:child_process';
const started=Date.now();
console.log('Installing locked dependencies...');
const child=spawn(process.execPath,[process.argv[2],'ci','--include=dev','--ignore-scripts','--no-fund','--no-audit','--loglevel=error'],{windowsHide:true,stdio:'inherit',shell:false});
const timer=setInterval(()=>console.log('Dependency installation still running: '+Math.floor((Date.now()-started)/1000)+'s'),5000);
child.once('error',()=>{clearInterval(timer);console.error('Unable to start dependency installation');process.exitCode=1;});
child.once('close',code=>{clearInterval(timer);console.log(code===0?'Dependencies ready':'Dependency installation failed');process.exitCode=code??1;});
