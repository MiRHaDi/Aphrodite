import {afterEach,describe,expect,it,vi} from 'vitest';
import {parse} from 'yaml';
import {subscription} from '../src/subscription';
import type {Env} from '../src/types';
afterEach(()=>vi.unstubAllGlobals());
describe('same subscription URL, negotiated responses',()=>{
  it('keeps client-specific payloads and quota metadata isolated in the edge cache',async()=>{
    const entries=new Map<string,Response>();
    vi.stubGlobal('caches',{default:{match:async(key:Request)=>entries.get(key.url)?.clone(),put:async(key:Request,response:Response)=>{entries.set(key.url,response.clone());}}});
    const uuid='12345678-1234-4123-8123-123456789abc';
    const link='vmess://'+btoa(JSON.stringify({v:'2',ps:'Smart',add:'one.example',port:443,id:uuid,aid:0,net:'ws',path:'/stream',host:'one.example',tls:'tls'}));
    const backend=vi.fn(async(input:string)=>{
      let body:string;
      if(input.endsWith('/clash-meta'))body=JSON.stringify({proxies:[{name:'Smart',type:'vmess',server:'one.example',port:443,uuid,cipher:'auto',alterId:0,tls:true,servername:'one.example',network:'ws','ws-opts':{path:'/stream',headers:{Host:'one.example'}}}],rules:[]});
      else if(input.endsWith('/sing-box'))body=JSON.stringify({outbounds:[{type:'vmess',tag:'Smart',server:'one.example',server_port:443,uuid,security:'auto'}]});
      else if(input.endsWith('/v2ray-json'))body=JSON.stringify([{remarks:'Smart',outbounds:[{tag:'proxy',protocol:'vmess',settings:{vnext:[{address:'one.example',port:443,users:[{id:uuid}]}]}}]}]);
      else body=btoa(link);
      return new Response(body,{headers:{'subscription-userinfo':'upload=0; download=12; total=100; expire=0'}});
    });
    vi.stubGlobal('fetch',backend);
    const env={NATIVE_ENABLED:'false',CONTROL_PLANE_ORIGIN:'https://control.example',DB:{prepare:(sql:string)=>({bind:()=>({first:async()=>sql.includes('subscription_routes')?{username:'account',upstream_path:'/sub/protected-token',enabled:1}:null})})}} as unknown as Env;
    const pending:Promise<unknown>[]=[];const ctx={waitUntil:(value:Promise<unknown>)=>pending.push(value)} as unknown as ExecutionContext;
    const url='https://example.test/feed/account';
    const get=(agent:string)=>subscription(new Request(url,{headers:{'user-agent':agent}}),env,'account',ctx);
    const happ=await get('Happ/1.0');expect(happ.status).toBe(200);expect(atob(await happ.text())).toContain('vmess://');expect(happ.headers.has('routing')).toBe(true);
    const clash=await get('Clash.Meta');expect(parse(await clash.text()).proxies).toHaveLength(1);expect(clash.headers.has('routing')).toBe(false);
    const surge=await get('Surge/5.0');expect(await surge.text()).toContain('[Proxy Group]');expect(surge.headers.get('subscription-userinfo')).toContain('download=12');
    const hiddify=await get('Hiddify/2.0');const singBox=await hiddify.json() as {outbounds:Array<{type:string}>};expect(singBox.outbounds.some(o=>o.type==='urltest')).toBe(true);
    const xray=await get('v2rayN/7.0');expect(Array.isArray(await xray.json())).toBe(true);
    await Promise.all(pending);const count=backend.mock.calls.length;
    expect((await get('Clash.Meta')).headers.get('content-type')).toContain('yaml');expect(backend.mock.calls).toHaveLength(count);
    expect(new Set(backend.mock.calls.map(([url])=>url)).size).toBe(4);
  });
});
