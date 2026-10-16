import { describe, expect, it } from 'vitest';
import { AccountState } from '../src/account-state';
import { parseNativeSettings, nativeDefaults, type NativeAccount } from '../src/native-types';
import { nativeLinks, selectedAddresses } from '../src/native-subscription';
import { parseVless, publicAddress, BufferedReader } from '../src/native-network';

const uuid='12345678-1234-4123-8123-123456789abc';
function account(settings:Record<string,unknown>={}):NativeAccount{return {username:'native-test',uuid,enabled:1,expires_at:null,settings_json:JSON.stringify({...nativeDefaults,...settings}),revision:1,created_at:Math.floor(Date.now()/1000),updated_at:0}}
function state(){const values=new Map();const store={get:async(k:string)=>structuredClone(values.get(k)),put:async(k:string,v:unknown)=>{values.set(k,structuredClone(v))}};const object=new AccountState({storage:{transaction:async(fn:(s:typeof store)=>unknown)=>fn(store)}} as unknown as DurableObjectState);return async(path:string,account:NativeAccount,extra:Record<string,unknown>={})=>object.fetch(new Request('https://account.test'+path,{method:'POST',body:JSON.stringify({account,...extra})}))}
describe('native account accounting',()=>{
  it('enforces byte ceilings and refunds unused reservations',async()=>{
    const fetch=state(),a=account({dataLimitBytes:1000});const opened=await fetch('/open',a,{lease:'one',ip:'ip1'});expect((await opened.json() as {granted:number}).granted).toBe(1000);
    expect((await fetch('/open',a,{lease:'two',ip:'ip2'})).status).toBe(403);
    await fetch('/close',a,{lease:'one',consumed:400});const status=await (await fetch('/status',a)).json() as {usedBytes:number;lifetimeBytes:number};expect(status.usedBytes).toBe(400);expect(status.lifetimeBytes).toBe(400);
    expect((await (await fetch('/open',a,{lease:'three',ip:'ip3'})).json() as {granted:number}).granted).toBe(600);
  });
  it('limits distinct IPs, simultaneous sessions and total requests',async()=>{
    const fetch=state(),a=account({maxIps:1,maxConnections:2,requestLimit:2});expect((await fetch('/open',a,{lease:'a',ip:'same'})).status).toBe(200);
    expect((await fetch('/open',a,{lease:'b',ip:'other'})).status).toBe(429);expect((await fetch('/open',a,{lease:'b',ip:'same'})).status).toBe(200);expect((await fetch('/open',a,{lease:'c',ip:'same'})).status).toBe(429);
    await fetch('/close',a,{lease:'a'});await fetch('/close',a,{lease:'b'});expect((await fetch('/open',a,{lease:'d',ip:'same'})).status).toBe(429);
  });
  it('rejects stale policies, expiration, disabled users and forged byte counts',async()=>{
    const fetch=state(),a=account();await fetch('/configure',{...a,revision:2});expect((await fetch('/open',a,{lease:'one'})).status).toBe(409);
    expect((await fetch('/open',{...a,revision:2,enabled:0},{lease:'one'})).status).toBe(403);
    expect((await fetch('/open',{...a,revision:2,expires_at:1},{lease:'one'})).status).toBe(403);
    await fetch('/open',{...a,revision:2},{lease:'one'});expect((await fetch('/close',{...a,revision:2},{lease:'one',consumed:999999999})).status).toBe(400);
  });
});
describe('native protocol and subscriptions',()=>{
  it('parses fragmented VLESS headers and rejects unsupported UDP',()=>{
    const id=Uint8Array.from(uuid.replaceAll('-','').match(/../g)!.map(byte=>parseInt(byte,16)));const host=new TextEncoder().encode('example.com');
    const bytes=new Uint8Array([0,...id,0,1,0,80,2,host.length,...host,1,2]);expect(parseVless(bytes.slice(0,15))).toBeNull();const parsed=parseVless(bytes)!;expect(parsed.uuid).toBe(uuid);expect(parsed.host).toBe('example.com');expect(parsed.port).toBe(80);expect(bytes.slice(parsed.offset)).toEqual(Uint8Array.of(1,2));bytes[18]=2;expect(()=>parseVless(bytes)).toThrow('Only DNS UDP');
  });
  it('rejects local destinations including mapped IPv6',()=>{
    for(const host of ['127.0.0.1','10.0.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1'])expect(publicAddress(host)).toBe(false);
    expect(publicAddress('1.1.1.1')).toBe(true);expect(publicAddress('2606:4700::1111')).toBe(true);
  });
  it('handles fragmented proxy responses without losing payload bytes',async()=>{
    const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(Uint8Array.of(5));controller.enqueue(Uint8Array.of(0,10,20));controller.close()}});const reader=new BufferedReader(stream.getReader());expect(await reader.exact(2)).toEqual(Uint8Array.of(5,0));expect(reader.take()).toEqual(Uint8Array.of(10,20));
  });
  it('rotates IPv6/IPv4 address pools while preserving credentials and TLS identity',()=>{
    const a=account({addresses:['2606:4700::1111','1.1.1.1','8.8.8.8'],addressCount:2,rotationMinutes:1,ports:[443,8443]});expect(selectedAddresses(a,'edge.example',0)).not.toEqual(selectedAddresses(a,'edge.example',60000));
    const links=nativeLinks(a,'edge.example',0);expect(links).toHaveLength(4);for(const link of links){const url=new URL(link);expect(url.username).toBe(uuid);expect(url.searchParams.get('sni')).toBe('edge.example');expect(url.searchParams.get('path')).toBe('/edge/native')}
  });
  it('validates limits and refuses insecure transport configurations',()=>{
    expect(parseNativeSettings({ports:[80]})).toBeNull();expect(parseNativeSettings({maxIps:-1})).toBeNull();expect(parseNativeSettings({fingerprint:'unsafe'})).toBeNull();expect(parseNativeSettings({proxies:['file:///secret']})).toBeNull();expect(parseNativeSettings({addresses:['bad/path']})).toBeNull();expect(parseNativeSettings({})).not.toBeNull();
  });
});
