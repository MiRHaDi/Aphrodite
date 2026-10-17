import {describe,expect,it,vi} from 'vitest';
import {privateApplication,managementPrefix} from '../src/private-entry';
import type {Env} from '../src/types';
const env={ADMIN_PATH:'12345678-1234-4123-8123-123456789abc'} as Env;
const ctx={} as ExecutionContext;
describe('private entry points',()=>{
 it('returns an empty response for public probes without invoking the application',async()=>{
  const fetch=vi.fn(()=>new Response('secret'));const app=privateApplication({fetch});
  for(const path of ['/','/panel','/api/users','/feed','/healthz','/anything','/edge/us']){const response=await app.fetch(new Request('https://example.test'+path),env,ctx);expect(await response.text()).toBe('');expect(response.status).toBe(404);}
  expect(fetch).not.toHaveBeenCalled();
 });
 it('maps a configured private panel and scopes its API requests',async()=>{
  const fetch=vi.fn((request:Request)=>new Response('<html><head></head></html>',{headers:{'content-type':'text/html'}}));
  const app=privateApplication({fetch}),prefix=managementPrefix(env)!;
  const response=await app.fetch(new Request('https://example.test'+prefix),env,ctx);
  expect(new URL(fetch.mock.calls[0]![0].url).pathname).toBe('/panel');expect(await response.text()).toContain(prefix);
  await app.fetch(new Request('https://example.test'+prefix+'/api/users'),env,ctx);expect(new URL(fetch.mock.calls[1]![0].url).pathname).toBe('/api/users');
 });
 it('does not leak errors or enable a panel without an installed path',async()=>{
  const app=privateApplication({fetch:()=>{throw Error('Internal detail')}});
  expect(await (await app.fetch(new Request('https://example.test/feed/user'),env,ctx)).text()).toBe('');
  expect(managementPrefix({ADMIN_PATH:'panel'} as Env)).toBeNull();
 });
 it('passes the original key internally for migrated legacy links without rotating it',async()=>{
  const key='b'.repeat(64);const queries:string[]=[];
  const DB={prepare:(sql:string)=>{queries.push(sql);return {bind:()=>({first:async()=>({username:'iust',token:key,legacy_allowed:1})})}}};
  const handler=vi.fn((request:Request)=>new Response(new URL(request.url).searchParams.get('token')===key?'subscription':'denied'));
  const response=await privateApplication({fetch:handler}).fetch(new Request('https://example.test/feed/iust?format=raw'),{...env,DB} as unknown as Env,ctx);
  expect(await response.text()).toBe('subscription');
  const forwarded=new URL(handler.mock.calls[0]![0].url);expect(forwarded.searchParams.get('format')).toBe('raw');
  expect(queries.every(sql=>sql.startsWith('SELECT '))).toBe(true);
 });
 it('does not give token-only users or invalid supplied tokens legacy access',async()=>{
  const handler=vi.fn(()=>new Response('private'));
  const DB={prepare:()=>({bind:()=>({first:async()=>({username:'new-user',token:'c'.repeat(64),legacy_allowed:0})})})};
  const app=privateApplication({fetch:handler}),settings={...env,DB} as unknown as Env;
  for(const path of ['/feed/new-user','/feed/new-user?token=wrong'])expect((await app.fetch(new Request('https://example.test'+path),settings,ctx)).status).toBe(404);
  expect(handler).not.toHaveBeenCalled();
 });
});
