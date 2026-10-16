import { afterEach, describe, expect, it, vi } from 'vitest';
import { dnsTtl, wireDns } from '../src/native-dns';

function answer(ttl: number) {
  return Uint8Array.from([0,1,129,128,0,1,0,1,0,0,0,0,1,97,0,0,1,0,1,192,12,0,1,0,1,
    (ttl>>>24)&255,(ttl>>>16)&255,(ttl>>>8)&255,ttl&255,0,4,1,2,3,4]);
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('DNS cache', () => {
  it('caps TTL and rejects truncated or failed answers', () => {
    expect(dnsTtl(answer(60))).toBe(60);
    expect(dnsTtl(answer(900))).toBe(300);
    expect(dnsTtl(answer(60).slice(0,-1))).toBe(0);
    const failed=answer(60);failed[3]=131;expect(dnsTtl(failed)).toBe(0);
  });
  it('reuses answers across transaction IDs, isolates resolvers and expires entries', async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const fetcher=vi.fn(async()=>new Response(answer(60)));vi.stubGlobal('fetch',fetcher);
    const query=answer(60).slice(0,19);query[2]=1;query[3]=0;query[7]=0;
    await wireDns(query,'https://dns.test/cache');query[0]=42;query[1]=99;
    const cached=await wireDns(query,'https://dns.test/cache');
    expect(Array.from(cached.slice(0,2))).toEqual([42,99]);expect(fetcher).toHaveBeenCalledTimes(1);
    await wireDns(query,'https://other-dns.test/cache');expect(fetcher).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(61000);await wireDns(query,'https://dns.test/cache');expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
