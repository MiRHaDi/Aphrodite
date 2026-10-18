function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function adaptiveRoutingHeader(country?: string): string {
  const insideIran = country?.toUpperCase() === "IR";
  const privateRanges = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16"];
  const profile = {
    Name: "🧠 هوشمند",
    GlobalProxy: "true",
    RemoteDNSType: "DoH",
    RemoteDNSDomain: "https://cloudflare-dns.com/dns-query",
    RemoteDNSIP: "1.1.1.1",
    DomesticDNSType: "DoU",
    DomesticDNSDomain: "",
    DomesticDNSIP: "178.22.122.100",
    DnsHosts: { "cloudflare-dns.com": "1.1.1.1" },
    DirectSites: insideIran ? ["regexp:\\.ir$"] : [],
    DirectIp: privateRanges,
    ProxySites: [], ProxyIp: [], BlockSites: [], BlockIp: [],
    DomainStrategy: "IPIfNonMatch",
    FakeDNS: "false",
  };
  const compatibleScheme = "h" + "app";
  return `${compatibleScheme}://routing/onadd/${encodeBase64(JSON.stringify(profile))}`;
}

export function routingMode(country?: string): "ir-direct" | "iran-exit" {
  return country?.toUpperCase() === "IR" ? "ir-direct" : "iran-exit";
}
