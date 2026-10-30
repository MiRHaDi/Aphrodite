import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
export function configurationHash(env){return createHash('sha256').update(JSON.stringify(Object.entries(env).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');}
export async function migrationHash(directory){
 const hash=createHash('sha256');
 for(const name of (await readdir(join(directory,'migrations'))).filter(name=>name.endsWith('.sql')).sort())hash.update(name).update(await readFile(join(directory,'migrations',name)));
 return hash.digest('hex');
}
export function restoreEnvironment(env,saved,options){
 const desired={...env};Object.assign(env,saved);
 for(const key of ['DEPLOYMENT_ROLE','EDGE_CONTROL_URL','EDGE_CONTROL_TOKEN','PUBLIC_EDGE_HOST','EDGE_HOST_ALIASES','WILDCARD_BASE_DOMAIN','WILDCARD_UPSTREAM_URL'])if(desired[key]!==undefined)env[key]=desired[key];
 Object.assign(env,options.variables||{});
 if(options.adminPasswordHash&&desired.DEPLOYMENT_ROLE!=='connection')env.ADMIN_PASSWORD_HASH=options.adminPasswordHash;
 if(desired.DEPLOYMENT_ROLE==='connection')for(const key of ['ADMIN_TOKEN','ADMIN_PATH','ADMIN_PASSWORD_HASH'])delete env[key];
 for(const key of ['SUBSCRIPTION_ID_MODE','SUBSCRIPTION_DOMAIN','SUBSCRIPTION_RESERVED_HOSTS_JSON','WILDCARD_GATEWAY_TOKEN'])if(desired[key]!==undefined)env[key]=desired[key];
}
