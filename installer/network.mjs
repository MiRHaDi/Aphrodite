import {Agent} from 'undici';
import {isIP} from 'node:net';
const routes=new Map();
const publicIPv4=value=>isIP(value)===4&&!/^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./.test(value)&&!/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(value);
export async function closeDeploymentConnections(){await Promise.allSettled([...routes.values()].map(r=>r.agent.close()));routes.clear();}
export async function deploymentFetch(input,init={}){
 const url=new URL(input);if(url.protocol!=='https:')return fetch(input,init);
 const cached=routes.get(url.hostname);
 if(cached)return fetch(input,{...init,dispatcher:cached.agent,redirect:'error'});
 try{return await fetch(input,{...init,redirect:'error',signal:AbortSignal.any([init.signal||new AbortController().signal,AbortSignal.timeout(8000)])});}catch{}
 // Resolve only the public hostname; paths, tokens and headers never go to the resolver.
 let addresses=[];
 try{const response=await fetch('https://8.8.8.8/resolve?name='+encodeURIComponent(url.hostname)+'&type=A',{signal:AbortSignal.timeout(6000)});const answer=await response.json();if(response.ok&&answer.Status===0)addresses=(answer.Answer||[]).filter(a=>a.type===1&&publicIPv4(a.data)).slice(0,2).map(a=>a.data);}catch{}
 for(const address of addresses){
  const lookup=(host,options,done)=>host===url.hostname?done(null,options.all?[{address,family:4}]:address,4):done(Error('Unexpected hostname'));
  const agent=new Agent({connect:{lookup}});
  try{const response=await fetch(input,{...init,dispatcher:agent,redirect:'error',signal:AbortSignal.any([init.signal||new AbortController().signal,AbortSignal.timeout(8000)])});if(routes.size>=16)await closeDeploymentConnections();routes.set(url.hostname,{agent,lookup});return response;}catch{}
  await agent.close();
 }
 throw Error('HTTPS deployment unreachable; verify DNS, network access and custom-domain activation');
}
export function deploymentSocketOptions(input){const route=routes.get(new URL(input).hostname);return route?{lookup:route.lookup}:{};}
