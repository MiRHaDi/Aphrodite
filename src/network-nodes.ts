import {nativeEnabled} from './native-accounts';
import {subscriptionEndpoints} from './subscription-addresses';
import {tunnelMap} from './config';
import type {Env} from './types';
export function nativeNodes(env:Env,request?:Request){
 if(!nativeEnabled(env))return [];
 const host=env.PUBLIC_EDGE_HOST||(request?new URL(request.url).hostname:'');
 const endpoints=host?subscriptionEndpoints({...env,PUBLIC_EDGE_HOST:host}):[];
 const nodes=[{id:'native-local',name:'Aphrodite',nameKey:'localNode',status:'ready',kind:'native',country:'auto',protocols:['VLESS · WS'],addresses:endpoints.map(e=>e.address),hostname:host}];
 if(env.NATIVE_RELAY_UUID&&/^[a-f\d-]{36}$/i.test(env.NATIVE_RELAY_UUID)){const routes=tunnelMap(env);for(const country of ['smart','us','nl','sg','ir','de','turkey'])if(routes['/edge/'+country]?.length)nodes.push({id:'native-'+country,name:country,nameKey:country==='turkey'?'tr':country,status:'configured',kind:'relay',country:country==='turkey'?'tr':country,protocols:['VLESS · WS'],addresses:[],hostname:host});}
 return nodes;
}
