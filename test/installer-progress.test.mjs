import {afterEach,expect,it,vi} from 'vitest';
import {activity,report,requestLabel,setProgressReporter} from '../installer/progress.mjs';
import {jsonRequest,run} from '../installer/common.mjs';
afterEach(()=>{setProgressReporter(undefined);vi.useRealTimers();vi.unstubAllGlobals();});
it('reports waiting, completion and stops its timer',async()=>{
 vi.useFakeTimers();const events=[];setProgressReporter(e=>events.push(e));
 let finish;const pending=activity('Upload',()=>new Promise(r=>finish=r));
 await vi.advanceTimersByTimeAsync(10000);expect(events.filter(e=>e.level==='waiting')).toHaveLength(2);
 finish(42);expect(await pending).toBe(42);expect(events.at(-1).level).toBe('done');
 const count=events.length;await vi.advanceTimersByTimeAsync(10000);expect(events).toHaveLength(count);
 expect(events.map(event=>event.sequence)).toEqual(events.map((_,i)=>i+1));
});
it('uses a single sequence across phase and nested operation events',async()=>{
 const events=[];setProgressReporter(e=>events.push(e));
 report('Configure','step');await activity('Outer',async()=>{report('Details');await activity('Inner',async()=>{});});
 expect(events.map(e=>e.sequence)).toEqual([1,2,3,4,5,6]);
 setProgressReporter(e=>events.push(e));report('New session');expect(events.at(-1).sequence).toBe(1);
});
it('reports API status and failure without leaking credentials or response contents',async()=>{
 const events=[];setProgressReporter(e=>events.push(e));
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({secret:'PRIVATE_VALUE'},{status:503})));
 await expect(jsonRequest('https://api.cloudflare.com/client/v4/accounts/PRIVATE_VALUE/d1/database/PRIVATE_VALUE/query',{token:'PRIVATE_VALUE',method:'POST',body:{secret:'PRIVATE_VALUE'}})).rejects.toThrow('503');
 expect(events.some(e=>e.message.includes('HTTP 503'))).toBe(true);
 expect(events.at(-1).level).toBe('error');expect(JSON.stringify(events)).not.toContain('PRIVATE_VALUE');
});
it('logs process start and exit while retaining raw output privately',async()=>{
 const events=[];setProgressReporter(e=>events.push(e));
 expect(await run(process.execPath,['-e',"process.stdout.write('private-fake-value')"],{label:'Deployment test tool'})).toBe('private-fake-value');
 expect(events.some(e=>e.message.includes('process started'))).toBe(true);
 expect(events.some(e=>e.message.includes('exit code 0'))).toBe(true);
 expect(JSON.stringify(events)).not.toContain('private-fake-value');
});
it('does not include secret error text or private URL components in progress',async()=>{
 const events=[];setProgressReporter(e=>events.push(e));
 await expect(activity('Upload',async()=>{throw Error('SECRET');})).rejects.toThrow('SECRET');
 expect(JSON.stringify(events)).not.toContain('SECRET');
 expect(requestLabel('https://api.cloudflare.com/client/v4/accounts/SECRET/d1/database/PRIVATE/query?token=SECRET','POST')).toBe('Execute D1 database query');
});
