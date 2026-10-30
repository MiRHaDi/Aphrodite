import {it,expect} from 'vitest';
import {availablePagesDomain} from '../installer/domains.mjs';
it('selects a free numbered hostname without overwriting conflicts',async()=>{
 const seen=[];
 const result=await availablePagesDomain('test.example.com','test.pages.dev',async host=>{seen.push(host);return seen.length<3?[{type:'A',content:'192.0.2.1'}]:[];});
 expect(result).toBe('test-3.example.com');expect(seen).toEqual(['test.example.com','test-2.example.com','test-3.example.com']);
});
it('reuses matching CNAMEs and bounds conflict retries',async()=>{
 expect(await availablePagesDomain('test.example.com','test.pages.dev',async()=>[{type:'CNAME',content:'TEST.pages.dev.'}])).toBe('test.example.com');
 let count=0;await expect(availablePagesDomain('test.example.com','test.pages.dev',async()=>{count++;return [{type:'CNAME',content:'other.pages.dev'}];})).rejects.toThrow('50 DNS checks');expect(count).toBe(50);
});
