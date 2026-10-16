import {describe,expect,it} from 'vitest';
import {parse} from 'yaml';
import {clientProfile,profileHeaders} from '../src/client-profiles';
import {nativeSingBox,renderClientSubscription} from '../src/client-renderer';
const request=(agent:string,query='')=>new Request('https://example.test/private-subscription'+query,{headers:{'user-agent':agent}});
const uuid='12345678-1234-4123-8123-123456789abc';
describe('one-URL client negotiation',()=>{
  it.each([
    ['Happ/1.64.0','happ','base64','v2ray'],
    ['HiddifyNext/2.0.0','hiddify','sing-box','sing-box'],
    ['HiddifyNextX/2.0.0','hiddify','sing-box','sing-box'],
    ['v2rayN/7.13.0','v2rayn','xray','v2ray-json'],
    ['v2rayN/5.0','v2rayn','base64','v2ray'],
    ['v2rayNG/1.8.29','v2rayng','xray','v2ray-json'],
    ['v2rayNG/1.8.28','v2rayng','base64','v2ray'],
    ['Clash.Meta/1.19','mihomo','clash','clash-meta'],
    ['Clash-Verge/2.0','mihomo','clash','clash-meta'],
    ['Stash/3.0','stash','clash','clash-meta'],
    ['SFA/1.11.0','sing-box','sing-box','sing-box'],
    ['Karing/1.0','sing-box','sing-box','sing-box'],
    ['Surge/5.0','surge','surge','clash-meta'],
    ['Shadowrocket/2.2','shadowrocket','base64','v2ray'],
    ['v2RayTun/2.0','v2raytun','base64','v2ray'],
    ['Mozilla/5.0','generic','base64','v2ray'],
  ])('negotiates %s', (agent,family,format,upstream)=>{
    expect(clientProfile(request(agent))).toMatchObject({family,format,upstream});
  });
  it('separates caches even where upstream formats match and supports explicit fallback',()=>{
    expect(clientProfile(request('Happ/1.0')).cacheKey).not.toBe(clientProfile(request('Mozilla/5.0')).cacheKey);
    expect(clientProfile(request('Surge/5.0')).cacheKey).not.toBe(clientProfile(request('Clash.Meta')).cacheKey);
    expect(clientProfile(request('Happ/1.0','?format=clash-meta')).format).toBe('clash');
    expect(clientProfile(request('Mozilla/5.0','?format=xray')).upstream).toBe('v2ray-json');
  });
  it('keeps quota headers, limits routing to Happ, and declares response variance',()=>{
    const base=new Headers({routing:'happ://test','subscription-userinfo':'download=12; total=100','vary':'Accept-Encoding'});
    const h=profileHeaders(clientProfile(request('Happ/1.0')),base);
    expect(h.get('routing')).toBe('happ://test');expect(h.get('subscription-userinfo')).toContain('download=12');
    expect(profileHeaders(clientProfile(request('v2rayN/7.0')),base).has('routing')).toBe(false);
    expect(h.get('vary')).toContain('User-Agent');expect(h.get('vary')).toContain('Accept-Encoding');
  });
});
describe('client-specific rendering',()=>{
  it('keeps independent IPv4 and IPv6 backups when a smart primary exists',()=>{
    const proxies=[{name:'🧠 primary',type:'trojan',server:'primary.example',port:443,password:'test'},{name:'backup 4',type:'trojan',server:'192.0.2.1',port:443,password:'test',sni:'backup.example'},{name:'backup 6',type:'trojan',server:'2001:db8::1',port:443,password:'test',sni:'backup.example'},{name:'🇮🇷 ایران',type:'trojan',server:'iran.example',port:443,password:'test'}];
    const clash=parse(renderClientSubscription(JSON.stringify({proxies}),clientProfile(request('Clash.Meta'))).body);
    for(const kind of ['url-test','fallback'])expect(clash['proxy-groups'].find((g:any)=>g.type===kind).proxies).toEqual(['🧠 primary','backup 4','backup 6']);
    expect(clash.ipv6).toBe(true);expect(clash.proxies).toEqual(proxies);
    const box=JSON.parse(renderClientSubscription(JSON.stringify({outbounds:proxies.map(p=>({type:'trojan',tag:p.name,server:p.server,password:p.password}))}),clientProfile(request('Hiddify/2.0'))).body);
    expect(box.outbounds.find((o:any)=>o.type==='urltest').outbounds).toEqual(['🧠 primary','backup 4','backup 6']);
    const surge=renderClientSubscription(JSON.stringify({proxies}),clientProfile(request('Surge/5.0'))).body;
    expect(surge).toContain('fallback, 🧠 primary, backup 4, backup 6, interval=300');expect(surge).toContain('ipv6 = true');
  });
  const config={proxies:[{name:'🧠 هوشمند · 1',type:'vmess',server:'one.example',port:443,uuid,alterId:0,cipher:'auto',tls:true,servername:'one.example',network:'ws','ws-opts':{path:'/stream',headers:{Host:'one.example'}}},{name:'🇮🇷 ایران · 2',type:'trojan',server:'two.example',port:443,password:'fake-test',network:'tcp'}],'proxy-groups':[{name:'existing',type:'select',proxies:['🧠 هوشمند · 1']}],rules:['DOMAIN,keep.example,existing','MATCH,existing'],dns:{enable:true,nameserver:['https://resolver.example/dns-query']}};
  it('adds automatic and Iran groups without changing secrets, transport or owner DNS',()=>{
    const result=parse(renderClientSubscription(JSON.stringify(config),clientProfile(request('Clash.Meta')),'US').body);
    expect(result.proxies).toEqual(config.proxies);expect(result.dns).toEqual(config.dns);
    expect(result.rules[0]).toMatch(/^DOMAIN-SUFFIX,ir,/);expect(result.rules).toContain('DOMAIN,keep.example,existing');
    expect(result.rules.at(-1)).toBe('MATCH,🧠 هوشمند');expect(result['tcp-concurrent']).toBe(true);
    expect(result['proxy-groups'].find((g:{name:string})=>g.name==='⚡ خودکار').proxies).toEqual(['🧠 هوشمند · 1']);
    const names=new Set([...result.proxies,...result['proxy-groups']].map(p=>p.name));
    for(const group of result['proxy-groups'])for(const name of group.proxies)expect(names.has(name)).toBe(true);
  });
  it('does not put Iranian sites on a direct route for users abroad without an Iran exit',()=>{
    const source={...config,proxies:config.proxies.slice(0,1)};
    const result=parse(renderClientSubscription(JSON.stringify(source),clientProfile(request('Stash')),'US').body);
    expect(result.rules.some((r:string)=>r==='DOMAIN-SUFFIX,ir,DIRECT')).toBe(false);expect(result['tcp-concurrent']).toBeUndefined();
  });
  it('renders sing-box native links and keeps all outbound references valid',()=>{
    const link='vless://'+uuid+'@one.example:443?security=tls&type=ws&sni=one.example&host=one.example&path=%2Fstream#'+encodeURIComponent('🧠 هوشمند · 1');
    const result=JSON.parse(renderClientSubscription(nativeSingBox([link]),clientProfile(request('Hiddify/2.0')),'IR').body);
    const names=new Set(result.outbounds.map((o:{tag:string})=>o.tag));expect(names.has(result.route.final)).toBe(true);
    for(const o of result.outbounds)for(const child of o.outbounds||[])expect(names.has(child)).toBe(true);
    expect(result.outbounds.find((o:{type:string})=>o.type==='vless').uuid).toBe(uuid);
    expect(result.route.rules.some((rule:{domain_suffix?:string[]})=>rule.domain_suffix?.includes('ir'))).toBe(true);
  });
  it('renders Surge compatible nodes and refuses to downgrade unsupported transports',()=>{
    const source={...config,proxies:[...config.proxies,{...config.proxies[0],name:'unsupported',network:'grpc'},{...config.proxies[0],name:'vless-only',type:'vless'}]};
    const rendered=renderClientSubscription(JSON.stringify(source),clientProfile(request('Surge/5.0')),'US').body;
    expect(rendered).toContain('[Proxy Group]');expect(rendered).toContain('username='+uuid);expect(rendered).toContain('ws-path=/stream');expect(rendered).toContain('skip-cert-verify=false');
    expect(rendered).not.toContain('unsupported');expect(rendered).not.toContain('vless-only');
    expect(()=>renderClientSubscription(JSON.stringify({proxies:[{type:'vless'}]}),clientProfile(request('Surge/5.0')))).toThrow('No Surge-compatible');
  });
  it('renders raw links and preserves complete Xray configurations',()=>{
    const link='vless://'+uuid+'@one.example:443#one';
    expect(renderClientSubscription(btoa(link),clientProfile(request('test','?format=raw'))).body).toBe(link);
    const json=[{remarks:'example',dns:{servers:['1.1.1.1']},outbounds:[{tag:'proxy',protocol:'vless'}]}];
    expect(JSON.parse(renderClientSubscription(JSON.stringify(json),clientProfile(request('v2rayN/7.0'))).body)).toEqual(json);
  });
});
