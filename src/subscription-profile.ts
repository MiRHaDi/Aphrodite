/** Independent client-compatibility rendering. Standard subscriptions are untouched. */
export function compatibilitySubscription(body: string, edgeHost: string, addresses = ''): string {
  let decoded = body;
  let encoded = false;
  if (!/^\s*(?:vless|trojan|vmess|ss):\/\//i.test(body)) {
    try {
      const binary = atob(body.replace(/\s/g, ''));
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
      encoded = true;
    } catch { return body; }
  }
  if (!decoded.split(/\r?\n/).some(line => /^(?:vless|trojan|vmess|ss):\/\//i.test(line))) return body;

  const edgeAddresses = [...new Set(addresses.split(/[\s,]+/).filter(validAddress))].slice(0, 8);
  const output: string[] = [];
  for (const line of decoded.split(/\r?\n/)) {
    if (!/^(?:vless|trojan):\/\//i.test(line)) { output.push(line); continue; }
    try {
      const url = new URL(line);
      if (url.searchParams.get('security') !== 'tls' || url.searchParams.get('type') !== 'ws') { output.push(line); continue; }
      const fingerprint = url.searchParams.get('fp');
      if (!fingerprint || fingerprint === 'unsafe') url.searchParams.set('fp', 'chrome');
      url.searchParams.set('alpn', 'http/1.1');
      url.searchParams.set('allowInsecure', '0');
      url.searchParams.delete('insecure');
      output.push(url.href);

      // Only make address variants for this edge, never for independent backup origins.
      const sni = url.searchParams.get('sni') || url.hostname;
      const host = url.searchParams.get('host') || url.hostname;
      if (sni.toLowerCase() !== edgeHost.toLowerCase() || host.toLowerCase() !== edgeHost.toLowerCase()) continue;
      for (const address of edgeAddresses) {
        const variant = new URL(url.href);
        variant.hostname = address.includes(':') ? `[${address}]` : address;
        variant.searchParams.set('sni', sni);
        variant.searchParams.set('host', host);
        let name = '';
        try { name = decodeURIComponent(url.hash.slice(1)); } catch { name = url.hash.slice(1); }
        variant.hash = encodeURIComponent(`${name} · Edge ${address}`);
        output.push(variant.href);
      }
    } catch { output.push(line); }
  }
  const result = [...new Set(output)].join('\n');
  if (!encoded) return result;
  let binary = '';
  for (const byte of new TextEncoder().encode(result)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function validAddress(value: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return value.split('.').every(part => Number(part) <= 255);
  if (!/^[\da-f:]+$/i.test(value) || !value.includes(':')) return false;
  try { return new URL(`https://[${value}]/`).hostname.startsWith('['); } catch { return false; }
}
