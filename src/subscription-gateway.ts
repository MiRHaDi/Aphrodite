interface GatewayEnv {WILDCARD_BASE_DOMAIN:string;WILDCARD_UPSTREAM_URL:string;EDGE_PROBE_PATH:string;EDGE_CONTROL_TOKEN:string}
const blank=()=>new Response(null,{status:404,headers:{'cache-control':'no-store'}});
export default {async fetch(request:Request,env:GatewayEnv):Promise<Response>{
 const url=new URL(request.url);
 if(request.method==='POST'&&url.pathname==='/'+env.EDGE_PROBE_PATH&&request.headers.get('authorization')==='Bearer '+env.EDGE_CONTROL_TOKEN)return Response.json({ok:true},{headers:{'cache-control':'no-store'}});
 if(!['GET','HEAD'].includes(request.method)||request.headers.has('upgrade')||!url.hostname.endsWith('.'+env.WILDCARD_BASE_DOMAIN))return blank();
 const label=url.hostname.slice(0,-env.WILDCARD_BASE_DOMAIN.length-1);
 if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)||!/^\/[a-f0-9]{64}(?:\/[A-Za-z0-9_.-]{3,96})?$/.test(url.pathname))return blank();
 let upstream:URL;try{upstream=new URL(env.WILDCARD_UPSTREAM_URL);if(upstream.protocol!=='https:'||upstream.username||upstream.password)return blank();}catch{return blank();}
 upstream.pathname=url.pathname;upstream.search=url.search;
 const headers=new Headers(request.headers);headers.delete('host');headers.delete('authorization');headers.set('x-aphrodite-original-host',url.hostname);headers.set('x-aphrodite-gateway-token',env.EDGE_CONTROL_TOKEN);
 try{
  const response=await fetch(new Request(upstream,{method:request.method,headers,redirect:'manual'}));
  if(response.status>=300&&response.status<400)return blank();
  const output=new Headers(response.headers);output.set('cache-control','no-store');output.set('referrer-policy','no-referrer');
  return new Response(response.body,{status:response.status,headers:output});
 }catch{return blank();}
}};
