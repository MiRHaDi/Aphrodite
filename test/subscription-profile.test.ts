import { describe, expect, it } from 'vitest';
import { compatibilitySubscription } from '../src/subscription-profile';

const link = 'vless://abc@vpn.example:443?security=tls&type=ws&host=vpn.example&sni=vpn.example&path=%2Fedge%2Fsmart#Smart';
describe('subscription compatibility', () => {
  it('creates valid IPv6 variants with the original TLS identity and path', () => {
    const lines = compatibilitySubscription(link, 'vpn.example', '2606:4700::1111,2606:4700::1111,bad.example').split('\n');
    expect(lines).toHaveLength(2);
    const variant = new URL(lines[1]!);
    expect(variant.hostname).toBe('[2606:4700::1111]');
    expect(variant.searchParams.get('sni')).toBe('vpn.example');
    expect(variant.searchParams.get('host')).toBe('vpn.example');
    expect(variant.searchParams.get('path')).toBe('/edge/smart');
    expect(variant.searchParams.get('allowInsecure')).toBe('0');
    expect(variant.searchParams.get('alpn')).toBe('http/1.1');
  });
  it('does not reroute independent backup origins or other protocols', () => {
    const backup = link.replaceAll('vpn.example', 'backup.example');
    const vmess = 'vmess://opaque';
    const lines = compatibilitySubscription(backup+'\n'+vmess, 'vpn.example', '1.1.1.1').split('\n');
    expect(lines).toHaveLength(2);
    expect(new URL(lines[0]!).hostname).toBe('backup.example');
    expect(lines[1]).toBe(vmess);
  });
  it('preserves Unicode labels in base64 subscription output', () => {
    const input = btoa(unescape(encodeURIComponent(link+' · ایران')));
    const output = compatibilitySubscription(input, 'vpn.example');
    expect(decodeURIComponent(escape(atob(output)))).toContain('%D8%A7%DB%8C%D8%B1%D8%A7%D9%86');
  });
  it('leaves structured client configurations untouched', () => {
    const yaml = 'proxies:\n  - name: Smart\n    type: vless';
    expect(compatibilitySubscription(yaml, 'vpn.example')).toBe(yaml);
    expect(compatibilitySubscription('{"outbounds":[]}', 'vpn.example')).toBe('{"outbounds":[]}');
  });
});
