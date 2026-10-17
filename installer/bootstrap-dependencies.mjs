import {spawn} from 'node:child_process';
const started=Date.now();
console.log('\x1b[36mInstalling locked dependencies / نصب پیش‌نیازها…\x1b[0m');
const child=spawn(process.execPath,[process.argv[2],'ci','--include=dev','--ignore-scripts','--no-fund','--no-audit','--loglevel=error'],{windowsHide:true,stdio:'inherit',shell:false});
const timer=setInterval(()=>console.log('Dependency installation still running / نصب پیش‌نیازها ادامه دارد: '+Math.floor((Date.now()-started)/1000)+'s'),5000);
child.once('error',()=>{clearInterval(timer);console.error('Unable to start dependency installation');process.exitCode=1;});
child.once('close',code=>{clearInterval(timer);console.log(code===0?'Dependencies ready / پیش‌نیازها آماده شد':'Dependency installation failed / نصب پیش‌نیازها ناموفق');process.exitCode=code??1;});
