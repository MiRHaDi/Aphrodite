import {it,expect,vi,afterEach} from 'vitest';
import {subscriptionPathFor,subscriptionUrlFor,subscriptionUuid} from '../src/subscription-keys.ts';
import {privateApplication} from '../src/private-entry.ts';
import gateway from '../src/subscription-gateway.ts';
const token='a'.repeat(64),uuid='12345678-1234-4123-8123-123456789abc';
const DB={prepare:sql=>({bind:(value)=>({first:async()=>sql.includes('WHERE token=')?value===token?{username:'mirhadi'}:null:sql.includes('SELECT uuid')?{uuid}:{token,legacy_allowed:0}})})};
const env={DB,ADMIN_PATH:'private-administrator-path',PUBLIC_EDGE_HOST:'control.example.com',SUBSCRIPTION_DOMAIN:'example.com',SUBSCRIPTION_ID_MODE:'username'};
afterEach(()=>vi.unstubAllGlobals());
it('adds username or UUID without rotating the existing key and keeps old opaque links',async()=>{
 expect(subscriptionPathFor({},'mirhadi',token,uuid)).toBe('/'+token);expect(subscriptionPathFor(env,'mirhadi',token,uuid)).toBe('/'+token+'/mirhadi');
 expect(subscriptionUrlFor(env,'https://control.example.com','mirhadi',token,uuid)).toBe('https://mirhadi.example.com/'+token+'/mirhadi');
 expect(subscriptionUrlFor({...env,SUBSCRIPTION_ID_MODE:'uuid'},'https://control.example.com','mirhadi',token,uuid)).toBe('https://'+uuid+'.example.com/'+token+'/'+uuid);
 expect(subscriptionUrlFor(env,'https://control.example.com','invalid_label',token,uuid)).toContain('https://'+uuid+'.example.com/');
 expect(subscriptionUrlFor({...env,SUBSCRIPTION_RESERVED_HOSTS_JSON:'["mail"]'},'https://control.example.com','mail',token,uuid)).toContain('https://'+uuid+'.example.com/');
 const app=privateApplication({fetch:request=>new Response(new URL(request.url).pathname)});
 for(const suffix of ['', '/mirhadi','/'+uuid])expect(await(await app.fetch(new Request('https://control.example.com/'+token+suffix),env,{})).text()).toBe('/feed/mirhadi');
 expect((await app.fetch(new Request('https://control.example.com/'+token+'/other-user'),env,{})).status).toBe(404);
});
it('provides a stable UUID alias for upstream users without changing their backend identity',()=>{
 const alias=subscriptionUuid(token);expect(alias).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
 expect(subscriptionPathFor({SUBSCRIPTION_ID_MODE:'uuid'},'upstream-user',token)).toBe('/'+token+'/'+alias);expect(subscriptionUuid(token)).toBe(alias);
});
it('requires both the correct host identity and a valid key; primary administration stays available',async()=>{
 const app=privateApplication({fetch:request=>new Response(new URL(request.url).pathname)});
 for(const label of ['mirhadi',uuid])expect((await app.fetch(new Request('https://'+label+'.example.com/'+token),env,{})).status).toBe(200);
 for(const url of ['https://other.example.com/'+token,'https://mirhadi.example.com/feed/mirhadi','https://mirhadi.example.com/','https://mirhadi.example.com/'+env.ADMIN_PATH])expect((await app.fetch(new Request(url),env,{})).status).toBe(404);
 expect((await app.fetch(new Request('https://control.example.com/'+env.ADMIN_PATH),env,{})).status).toBe(200);
});
it('limits the gateway to subscription reads on its configured origin and rejects redirects',async()=>{
 const settings={WILDCARD_BASE_DOMAIN:'example.com',WILDCARD_UPSTREAM_URL:'https://control.pages.dev',EDGE_CONTROL_TOKEN:'fixture-gateway-secret',EDGE_PROBE_PATH:'fixture-probe'};
 const fetcher=vi.fn(async()=>new Response('subscription'));vi.stubGlobal('fetch',fetcher);
 expect(await(await gateway.fetch(new Request('https://mirhadi.example.com/'+token),settings)).text()).toBe('subscription');
 const forwarded=fetcher.mock.calls[0][0];expect(new URL(forwarded.url).hostname).toBe('control.pages.dev');expect(forwarded.headers.get('x-aphrodite-original-host')).toBe('mirhadi.example.com');
 for(const path of ['/','/api/users','/edge/native','/private-management'])expect((await gateway.fetch(new Request('https://mirhadi.example.com'+path),settings)).status).toBe(404);
 expect(fetcher).toHaveBeenCalledTimes(1);
 fetcher.mockImplementation(async()=>new Response(null,{status:302,headers:{location:'https://untrusted.test'}}));expect((await gateway.fetch(new Request('https://mirhadi.example.com/'+token),settings)).status).toBe(404);
});
