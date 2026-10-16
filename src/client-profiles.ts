/** Subscription negotiation only; User-Agent is never an authentication signal. */
export type ClientFamily = 'happ'|'hiddify'|'v2rayn'|'v2rayng'|'mihomo'|'stash'|'sing-box'|'surge'|'shadowrocket'|'v2raytun'|'generic';
export type ClientFormat = 'base64'|'raw'|'clash'|'sing-box'|'xray'|'surge';
export interface ClientProfile {
  family:ClientFamily;
  format:ClientFormat;
  upstream:'v2ray'|'clash-meta'|'sing-box'|'v2ray-json';
  cacheKey:string;
  happRouting:boolean;
}
function atLeast(agent:string,minimum:number[]):boolean {
  const match=agent.match(/\/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);if(!match)return false;
  const version=match.slice(1).map(value=>Number(value||0));
  for(let i=0;i<minimum.length;i++){if(version[i]!==minimum[i])return version[i]!>minimum[i]!;}return true;
}
export function clientProfile(request:Request):ClientProfile {
  const agent=(request.headers.get('user-agent')||'').trim().slice(0,512);
  let family:ClientFamily='generic',format:ClientFormat='base64';
  if(/^happ(?:[\/\s-]|$)/i.test(agent))family='happ';
  else if(/^hiddify(?:next)?x?(?:[\/\s-]|$)/i.test(agent)){family='hiddify';format='sing-box';}
  else if(/^v2rayng(?:[\/\s-]|$)/i.test(agent)){family='v2rayng';if(atLeast(agent,[1,8,29]))format='xray';}
  else if(/^v2rayn(?:[\/\s-]|$)/i.test(agent)){family='v2rayn';if(atLeast(agent,[6,40]))format='xray';}
  else if(/^(?:stash)(?:[\/\s-]|$)/i.test(agent)){family='stash';format='clash';}
  else if(/^(?:clash|mihomo|flclash|clash-verge|clashparty|clash-party|clashforandroid|clashmeta|clash\.meta)/i.test(agent)){family='mihomo';format='clash';}
  else if(/^(?:sing-box|singbox|sfa|sfi|sfm|sft|karing)(?:[\/\s-]|$)/i.test(agent)){family='sing-box';format='sing-box';}
  else if(/^surge(?:[\/\s-]|$)/i.test(agent)){family='surge';format='surge';}
  else if(/^shadowrocket(?:[\/\s-]|$)/i.test(agent))family='shadowrocket';
  else if(/^v2raytun(?:[\/\s-]|$)/i.test(agent))family='v2raytun';
  const explicit=new URL(request.url).searchParams.get('format');
  const aliases:Record<string,ClientFormat>={'base64':'base64','v2ray':'base64','raw':'raw','clash':'clash','clash-meta':'clash','mihomo':'clash','sing-box':'sing-box','singbox':'sing-box','xray':'xray','v2ray-json':'xray','surge':'surge'};
  if(explicit&&aliases[explicit])format=aliases[explicit]!;
  const upstream=format==='clash'||format==='surge'?'clash-meta':format==='sing-box'?'sing-box':format==='xray'?'v2ray-json':'v2ray';
  return {family,format,upstream,cacheKey:family+'-'+format+'-1',happRouting:family==='happ'&&(format==='base64'||format==='raw'||format==='xray')};
}
export function profileHeaders(profile:ClientProfile,existing:Headers,interval='6'):Headers {
  const headers=new Headers(existing);
  const vary=new Set((headers.get('vary')||'').split(',').map(value=>value.trim()).filter(Boolean));vary.add('User-Agent');vary.add('Accept');headers.set('vary',[...vary].join(', '));
  if(!profile.happRouting)headers.delete('routing');
  headers.set('profile-update-interval',/^\d+$/.test(interval)?String(Math.min(168,Math.max(1,Number(interval)))):'6');
  headers.set('content-disposition','attachment; filename="subscription.'+(profile.format==='clash'?'yaml':profile.format==='sing-box'||profile.format==='xray'?'json':profile.format==='surge'?'conf':'txt')+'"');
  return headers;
}
