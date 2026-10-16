import { describe,expect,it } from 'vitest';
import { mergeSubscriptionBodies,gatewayVariants } from '../src/subscription-merge';
import { rewriteSubscription } from '../src/subscription-addresses';
import type { Env } from '../src/types';
const one='vless://user-id@smart.dr-mirhadi.ir:443?security=tls&type=ws&host=smart.dr-mirhadi.ir&sni=smart.dr-mirhadi.ir&path=%2Fedge%2Fir#Zeus%20Railway%20Edge%20Direct%20Iran';
describe('unified subscriptions',()=>{
 it('merges raw/base64 sources, deduplicating only identical connection identities',()=>{
  const second=one.replace('user-id','other-id');const result=mergeSubscriptionBodies([btoa(one),one.replace(/#.*$/,'#DifferentName')+'\n'+second]);
  expect(atob(result).split('\n')).toHaveLength(2);expect(atob(result)).toContain('other-id');
 });
 it('adds compatible gateway routes with original per-user credentials and independent backups',()=>{
  const env={SUBSCRIPTION_GATEWAYS_JSON:JSON.stringify([{host:'route1.example',paths:['/edge/ir']},{host:'route2.example',paths:['/edge/us']}])} as Env;
  const backup=one.replace('%2Fedge%2Fir','%2Factual-transport');
  const result=gatewayVariants(one+'\n'+backup,env).split('\n');expect(result).toHaveLength(3);
  const added=new URL(result[2]!);expect(added.hostname).toBe('route1.example');expect(added.username).toBe('user-id');expect(added.searchParams.get('path')).toBe('/edge/ir');
 });
 it('removes infrastructure words from all displayed URI names including variants',()=>{
  const result=rewriteSubscription(one,{} as Env,'user');const name=decodeURIComponent(new URL(result).hash);expect(name).toBe('#🇮🇷 ایران · 1');expect(name).not.toMatch(/zeus|railway|edge|direct|vpn/i);
 });
 it('merges Clash proxies and keeps selection groups connected',()=>{
  const a={proxies:[{name:'one',type:'vless',server:'a',uuid:'id'}],'proxy-groups':[{name:'choose',type:'select',proxies:['one']}],rules:['MATCH,choose']};
  const b={proxies:[{name:'two',type:'vless',server:'b',uuid:'id'}]};const result=JSON.parse(mergeSubscriptionBodies([JSON.stringify(a),JSON.stringify(b)]));expect(result.proxies).toHaveLength(2);expect(result['proxy-groups'][0].proxies).toEqual(['one','two']);
 });
});
