import {it,expect,vi,afterEach} from 'vitest';
import {remoteDatabase,clusterEnvironment,databaseControl} from '../src/cluster-database.ts';
import {clusterAuthorized} from '../src/cluster-auth.ts';
import {validateCluster,restoreCluster} from '../installer/cluster.mjs';
afterEach(()=>vi.unstubAllGlobals());
const token='fixture-database-token-at-least-32-characters';
it('resumes the saved cluster role and secrets before building, preserving explicit changes',async()=>{
 const env={DATA_CONTROL_TOKEN:'new-fixture-data-token-32-characters'};
 await restoreCluster(env,{provider:'workers',name:'fixture'}, {state:{services:{one:{name:'fixture',provider:'workers',owner:'fixture-owner'}}},secret:async()=>JSON.stringify({DEPLOYMENT_ROLE:'management',DATA_CONTROL_URL:'https://data.test/private-path',DATA_CONTROL_TOKEN:token})},'standalone');
 expect(env.DEPLOYMENT_ROLE).toBe('management');expect(env.DATA_CONTROL_URL).toBe('https://data.test/private-path');expect(env.DATA_CONTROL_TOKEN).toBe('new-fixture-data-token-32-characters');
});
it('validates cluster configuration before provisioning',()=>{
 expect(()=>validateCluster({DEPLOYMENT_ROLE:'database'},'standalone')).toThrow();
 expect(()=>validateCluster({DATA_CONTROL_URL:'http://data.test/private',DATA_CONTROL_TOKEN:token},'split')).toThrow();
 expect(()=>validateCluster({DEPLOYMENT_ROLE:'management',DATA_CONTROL_URL:'https://data.test/private',DATA_CONTROL_TOKEN:token,EDGE_CONTROL_TOKEN:token},'standalone')).toThrow();
 expect(()=>validateCluster({DEPLOYMENT_ROLE:'management',DATA_CONTROL_URL:'https://data.test/private',DATA_CONTROL_TOKEN:token},'standalone')).not.toThrow();
 expect(()=>validateCluster({DEPLOYMENT_ROLE:'database',DATA_CONTROL_PATH:'private-database-path',DATA_CONTROL_TOKEN:token},'standalone')).not.toThrow();
});
it('fails closed on invalid token rings and distinguishes independent tokens',async()=>{
 const request=new Request('https://example.test',{headers:{authorization:'Bearer '+token}});
 expect(await clusterAuthorized(request,undefined,JSON.stringify([token]))).toBe(true);
 expect(await clusterAuthorized(request,undefined,'null')).toBe(false);
 expect(await clusterAuthorized(request,token,'broken')).toBe(false);
});
it('requires HTTPS and management-only credentials',()=>{
 expect(()=>remoteDatabase({DATA_CONTROL_URL:'http://example.test/rpc',DATA_CONTROL_TOKEN:token})).toThrow();
 expect(()=>clusterEnvironment({DEPLOYMENT_ROLE:'connection',DATA_CONTROL_URL:'https://example.test/rpc'})).toThrow();
});
it('never replays a write after an ambiguous network failure or redirect',async()=>{
 const fetch=vi.fn().mockRejectedValue(Error('network interrupted'));vi.stubGlobal('fetch',fetch);
 const db=remoteDatabase({DATA_CONTROL_URL:'https://example.test/rpc',DATA_CONTROL_TOKEN:token});
 await expect(db.prepare('UPDATE native_usage SET used=used+1').run()).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
 fetch.mockResolvedValue(new Response(null,{status:302,headers:{location:'https://other.test'}}));
 await expect(db.prepare('SELECT 1').all()).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[1][1].redirect).toBe('manual');
});
it('rejects malformed and oversized RPCs without executing SQL',async()=>{
 const batch=vi.fn(),env={DB:{batch},DATA_CONTROL_TOKEN:token};
 for(const body of ['null','{}',JSON.stringify({statements:[]}),JSON.stringify({statements:[{sql:'SELECT ?',params:[{}]}]}),'x'.repeat(262145)]){
  const r=await databaseControl(new Request('https://data.test/rpc',{method:'POST',headers:{authorization:'Bearer '+token},body}),env);expect(r.status).toBeGreaterThanOrEqual(400);
 }
 expect(batch).not.toHaveBeenCalled();
});
