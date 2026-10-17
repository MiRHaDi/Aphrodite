import {afterEach,expect,it} from 'vitest';
import {database} from '../runtime/database.mjs';
import {deploymentConnections,connectionRegistry,deploymentHealth} from '../src/deployment-registry';
import {fileURLToPath} from 'node:url';
const instances=[];afterEach(()=>{for(const db of instances.splice(0))db.close();});
async function fixture(){const db=await database(':memory:',fileURLToPath(new URL('../migrations/',import.meta.url)));instances.push(db);return {DB:db,DEPLOYMENT_ROLE:'management',ADMIN_TOKEN:'fake-administrator-credential'};}
const endpoint=host=>({host,address:host,sni:host});
const add=values=>new Request('https://test.example/api/deployment/connections',{method:'POST',body:JSON.stringify({endpoints:values})});
it('adds nodes atomically without dropping existing configuration or user identifiers',async()=>{
 const env=await fixture();env.CONNECTION_ENDPOINTS_JSON=JSON.stringify([endpoint('old.example')]);
 await env.DB.prepare("INSERT INTO native_accounts(username,uuid,subscription_key) VALUES('existing','existing-uuid','original-key')").run();
 expect((await deploymentConnections(add([endpoint('new.example')]),env)).status).toBe(200);
 await deploymentConnections(add([endpoint('another.example'),endpoint('new.example')]),env);
 expect((await connectionRegistry(env)).map(e=>e.host).sort()).toEqual(['another.example','new.example','old.example']);
 expect(await env.DB.prepare("SELECT subscription_key FROM native_accounts WHERE username='existing'").first('subscription_key')).toBe('original-key');
});
it('rejects malformed endpoints and connection-only roles',async()=>{
 const env=await fixture();expect((await deploymentConnections(add([{host:'bad\nname'}]),env)).status).toBe(400);
 expect((await deploymentConnections(add([]),{...env,DEPLOYMENT_ROLE:'connection'})).status).toBe(409);
});
it('provides safe health diagnoses instead of exposing database exception text',async()=>{
 expect((await deploymentHealth({})).status).toBe(503);
 const env=await fixture();expect((await deploymentHealth(env)).status).toBe(200);
 await env.DB.prepare('DROP TABLE native_accounts').run();const response=await deploymentHealth(env);
 expect(response.status).toBe(503);expect((await response.json()).code).toBe('DATABASE_SCHEMA_INCOMPLETE');
});
