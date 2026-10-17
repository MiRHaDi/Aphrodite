import {activity} from './progress.mjs';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

function execute(command,args,input){return new Promise((resolve,reject)=>{
 const child=spawn(command,args,{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});let output='';
 child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1024*1024)child.kill();});child.stderr.resume();
 const timer=setTimeout(()=>child.kill(),20000);
 child.once('error',()=>{clearTimeout(timer);reject(Error('System credential storage unavailable'));});
 child.once('close',code=>{clearTimeout(timer);code===0?resolve(output):code===2?resolve(null):reject(Error('System credential storage unavailable'));});
 child.stdin.on('error',()=>{});child.stdin.end(input);
});}
export const systemCredentials={
 async delete(target){if(process.platform==='win32')return execute(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./credential-store.ps1',import.meta.url)),'-Operation','delete','-Target',target]);},
 async get(target){
  if(process.platform==='win32')return execute(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./credential-store.ps1',import.meta.url)),'-Operation','get','-Target',target]);
  if(process.platform==='linux')return execute('secret-tool',['lookup','service','aphrodite-installer','profile',target]);
  if(process.platform==='darwin')return execute('security',['find-generic-password','-a','Aphrodite Installer','-s',target,'-w']);
  throw Error('System credential storage unavailable; resume requires credentials again');
 },
 async set(target,value){
  if(process.platform==='win32')return execute(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./credential-store.ps1',import.meta.url)),'-Operation','set','-Target',target],value);
  if(process.platform==='linux')return execute('secret-tool',['store','--label=Aphrodite Installer','service','aphrodite-installer','profile',target],value);
  if(process.platform==='darwin')return execute('security',['add-generic-password','-U','-a','Aphrodite Installer','-s',target,'-w',value]);
  throw Error('System credential storage unavailable; resume requires credentials again');
 }
};
export const defaultSessionPath=()=>join(process.env.LOCALAPPDATA||process.env.XDG_STATE_HOME||join(homedir(),'.local/state'),'Aphrodite','installer','installation.json');
export async function openSession({path=defaultSessionPath(),credentials=systemCredentials,fresh=false}={}){
 let state;
 if(fresh)try{const old=JSON.parse(await readFile(path,'utf8'));if(/^[a-f0-9-]{36}$/i.test(old.id))await writeFile(join(dirname(path),'installation-'+old.id+'.json'),JSON.stringify(old,null,2),{mode:0o600,flag:'wx'});}catch(error){if(!['ENOENT','EEXIST'].includes(error.code))throw Error('Cannot archive the previous installation; it was not replaced');}
 if(!fresh)try{state=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Saved installation is unreadable; use --new to keep it and start another installation');}
 if(state&&state.version!==1)throw Error('Saved installation version is not supported');
 state||={version:1,id:randomUUID(),options:{},profiles:[],services:{},secrets:{}};
 const cache=new Map();
 const save=async()=>{await mkdir(dirname(path),{recursive:true,mode:0o700});const temporary=path+'.tmp';await writeFile(temporary,JSON.stringify(state,null,2),{mode:0o600});await rename(temporary,path);};
 return {state,path,save,
  async secret(name,value){
   if(value===undefined){
    if(cache.has(name))return cache.get(name);
    const record=state.secrets[name];if(!record)return undefined;
    return activity('Restore credentials from system storage',async()=>{
    let text='';for(let i=0;i<record.parts;i++){const part=await credentials.get('Aphrodite/Installer/'+state.id+'/'+name+'/'+record.generation+'/'+i);if(part===null)return undefined;text+=part;}
    const value=record.encoding==='base64'?Buffer.from(text,'base64').toString('utf8'):text;cache.set(name,value);return value;
    });
   }
   if(cache.has(name)&&cache.get(name)===value)return value;
   return activity('Store credentials in system storage',async()=>{
   cache.set(name,value);const encoded=Buffer.from(value,'utf8').toString('base64'),parts=encoded.match(/.{1,1800}/g)||[''],generation=randomUUID();
   for(let i=0;i<parts.length;i++)await credentials.set('Aphrodite/Installer/'+state.id+'/'+name+'/'+generation+'/'+i,parts[i]);
   state.secrets[name]={parts:parts.length,generation,encoding:'base64'};await save();return value;
   });
  }
 };
}
