import {afterEach,expect,it,vi} from 'vitest';
import {activity,requestLabel,setProgressReporter} from '../installer/progress.mjs';
afterEach(()=>{setProgressReporter(undefined);vi.useRealTimers();});
it('reports waiting, completion and stops its timer',async()=>{
 vi.useFakeTimers();const events=[];setProgressReporter(e=>events.push(e));
 let finish;const pending=activity('Upload','آپلود',()=>new Promise(r=>finish=r));
 await vi.advanceTimersByTimeAsync(10000);expect(events.filter(e=>e.level==='waiting')).toHaveLength(2);
 finish(42);expect(await pending).toBe(42);expect(events.at(-1).level).toBe('done');
 const count=events.length;await vi.advanceTimersByTimeAsync(10000);expect(events).toHaveLength(count);
});
it('does not include secret error text or private URL components in progress',async()=>{
 const events=[];setProgressReporter(e=>events.push(e));
 await expect(activity('Upload','آپلود',async()=>{throw Error('SECRET');})).rejects.toThrow('SECRET');
 expect(JSON.stringify(events)).not.toContain('SECRET');
 expect(requestLabel('https://api.cloudflare.com/client/v4/accounts/SECRET/d1/database/PRIVATE/query?token=SECRET','POST')).toBe('POST D1 API');
});
