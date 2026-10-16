import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { nodes } from '../src/control-plane';
import type { Env } from '../src/types';

afterEach(() => vi.unstubAllGlobals());

describe('network management', () => {
  it('discovers its own native runtime without an external backend', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await nodes({ NATIVE_ENABLED: 'true' } as Env, new Request('https://fresh.pages.dev/private/api/nodes'));
    const data = await response.json() as any;
    expect(response.status).toBe(200);
    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0]).toMatchObject({ id: 'native-local', hostname: 'fresh.pages.dev', status: 'ready', protocols: ['VLESS · WS'] });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns node status without credentials from the upstream response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{ id: 1, name: 'Primary', status: 'connected', api_key: 'private', address: 'private-address' }])));
    const response = await nodes({ CONTROL_PLANE_TOKEN: 'test', CONTROL_PLANE_ORIGIN: 'https://control.example' } as Env);
    expect(await response.json()).toEqual({ nodes: [{ id: 1, name: 'Primary', status: 'connected' }] });
  });

  it('removes the mistaken Pages download API', async () => {
    const response = await worker.fetch(new Request('https://example.com/api/pages-sources/p3/source', { headers: { authorization: 'Bearer test' } }), { ADMIN_TOKEN: 'test' } as Env, {} as ExecutionContext);
    expect(response.status).toBe(404);
  });

  it('requires authentication to read node status', async () => {
    const response = await worker.fetch(new Request('https://example.com/api/nodes'), { ADMIN_TOKEN: 'test' } as Env, {} as ExecutionContext);
    expect(response.status).toBe(401);
  });
});
