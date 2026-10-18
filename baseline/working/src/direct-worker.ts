import {connect} from 'cloudflare:sockets';
import worker from './index';
import {privateApplication} from './private-entry';
import {nativeTransport} from './native-transport';
import type {Env} from './types';
export default privateApplication({async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  if(new URL(request.url).pathname==='/edge/native')return nativeTransport(request,env,ctx,async(host,port,tls)=>connect({hostname:host,port},{secureTransport:tls?'on':'off',allowHalfOpen:false}));
  return worker.fetch(request,env,ctx);
}});
