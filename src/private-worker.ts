import application from './index';
import { privateApplication } from './private-entry';
import {nativeTransport} from './native-transport';
export default privateApplication({fetch(request,env,ctx){
 if(/^\/edge\/native(?:\/(smart|us|nl|sg|ir|de|turkey))?$/.test(new URL(request.url).pathname))return nativeTransport(request,env,ctx);
 return application.fetch(request,env,ctx);
}});
