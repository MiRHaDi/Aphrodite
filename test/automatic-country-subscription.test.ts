import {expect,it,vi} from 'vitest';
vi.mock('../src/native-accounts',()=>({ledger:async()=>Response.json({usedBytes:0,requests:0})}));
import {nativeSubscription} from '../src/native-subscription';
import {nativeDefaults} from '../src/native-types';
import type {Env} from '../src/types';
it('publishes verified countries in the fetched subscription and removes expired ones without changing credentials',async()=>{
 const token='a'.repeat(64),uuid='11111111-1111-4111-a111-111111111111';
 const account={username:'fixture',uuid,subscription_key:token,enabled:1,expires_at:null,settings_json:JSON.stringify(nativeDefaults),revision:1,created_at:1,updated_at:1};
 const env={AUTO_COUNTRY_EXITS:'true',PUBLIC_EDGE_HOST:'fixture.example',VERIFIED_COUNTRY_EXITS_JSON:JSON.stringify(['ca','ch','ar','vn','jp'].map(country=>({country,proxy:'http://8.8.8.8:8080/',expires:Date.now()+60000})).concat([{country:'us',proxy:'http://9.9.9.9:8080/',expires:Date.now()-1}]))} as Env;
 const response=await nativeSubscription(new Request('https://fixture.example/'+token+'?format=raw',{headers:{'User-Agent':'test'}}),env,account);
 expect(response.status).toBe(200);
 const body=await response.text(),links=body.trim().split('\n').map(line=>new URL(line));
 expect(links).toHaveLength(6);expect(links.every(u=>u.username===uuid)).toBe(true);
 expect(links.map(u=>u.searchParams.get('path')).sort()).toEqual(['/edge/native','/edge/native/ar','/edge/native/ca','/edge/native/ch','/edge/native/jp','/edge/native/vn']);
 expect(account.subscription_key).toBe(token);
});
