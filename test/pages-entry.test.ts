import {it,expect,vi} from 'vitest';
const transport=vi.hoisted(()=>vi.fn(async(..._args:unknown[])=>new Response(null,{status:200})));
vi.mock('../src/native-transport',()=>({nativeTransport:transport}));
import {onRequest} from '../functions/[[path]]';
import type {Env} from '../src/types';
it('provides a direct socket factory to the standalone Pages transport without a relay credential',async()=>{
 const env={NATIVE_ENABLED:'true',ADMIN_PATH:'private-administration-path'} as Env;
 await onRequest({request:new Request('https://service.pages.dev/edge/native',{headers:{Upgrade:'websocket'}}),env,waitUntil(){},passThroughOnException(){}});
 expect(transport).toHaveBeenCalledOnce();
 expect(transport.mock.calls[0]?.[1]).toBe(env);
 expect(typeof (transport.mock.calls[0] as unknown[])?.[3]).toBe('function');
});
