import {it,expect} from 'vitest';
import {availablePagesDomain,selectPagesDomain,bindPagesDns,domainParts} from '../installer/domains.mjs';
it.each(['dr-mirhadi.ir','example.co.uk'])('keeps root conflicts inside the selected zone %s and never uses mail records',async zoneName=>{
 const seen=[],prompts=[];
 const result=await selectPagesDomain(zoneName,'fixture.pages.dev',async host=>{seen.push(host);return host===zoneName?[{id:'web',type:'A',content:'192.0.2.1'},{id:'mail',type:'MX',content:'mail.'+zoneName}]:[];},async prompt=>{prompts.push(prompt);return '2';},{zoneName,projectName:'test3'});
 expect(result.domain).toBe('test3.'+zoneName);expect(seen).toEqual([zoneName,'test3.'+zoneName]);expect(prompts[0]).toContain('A 192.0.2.1');expect(prompts[0]).not.toContain('mail.');expect(prompts[0]).not.toContain('MX ');
});
it('rejects an out-of-zone hostname before querying DNS',async()=>{
 let calls=0;
 await expect(selectPagesDomain('dr-mirhadi-2.ir','fixture.pages.dev',async()=>{calls++;return [];},async()=> '2',{zoneName:'dr-mirhadi.ir',projectName:'test3'})).rejects.toThrow('outside');expect(calls).toBe(0);
 expect(domainParts('app.dr-mirhadi.ir','dr-mirhadi.ir')).toEqual({zoneName:'dr-mirhadi.ir',subdomain:'app'});
});
it('does not create CNAMEs over mail-only records',async()=>{
 const records=[{id:'mail',type:'MX',content:'mail.example.com'}];
 await expect(selectPagesDomain('example.com','fixture.pages.dev',async()=>records,async()=> '1',{zoneName:'example.com'})).rejects.toThrow('non-address');
 let writes=0;await expect(bindPagesDns('example.com','fixture.pages.dev',{readRecords:async()=>records,createRecord:async()=>writes++,replaceRecord:async()=>writes++})).rejects.toThrow('DNS changed');expect(writes).toBe(0);
});
it('selects a free numbered hostname without overwriting conflicts',async()=>{
 const seen=[];
 const result=await availablePagesDomain('test.example.com','test.pages.dev',async host=>{seen.push(host);return seen.length<3?[{type:'A',content:'192.0.2.1'}]:[];},{zoneName:'example.com'});
 expect(result).toBe('test-3.example.com');expect(seen).toEqual(['test.example.com','test-2.example.com','test-3.example.com']);
});
it('asks before reusing an existing hostname and preserves its exact URL',async()=>{
 const record={id:'record',name:'test.example.com',type:'CNAME',content:'old.pages.dev',proxied:true};const prompts=[];
 const selection=await selectPagesDomain(record.name,'new.pages.dev',async()=>[record],async prompt=>{prompts.push(prompt);return '1';});
 expect(selection.domain).toBe(record.name);expect(selection.replacement).toEqual(record);expect(prompts[0]).toContain('old.pages.dev');
 const updates=[];
 await bindPagesDns(selection.domain,'new.pages.dev',{readRecords:async()=>[record],createRecord:async()=>{throw Error('Unexpected create')},replaceRecord:async(id,body)=>updates.push({id,body})},selection.replacement);
 expect(updates).toEqual([{id:'record',body:{type:'CNAME',name:record.name,content:'new.pages.dev',proxied:true,ttl:1}}]);
});
it('keeps matching DNS untouched or selects a new hostname when requested',async()=>{
 const record={id:'record',type:'CNAME',content:'test.pages.dev'};
 const keep=await selectPagesDomain('test.example.com','test.pages.dev',async()=>[record],async()=> '');
 expect(keep).toEqual({domain:'test.example.com'});
 await bindPagesDns(keep.domain,'test.pages.dev',{readRecords:async()=>[record],createRecord:async()=>{throw Error('Unexpected create')},replaceRecord:async()=>{throw Error('Unexpected update')}});
 const changed=await selectPagesDomain('test.example.com','test.pages.dev',async domain=>domain==='test.example.com'?[record]:[],async()=> '2',{zoneName:'example.com',promptMatching:true});
 expect(changed).toEqual({domain:'test-2.example.com'});
});
it('does not replace DNS without an interactive decision or after concurrent changes',async()=>{
 const record={id:'record',name:'test.example.com',type:'A',content:'192.0.2.1'};
 await expect(selectPagesDomain(record.name,'new.pages.dev',async()=>[record])).rejects.toMatchObject({code:'DOMAIN_DECISION_REQUIRED'});
 await expect(bindPagesDns(record.name,'new.pages.dev',{readRecords:async()=>[{...record,content:'192.0.2.2'}],replaceRecord:async()=>{throw Error('Unexpected update')}},record)).rejects.toThrow('DNS changed after selection');
 await expect(selectPagesDomain(record.name,'new.pages.dev',async()=>[record,{type:'TXT',content:'retain me'}],async()=> '1')).rejects.toThrow('multiple or non-address');
});
it('reuses matching CNAMEs and bounds conflict retries',async()=>{
 expect(await availablePagesDomain('test.example.com','test.pages.dev',async()=>[{type:'CNAME',content:'TEST.pages.dev.'}])).toBe('test.example.com');
 let count=0;await expect(availablePagesDomain('test.example.com','test.pages.dev',async()=>{count++;return [{type:'CNAME',content:'other.pages.dev'}];},{zoneName:'example.com'})).rejects.toThrow('50 DNS checks');expect(count).toBe(50);
});
