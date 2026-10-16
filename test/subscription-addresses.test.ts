import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { rewriteSubscription, subscriptionEndpoint } from '../src/subscription-addresses';
import type { Env } from '../src/types';
const env={} as Env;
const link='vless://test-id@vpn.dr-mirhadi.ir:443?security=tls&type=ws&sni=vpn.dr-mirhadi.ir&host=vpn.dr-mirhadi.ir&path=%2Fedge%2Fir#My%20VPN%20Iran';
describe('subscription public addresses',()=>{
  it('uses smart with matching TLS identity and preserves credentials and route',()=>{
    const u=new URL(rewriteSubscription(link,env,'test'));
    expect(u.hostname).toBe('smart.dr-mirhadi.ir');expect(u.username).toBe('test-id');
    expect(u.searchParams.get('sni')).toBe('smart.dr-mirhadi.ir');expect(u.searchParams.get('host')).toBe('smart.dr-mirhadi.ir');
    expect(u.searchParams.get('path')).toBe('/edge/ir');expect(decodeURIComponent(u.hash)).toBe('#🇮🇷 ایران · 1');
  });
  it('preserves independent Railway backup addresses and non-WebSocket protocols',()=>{
    const backup=link.replaceAll('vpn.dr-mirhadi.ir','backup.up.railway.app');
    expect(new URL(rewriteSubscription(backup,env,'test')).hostname).toBe('backup.up.railway.app');
    expect(new URL(rewriteSubscription(link.replace('type=ws','type=grpc'),env,'test')).hostname).toBe('vpn.dr-mirhadi.ir');
  });
  it('preserves base64 encoding and cleans VMess display names',()=>{
    const vmess='vmess://'+btoa(JSON.stringify({id:'secret',ps:'VPN Smart',add:'vpn.dr-mirhadi.ir',host:'vpn.dr-mirhadi.ir',sni:'vpn.dr-mirhadi.ir',net:'ws'}));
    const result=atob(rewriteSubscription(btoa(link+'\n'+vmess),env,'test')).split('\n');
    const v=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(result.find(line=>line.startsWith('vmess://'))!.slice(8)),c=>c.charCodeAt(0))));expect(v.ps).toBe('🧠 هوشمند · 1');expect(v.id).toBe('secret');expect(v.add).toBe('smart.dr-mirhadi.ir');
  });
  it('keeps YAML group references valid when names change',()=>{
    const result=parse(rewriteSubscription('proxies:\n - name: VPN Iran\n   server: vpn.dr-mirhadi.ir\nproxy-groups:\n - name: VPN Smart\n   proxies: [VPN Iran]\nrules: ["MATCH,VPN Smart"]',env,'test'));
    expect(result.proxies[0].server).toBe('smart.dr-mirhadi.ir');expect(result['proxy-groups'][0].proxies).toEqual(['🇮🇷 ایران · 1']);expect(result.rules).toEqual(['MATCH,🧠 هوشمند · 2']);
  });
  it('rotates only configured valid tuples and keeps each TLS tuple together',()=>{
    const pool={EDGE_ROTATION_MINUTES:'1',EDGE_ENDPOINTS_JSON:JSON.stringify([{address:'2606:4700::1111',sni:'one.example',host:'one.example'},{address:'two.example',sni:'two.example',host:'two.example'}])} as Env;
    const a=subscriptionEndpoint(pool,'test',0),b=subscriptionEndpoint(pool,'test',60000);expect(a).not.toEqual(b);
    const u=new URL(rewriteSubscription(link,pool,'test',0));expect(u.searchParams.get('sni')).toBe(a.sni);expect(u.searchParams.get('host')).toBe(a.host);
    expect(subscriptionEndpoint({EDGE_ENDPOINTS_JSON:'[{"address":"bad/path"}]'} as Env,'test').address).toBe('smart.dr-mirhadi.ir');
  });
});
