import {it,expect,vi} from 'vitest';
import {deployWildcardGateway} from '../installer/wildcard.mjs';
const options={name:'fixture',wildcardDomain:'example.com',zone:'zone',zoneName:'example.com',account:'fixture-account',token:'fake-token'};
it('protects existing DNS names and routes before enabling the fallback and skips repeated writes',async()=>{
 const records=[{name:'mail.example.com',type:'A',content:'192.0.2.2'},{name:'control.example.com',type:'CNAME',content:'control.pages.dev'}],routes=[],writes=[];
 const request=async(url,init)=>{
  if(init.method==='POST'){writes.push({url,...init});if(url.endsWith('/workers/routes'))routes.push(init.body);else records.push(init.body);return {result:{}};}
  return {result:url.includes('/workers/routes')?routes:records};
 };
 const deploy=vi.fn(async()=>({url:'https://gateway.workers.dev'})),build=async()=>({code:'fixture'}),checkTls=vi.fn(async()=>true),env={WILDCARD_GATEWAY_TOKEN:'fake-gateway-token'},central={url:'https://control.example.com',providerUrl:'https://control.pages.dev'};
 const result=await deployWildcardGateway(options,env,central,{request,deploy,build,checkTls,checkManagement:async()=>true});
 expect(result.tlsVerified).toBe(true);expect(writes.at(-1).body).toEqual({pattern:'*.example.com/*',script:'fixture-subscriptions'});
 expect(writes.slice(0,2).map(item=>item.body)).toEqual([{pattern:'mail.example.com/*'},{pattern:'control.example.com/*'}]);expect(records[0].content).toBe('192.0.2.2');
 writes.length=0;await deployWildcardGateway(options,env,central,{request,deploy,build,checkTls,checkManagement:async()=>true});expect(writes).toHaveLength(0);
});
it('does not overwrite another wildcard route or wildcard DNS destination',async()=>{
 const deploy=vi.fn(),checkTls=vi.fn();
 await expect(deployWildcardGateway(options,{WILDCARD_GATEWAY_TOKEN:'fake'},{url:'https://control.example.com'},{deploy,checkTls,request:async()=>({result:[{pattern:'*.example.com/*',script:'another-service'}]})})).rejects.toThrow('another service');expect(deploy).not.toHaveBeenCalled();
 await expect(deployWildcardGateway(options,{WILDCARD_GATEWAY_TOKEN:'fake'},{url:'https://control.example.com'},{deploy,checkTls,request:async url=>({result:url.includes('/workers/routes')?[]:[{name:'*.example.com',type:'CNAME',content:'another.example.com',proxied:true}]})})).rejects.toThrow('another destination');expect(deploy).not.toHaveBeenCalled();
});
it('keeps Worker custom domains on their original service and removes a newly added broad route when health fails',async()=>{
 const writes=[];
 const request=async(url,init)=>{
  if(init.method){writes.push({url,...init});return {result:{id:'new-wildcard-route'}};}
  if(url.endsWith('/workers/domains'))return {result:[{hostname:'control.example.com',service:'original-control'}]};
  return {result:url.includes('/dns_records')?[{name:'control.example.com',type:'CNAME',content:'original-control.workers.dev'}]:[]};
 };
 await expect(deployWildcardGateway(options,{WILDCARD_GATEWAY_TOKEN:'fake'},{url:'https://control.example.com'},{request,build:async()=>({}),deploy:async()=>({url:'https://gateway.workers.dev'}),checkManagement:async()=>{throw Error('health failed')},checkTls:async()=>true})).rejects.toThrow('health failed');
 expect(writes[0].body).toEqual({pattern:'control.example.com/*',script:'original-control'});expect(writes.at(-1)).toMatchObject({method:'DELETE',url:expect.stringContaining('/workers/routes/new-wildcard-route')});
});
