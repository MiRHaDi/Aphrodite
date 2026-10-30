import {expect,it} from 'vitest';
import {normalizeDomain,connectionDomain,chooseCloudflareDomain} from '../installer/domains.mjs';
it('normalizes hostnames and rejects URLs and wildcard input',()=>{
 expect(normalizeDomain(' Panel.Example.COM ')).toBe('panel.example.com');
 for(const input of ['https://example.com','example.com/path','*.example.com','example.com:443','-bad.example.com'])expect(()=>normalizeDomain(input)).toThrow();
 expect(connectionDomain('panel.example.com',1)).toBe('connect-primary-2.panel.example.com');
});
it('discovers paginated zones, selects longest suffix and scopes account',async()=>{
 const options={token:'fixture',account:'account-a'};const urls=[];
 const request=async url=>{urls.push(url);return urls.length===1?{result:[{name:'example.com',id:'outer',account:{id:'account-a'}}],result_info:{total_pages:2}}:{result:[{name:'sub.example.com',id:'inner',account:{id:'account-a'}}],result_info:{total_pages:2}};};
 await chooseCloudflareDomain(options,{ask:async()=> 'panel.sub.example.com'},{request});
 expect(options.zone).toBe('inner');expect(options.domain).toBe('panel.sub.example.com');expect(urls).toHaveLength(2);
});
it('does not select domains when declined or outside owned zones',async()=>{
 const request=async()=>({result:[{name:'example.com',id:'zone',account:{id:'a'}}]});
 const options={token:'fixture'};await chooseCloudflareDomain(options,{ask:async()=>''},{request});expect(options.domain).toBeUndefined();
 await expect(chooseCloudflareDomain(options,{ask:async()=> 'other.test'},{request})).rejects.toThrow('accessible DNS zone');
});
it('resolves the zone for an explicit hostname without another prompt',async()=>{
 const options={token:'fixture',domain:'panel.example.com'};
 await chooseCloudflareDomain(options,{ask:async()=>{throw Error('Unexpected prompt')}},{request:async()=>({result:[{name:'example.com',id:'zone',account:{id:'account'}}]})});
 expect(options.zone).toBe('zone');expect(options.account).toBe('account');
});
