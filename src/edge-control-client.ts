import type {Env} from './types';
export async function edgeControl(env:Env,input:Record<string,unknown>):Promise<Response>{
 if(!env.EDGE_CONTROL_URL||!env.EDGE_CONTROL_TOKEN)throw Error('Central accounting is not configured');
 const url=new URL(env.EDGE_CONTROL_URL);if(url.protocol!=='https:')throw Error('Central accounting requires HTTPS');
 const init:RequestInit={method:'POST',redirect:'manual',headers:{authorization:'Bearer '+env.EDGE_CONTROL_TOKEN,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(10000)};
 return env.EDGE_CONTROL_SERVICE?env.EDGE_CONTROL_SERVICE.fetch(url.href,init):fetch(url,init);
}

