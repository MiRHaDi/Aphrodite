import {it,expect,afterEach} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {passwordHash} from '../installer/password.mjs';
import {adminSession,validSession,passwordMatches} from '../src/admin-session.ts';
import {isAdmin} from '../src/auth.ts';
const databases=[];afterEach(()=>{for(const db of databases.splice(0))db.close();});
function fixture(){
 const db=new DatabaseSync(':memory:');databases.push(db);db.exec('CREATE TABLE admin_login_attempts(id TEXT PRIMARY KEY,window_start INTEGER,attempts INTEGER)');
 const DB={prepare:sql=>({bind:(...args)=>({first:async()=>db.prepare(sql).get(...args)})})};
 return {DB,ADMIN_TOKEN:'fixture-random-administrator-token-32',ADMIN_PASSWORD_HASH:passwordHash('fixture-selected-password')};
}
const login=(env,credential)=>adminSession(new Request('https://example.test/api/session',{method:'POST',headers:{'cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({credential})}),env);
it('accepts the selected password and original random token without storing the password',async()=>{
 const env=fixture();expect(env.ADMIN_PASSWORD_HASH).not.toContain('fixture-selected-password');expect(passwordHash('fixture-selected-password',env.ADMIN_PASSWORD_HASH)).toBe(env.ADMIN_PASSWORD_HASH);
 expect(await passwordMatches('incorrect-password',env.ADMIN_PASSWORD_HASH)).toBe(false);
 for(const credential of ['fixture-selected-password',env.ADMIN_TOKEN]){
  const response=await login(env,credential);expect(response.status).toBe(200);const result=await response.json();
  expect(await validSession(result.token,env)).toBe(true);expect(await isAdmin(new Request('https://example.test/api',{headers:{authorization:'Bearer '+result.token}}),env)).toBe(true);
  expect(await validSession(result.token+'tamper',env)).toBe(false);expect(await validSession(result.token,{...env,ADMIN_TOKEN:'different-key'})).toBe(false);
  expect(await validSession(result.token,{...env,ADMIN_PASSWORD_HASH:passwordHash('different-fixture-password')})).toBe(false);
 }
 expect(await isAdmin(new Request('https://example.test/api',{headers:{authorization:'Bearer '+env.ADMIN_TOKEN}}),env)).toBe(true);
 expect(await isAdmin(new Request('https://example.test/api',{headers:{authorization:'Bearer fixture-selected-password'}}),env)).toBe(false);
});
it('limits password attempts and retains random-token recovery',async()=>{
 const env=fixture();for(let i=0;i<8;i++)expect((await login(env,'incorrect-password')).status).toBe(401);
 expect((await login(env,'fixture-selected-password')).status).toBe(429);expect((await login(env,env.ADMIN_TOKEN)).status).toBe(200);
 expect((await adminSession(new Request('https://example.test',{method:'POST',body:'x'.repeat(4096)}),env)).status).toBe(400);
 expect((await adminSession(new Request('https://example.test',{method:'POST',body:'null'}),env)).status).toBe(401);
});
