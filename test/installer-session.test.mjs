import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openSession,systemCredentials} from '../installer/session.mjs';
const directories=[];afterEach(async()=>{for(const folder of directories.splice(0))await rm(folder,{recursive:true,force:true});});
const memoryVault=()=>{const values=new Map();return {get:async key=>values.get(key)??null,set:async(key,value)=>{values.set(key,value);}};};
it('keeps plaintext and encoded secrets out of checkpoints and restores them from the vault',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'aphrodite-session-test-'));directories.push(folder);
 const path=join(folder,'installation.json'),credentials=memoryVault();const a=await openSession({path,credentials});
 const secret='fake-provider-token-'+ 'abc'.repeat(2500);
 a.state.options={provider:'workers',name:'test-panel'};await a.secret('provider-token',secret);await a.secret('administrator','fake-admin-secret');
 const text=await readFile(path,'utf8');expect(text).not.toContain('fake-provider');expect(text).not.toContain('fake-admin');expect(text).not.toContain(Buffer.from(secret).toString('base64'));
 const b=await openSession({path,credentials});expect(await b.secret('provider-token')).toBe(secret);expect(await b.secret('administrator')).toBe('fake-admin-secret');
 expect(b.state.options.name).toBe('test-panel');
});
it('archives metadata when a new installation is explicitly selected',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'aphrodite-session-test-'));directories.push(folder);const path=join(folder,'installation.json'),credentials=memoryVault();
 const a=await openSession({path,credentials});await a.save();const b=await openSession({path,credentials,fresh:true});
 expect(b.state.id).not.toBe(a.state.id);expect(JSON.parse(await readFile(join(folder,'installation-'+a.state.id+'.json'),'utf8')).id).toBe(a.state.id);
});
it.skipIf(process.platform!=='win32')('uses Windows Credential Manager without a visible helper or secret file',async()=>{
 const key='Aphrodite/Installer/test-'+randomUUID();
 try{await systemCredentials.set(key,'fake-credential-roundtrip');expect(await systemCredentials.get(key)).toBe('fake-credential-roundtrip');}
 finally{await systemCredentials.delete(key);}
},30000);
