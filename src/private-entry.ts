import type { Env } from './types';
import {ensureSubscriptionKey,subscriptionOwner} from './subscription-keys';

export function blank():Response {
  return new Response(null,{status:404,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
}
export function managementPrefix(env:Env):string|null {
  const path=(env.ADMIN_PATH||'').replace(/^\/+|\/+$/g,'');
  return /^[A-Za-z0-9_-]{16,128}$/.test(path)?'/'+path:null;
}
export interface Application { fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>|Response }
export function privateApplication(application:Application):{fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>} {
  return {async fetch(request,env,ctx){
    const url=new URL(request.url),prefix=managementPrefix(env);
    if(env.PRIVATE_MACHINE_TOKEN_HASH&&env.PRIVATE_MACHINE_TOKEN_HEADER){
      const token=request.headers.get(env.PRIVATE_MACHINE_TOKEN_HEADER);
      if(token){
        const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
        const hex=Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('');
        if(hex===env.PRIVATE_MACHINE_TOKEN_HASH.toLowerCase()){
          try{return await application.fetch(request,env,ctx);}catch{return blank();}
        }
      }
    }
    const upgrade=request.headers.get('upgrade')?.toLowerCase()==='websocket';
    if(upgrade){
      try {const response=await application.fetch(request,env,ctx);return response.status===101?response:blank();}catch{return blank();}
    }
    if(prefix&&(url.pathname===prefix||url.pathname.startsWith(prefix+'/'))){
      if(url.pathname===prefix||url.pathname===prefix+'/')url.pathname=env.ADMIN_TARGET_PATH||'/panel';
      else url.pathname=url.pathname.slice(prefix.length);
      try {
        const response=await application.fetch(new Request(url,request),env,ctx);
        if(response.headers.get('content-type')?.includes('text/html')){
          const injected='<script>const protectedFetch=window.fetch.bind(window);window.fetch=(input,options)=>protectedFetch(typeof input==="string"&&input.startsWith("/")&&!input.startsWith("//")?'+JSON.stringify(prefix)+'+input:input,options);</script>';
          const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');headers.set('x-robots-tag','noindex, nofollow');
          const html=(await response.text()).replaceAll("PANEL_ORIGIN+'/api/admin/token'","'/panel/api/token'").replaceAll("PANEL_ORIGIN+'/api/'","'/panel/api/'");
          return new Response(html.includes('<head>')?html.replace('<head>','<head>'+injected):injected+html,{status:response.status,headers});
        }
        if(request.method==='POST'&&['/api/users','/panel/api/user'].includes(url.pathname)&&response.ok&&response.headers.get('content-type')?.includes('application/json')){
          const data=await response.json() as Record<string,unknown>;
          if(typeof data.username==='string'&&/^[A-Za-z0-9_.-]{3,96}$/.test(data.username)){
            if(typeof data.subscription_url==='string'){
              const path=new URL(data.subscription_url,'https://placeholder.invalid').pathname;
              if(path.startsWith('/sub/')){
                try {await env.DB.prepare('INSERT INTO subscription_routes(username,backend_username,upstream_path,enabled,updated_at) VALUES(?,?,?,1,unixepoch()) ON CONFLICT(username) DO UPDATE SET upstream_path=excluded.upstream_path,enabled=1,updated_at=unixepoch()').bind(data.username,data.username,path).run();}
                catch {await env.DB.prepare('INSERT INTO subscription_routes(username,upstream_path,enabled,updated_at) VALUES(?,?,1,unixepoch()) ON CONFLICT(username) DO UPDATE SET upstream_path=excluded.upstream_path,enabled=1,updated_at=unixepoch()').bind(data.username,path).run();}
              }
            }
            const supplied=typeof data.subscriptionPath==='string'?new URL(data.subscriptionPath,'https://placeholder.invalid').searchParams.get('token')||undefined:undefined;
            data.subscriptionPath='/'+await ensureSubscriptionKey(env,data.username,supplied);
            if('subscription_url' in data)data.subscription_url='https://'+(env.PUBLIC_EDGE_HOST||new URL(request.url).hostname)+data.subscriptionPath;
          }
          return Response.json(data,{status:response.status,headers:{'cache-control':'no-store'}});
        }
        return response;
      }catch{return blank();}
    }
    if((request.method==='GET'||request.method==='HEAD')&&(/^\/[a-f0-9]{64}$/.test(url.pathname)||/^\/feed\/[A-Za-z0-9_.-]{3,96}\/?$/.test(url.pathname))){
      try {
        const username=await subscriptionOwner(request,env);if(!username)return blank();
        if(/^\/[a-f0-9]{64}$/.test(url.pathname))url.searchParams.set('token',url.pathname.slice(1));
        else if(!url.searchParams.has('token')){
          // subscriptionOwner has already checked legacy_allowed. Pass its existing
          // credential internally so migrated native accounts accept frozen links.
          const row=await env.DB.prepare('SELECT token FROM subscription_keys WHERE username=? COLLATE NOCASE').bind(username).first<{token:string}>();
          if(!row?.token)return blank();url.searchParams.set('token',row.token);
        }
        url.pathname='/feed/'+encodeURIComponent(username);
        const response=await application.fetch(new Request(url,request),env,ctx);return response.ok?response:blank();
      }catch{return blank();}
    }
    return blank();
  }};
}
