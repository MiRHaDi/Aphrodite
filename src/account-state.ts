import { json } from './responses';
import { settingsFor, type NativeAccount } from './native-types';

interface Lease { ip: string; expires: number; remaining: number; epoch: number }
interface Ledger { used: number; lifetime: number; requests: number; volumeReset: number; requestReset: number; epoch: number; revision: number; leases: Record<string, Lease> }
const CHUNK = 256 * 1024;
export class AccountState {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    let input: { account: NativeAccount; lease?: string; ip?: string; consumed?: number; action?: string };
    try { input = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!input.account || !input.account.username) return json({ error: 'Account required' }, 400);
    const account = input.account, settings = settingsFor(account), now = Date.now();
    return this.state.storage.transaction(async store => {
      const ledger = await store.get<Ledger>('ledger') || { used: 0, lifetime: 0, requests: 0, volumeReset: now, requestReset: now, epoch: 0, revision: account.revision, leases: {} };
      if (account.revision < ledger.revision) return json({ error: 'Stale account policy' }, 409);
      ledger.revision = account.revision;
      for (const [id, lease] of Object.entries(ledger.leases)) if (lease.expires <= now) delete ledger.leases[id];
      if (settings.resetVolumeDays && now >= ledger.volumeReset + settings.resetVolumeDays * 86400000) { ledger.used = 0; ledger.volumeReset = now; ledger.epoch++; }
      if (settings.resetRequestDays && now >= ledger.requestReset + settings.resetRequestDays * 86400000) { ledger.requests = 0; ledger.requestReset = now; }
      const pathname = new URL(request.url).pathname;
      if (pathname === '/restore') {
        const usage = (input as unknown as {usage:{usedBytes:number;lifetimeBytes:number;requests:number}}).usage;
        if (!usage || [usage.usedBytes,usage.lifetimeBytes,usage.requests].some(value=>!Number.isSafeInteger(value)||value<0) || Object.keys(ledger.leases).length) return json({error:'Invalid usage or active sessions'},400);
        ledger.used=usage.usedBytes;ledger.lifetime=usage.lifetimeBytes;ledger.requests=usage.requests;ledger.epoch++;
        await store.put('ledger',ledger);return json({ok:true});
      }
      const denied = !account.enabled || (account.expires_at !== null && account.expires_at * 1000 <= now);
      const consumed = input.consumed || 0;
      if (!Number.isSafeInteger(consumed) || consumed < 0) return json({ error: 'Invalid byte count' }, 400);
      if (pathname === '/status' || pathname === '/configure') {
        await store.put('ledger', ledger);
        return json({ usedBytes: ledger.used, lifetimeBytes: ledger.lifetime, requests: ledger.requests, connections: Object.keys(ledger.leases).length, ips: new Set(Object.values(ledger.leases).map(lease => lease.ip)).size, volumeResetAt: ledger.volumeReset, requestResetAt: ledger.requestReset, accounting: 'reserved-byte-ceiling' });
      }
      if (pathname === '/reset') {
        if (input.action === 'volume') { ledger.used = 0; ledger.epoch++; ledger.volumeReset = now; }
        else if (input.action === 'requests') { ledger.requests = 0; ledger.requestReset = now; }
        else return json({ error: 'Invalid reset action' }, 400);
        await store.put('ledger', ledger); return json({ ok: true });
      }
      if (!input.lease || input.lease.length > 64) return json({ error: 'Lease required' }, 400);
      let lease = ledger.leases[input.lease];
      if (pathname === '/open') {
        if (denied) return json({ error: 'Account disabled or expired' }, 403);
        if (settings.requestLimit && ledger.requests >= settings.requestLimit) return json({ error: 'Request quota exceeded' }, 429);
        if (settings.maxConnections && Object.keys(ledger.leases).length >= settings.maxConnections) return json({ error: 'Connection limit exceeded' }, 429);
        const ips = new Set(Object.values(ledger.leases).map(item => item.ip));
        if (settings.maxIps && !ips.has(input.ip || '') && ips.size >= settings.maxIps) return json({ error: 'IP limit exceeded' }, 429);
        if (lease) return json({ error: 'Duplicate lease' }, 409);
        lease = { ip: input.ip || '', expires: now + 90000, remaining: 0, epoch: ledger.epoch };
        ledger.leases[input.lease] = lease; ledger.requests++;
      } else if (!lease) return json({ error: 'Lease expired' }, 403);
      if (!lease || consumed > lease.remaining) return json({ error: 'Byte reservation exceeded' }, 400);
      lease.remaining -= consumed;
      if (pathname === '/close') {
        if (lease.epoch === ledger.epoch) ledger.used = Math.max(0, ledger.used - lease.remaining);
        ledger.lifetime = Math.max(0, ledger.lifetime - lease.remaining);
        delete ledger.leases[input.lease];
        await store.put('ledger', ledger); return json({ ok: true });
      }
      if (denied) return json({ error: 'Account disabled or expired' }, 403);
      if (lease.epoch !== ledger.epoch) { lease.remaining = 0; lease.epoch = ledger.epoch; }
      const available = settings.dataLimitBytes ? settings.dataLimitBytes - ledger.used : CHUNK;
      const granted = pathname === '/heartbeat' ? 0 : Math.max(0, Math.min(CHUNK, available));
      if (!granted && !lease.remaining && pathname !== '/heartbeat') return json({ error: 'Traffic quota exceeded' }, 403);
      lease.remaining += granted; lease.expires = now + 90000;
      ledger.used += granted; ledger.lifetime += granted;
      await store.put('ledger', ledger);
      return json({ ok: true, granted, remaining: lease.remaining });
    });
  }
}
