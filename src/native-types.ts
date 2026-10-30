export interface NativeSettings {
  dataLimitBytes: number;
  requestLimit: number;
  maxConnections: number;
  maxIps: number;
  resetVolumeDays: number;
  resetRequestDays: number;
  rotationMinutes: number;
  addressCount: number;
  addresses: string[];
  ports: number[];
  fingerprint: string;
  blockAds: boolean;
  blockAdult: boolean;
  proxies: string[];
  rotateProxy: boolean;
  fragment: { enabled: boolean; length: string; interval: string };
}
export interface NativeAccount { username: string; uuid: string; subscription_key?: string; enabled: number; expires_at: number | null; settings_json: string; revision: number; created_at: number; updated_at: number }
export const nativeDefaults: NativeSettings = { dataLimitBytes: 100 * 1073741824, requestLimit: 0, maxConnections: 0, maxIps: 0, resetVolumeDays: 0, resetRequestDays: 0, rotationMinutes: 0, addressCount: 3, addresses: [], ports: [443], fingerprint: 'chrome', blockAds: false, blockAdult: false, proxies: [], rotateProxy: true, fragment: { enabled: false, length: '100-200', interval: '1-2' } };

export function parseNativeSettings(value: unknown): NativeSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  // Compatibility for the short-lived per-user appearance fields. Appearance is
  // now intentionally shared by every subscriber and stored separately.
  const {pageTitle:_pageTitle,pageMessage:_pageMessage,pageAccent:_pageAccent,...settingsInput}=input;
  if (Object.keys(settingsInput).some(key => !(key in nativeDefaults))) return null;
  const result = { ...nativeDefaults, ...settingsInput } as NativeSettings;
  for (const key of ['dataLimitBytes','requestLimit','maxConnections','maxIps','resetVolumeDays','resetRequestDays','rotationMinutes','addressCount'] as const) if (!Number.isSafeInteger(result[key]) || result[key] < 0) return null;
  if (result.maxConnections > 1000 || result.maxIps > 100 || result.resetVolumeDays > 3650 || result.resetRequestDays > 3650 || result.addressCount < 1 || result.addressCount > 16 || result.rotationMinutes > 525600) return null;
  if (!Array.isArray(result.addresses) || result.addresses.length > 64 || result.addresses.some(host => typeof host !== 'string' || !validHost(host))) return null;
  if (!Array.isArray(result.ports) || !result.ports.length || result.ports.length > 6 || result.ports.some(port => ![443,2053,2083,2087,2096,8443].includes(port))) return null;
  if (!['chrome','firefox','safari','ios','android','edge','randomized'].includes(result.fingerprint)) return null;
  if (typeof result.blockAds !== 'boolean' || typeof result.blockAdult !== 'boolean' || typeof result.rotateProxy !== 'boolean') return null;
  if (!Array.isArray(result.proxies) || result.proxies.length > 8 || result.proxies.some(proxy => !validProxy(proxy))) return null;
  if (!result.fragment || typeof result.fragment.enabled !== 'boolean' || !/^\d{1,4}-\d{1,4}$/.test(result.fragment.length) || !/^\d{1,3}-\d{1,3}$/.test(result.fragment.interval)) return null;
  return result;
}
export function validHost(host: string): boolean {
  if (host.length > 253 || /[\s/@?#\\]/.test(host)) return false;
  try { const url = new URL(`https://${host.includes(':') ? '['+host.replace(/^\[|\]$/g,'')+']' : host}/`); return Boolean(url.hostname); } catch { return false; }
}
export function validProxy(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 1024) return false;
  try { const url = new URL(value); return ['socks4:','socks5:','http:','https:'].includes(url.protocol) && Boolean(url.hostname) && !url.hash && (url.pathname === '/' || !url.pathname); } catch { return false; }
}
export function settingsFor(account: NativeAccount): NativeSettings { try { return parseNativeSettings(JSON.parse(account.settings_json)) || nativeDefaults; } catch { return nativeDefaults; } }
