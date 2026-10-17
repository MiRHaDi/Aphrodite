import {connect} from 'cloudflare:sockets';
import worker from './index';
import {privateApplication} from './private-entry';
import {nativeTransport} from './native-transport';
import type {Env} from './types';
export default privateApplication({async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  if(/^\/edge\/native(?:\/(smart|us|nl|sg|ir|de|turkey))?$/.test(new URL(request.url).pathname))return nativeTransport(request,env,ctx,env.NATIVE_RELAY_UUID&&new URL(request.url).pathname!=='/edge/native'?undefined:async(host,port,tls)=>connect({hostname:host,port},{secureTransport:tls?'on':'off',allowHalfOpen:false}));
  return worker.fetch(request,env,ctx);
}});
