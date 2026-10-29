import {expect,it} from 'vitest';
import {testProxyPool} from '../src/panel';
it('checks all unique proxies, preserves input order and bounds concurrency',async()=>{
 let running=0,max=0;const progress:number[]=[];
 const result=await testProxyPool(['socks5://one','http://two','socks5://one','https://three'],async proxy=>{running++;max=Math.max(max,running);await new Promise(r=>setTimeout(r,1));running--;if(proxy.includes('two'))throw Error('secret credentials');return {ok:true,latencyMs:12};},done=>progress.push(done));
 expect(result.map(r=>r.ok)).toEqual([true,false,true]);expect(max).toBeLessThanOrEqual(2);expect(progress).toEqual([1,2,3]);expect(JSON.stringify(result)).not.toContain('secret');
});
it('rejects empty or oversized pools before probing',async()=>{
 const probe=async()=>{throw Error('Must not probe')};await expect(testProxyPool([],probe)).rejects.toThrow('1 and 8');await expect(testProxyPool(Array.from({length:9},(_,i)=>String(i)),probe)).rejects.toThrow('1 and 8');
});
