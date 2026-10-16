import {describe,expect,it} from 'vitest';
import {subscriptionOwner} from '../src/subscription-keys';
import type {Env} from '../src/types';
function env(legacy:number){return {DB:{prepare:()=>({bind:()=>({first:async()=>({username:'account',token:'a'.repeat(64),legacy_allowed:legacy})})})}} as unknown as Env;}
describe('private subscription links',()=>{
 it('allows frozen existing links but requires tokens for new accounts',async()=>{
  const request=new Request('https://example.test/feed/account');
  expect(await subscriptionOwner(request,env(1))).toBe('account');expect(await subscriptionOwner(request,env(0))).toBeNull();
 });
 it('accepts opaque links and rejects an invalid token even for a legacy account',async()=>{
  expect(await subscriptionOwner(new Request('https://example.test/'+'a'.repeat(64)),env(0))).toBe('account');
  expect(await subscriptionOwner(new Request('https://example.test/feed/account?token=wrong'),env(1))).toBeNull();
  expect(await subscriptionOwner(new Request('https://example.test/feed'),env(1))).toBeNull();
 });
});
