import type {Env} from './types';
import {databaseControl} from './cluster-database';
export default {fetch(request:Request,env:Env){
 if(env.DATA_CONTROL_PATH&&new URL(request.url).pathname==='/'+env.DATA_CONTROL_PATH)return databaseControl(request,env);
 return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
}};
