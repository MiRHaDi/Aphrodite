import {expect,it} from 'vitest';
import {normalizeDomain,connectionDomain,chooseCloudflareDomain} from '../installer/domains.mjs';
it('normalizes hostnames and rejects URLs and wildcard input',()=>{
 expect(normalizeDomain(' Panel.Example.COM ')).toBe('panel.example.com');
 for(const input of ['https://example.com','example.com/path','*.example.com','example.com:443','-bad.example.com'])expect(()=>normalizeDomain(input)).toThrow();
 expect(connectionDomain('panel.example.com',1)).toBe('connect-primary-2.panel.example.com');
});
it('discovers paginated zones, selects longest suffix and scopes account',async()=>{
 const options={token:'fixture',account:'account-a',name:'my-project'};const urls=[];const answers=['2','panel'];
 const request=async url=>{urls.push(url);return urls.length===1?{result:[{name:'example.com',id:'outer',account:{id:'account-a'}}],result_info:{total_pages:2}}:{result:[{name:'sub.example.com',id:'inner',account:{id:'account-a'}}],result_info:{total_pages:2}};};
 await chooseCloudflareDomain(options,{ask:async()=>answers.shift()},{request});
 expect(options.zone).toBe('inner');expect(options.domain).toBe('panel.sub.example.com');expect(urls).toHaveLength(2);
});
it('does not select domains when declined or outside owned zones',async()=>{
 const request=async()=>({result:[{name:'example.com',id:'zone',account:{id:'a'}}]});
 const options={token:'fixture'};await chooseCloudflareDomain(options,{ask:async()=>''},{request});expect(options.domain).toBeUndefined();
 await expect(chooseCloudflareDomain({...options,domain:'other.test'},{ask:async()=>{throw Error('Unexpected prompt')}},{request})).rejects.toThrow('accessible DNS zone');
});
it('retries invalid numbers and defaults the subdomain to the project name',async()=>{
 const options={token:'fixture',name:'test3'};const answers=['example.com','3','1',''];const prompts=[];
 await chooseCloudflareDomain(options,{ask:async prompt=>{prompts.push(prompt);return answers.shift();}},{request:async()=>({result:[{name:'example.com',id:'zone',account:{id:'account'}}]})});
 expect(options.domain).toBe('test3.example.com');expect(prompts[0]).toContain('1) example.com');expect(prompts.at(-1)).toContain('[test3]');
});
it('supports skipping with zero and rejects malformed subdomains',async()=>{
 const request=async()=>({result:[{name:'example.com',id:'zone'}]});const options={name:'test3'};
 await chooseCloudflareDomain(options,{ask:async()=> '0'},{request});expect(options.domain).toBeUndefined();
 const answers=['1','https://bad'];
 await expect(chooseCloudflareDomain(options,{ask:async()=>answers.shift()},{request})).rejects.toThrow('valid subdomain');
});
it('resolves the zone for an explicit hostname without another prompt',async()=>{
 const options={token:'fixture',domain:'panel.example.com'};
 await chooseCloudflareDomain(options,{ask:async()=>{throw Error('Unexpected prompt')}},{request:async()=>({result:[{name:'example.com',id:'zone',account:{id:'account'}}]})});
 expect(options.zone).toBe('zone');expect(options.account).toBe('account');
});
