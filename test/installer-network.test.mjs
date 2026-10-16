import {afterEach,expect,it,vi} from 'vitest';
import {deploymentFetch,closeDeploymentConnections} from '../installer/network.mjs';
afterEach(async()=>{await closeDeploymentConnections();vi.unstubAllGlobals();});
it('resolves only a hostname after network failure and keeps credentials off DNS requests',async()=>{
 const calls=[];vi.stubGlobal('fetch',vi.fn(async(input,init)=>{calls.push([String(input),init]);if(calls.length===1)throw Error('DNS failure');if(calls.length===2)return Response.json({Status:0,Answer:[{type:1,data:'8.8.4.4'}]});return new Response(null,{status:404});}));
 expect((await deploymentFetch('https://network.example/private/path',{headers:{Authorization:'Bearer fake-secret'}})).status).toBe(404);
 expect(calls[1][0]).not.toContain('/private');expect(calls[1][1].headers).toBeUndefined();expect(calls[2][1].headers.Authorization).toContain('fake-secret');expect(calls[2][1].redirect).toBe('error');
});
it('rejects private DNS sinkhole addresses',async()=>{
 const fetcher=vi.fn(async input=>String(input).startsWith('https://8.8.8.8/')?Response.json({Status:0,Answer:[{type:1,data:'10.10.34.36'}]}):Promise.reject(Error('Network failure')));vi.stubGlobal('fetch',fetcher);
 await expect(deploymentFetch('https://sinkhole.example/')).rejects.toThrow('unreachable');expect(fetcher).toHaveBeenCalledTimes(2);
});
it('returns HTTP application errors without retrying different IPs',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:500}));vi.stubGlobal('fetch',fetcher);expect((await deploymentFetch('https://failing.example/')).status).toBe(500);expect(fetcher).toHaveBeenCalledTimes(1);
});
