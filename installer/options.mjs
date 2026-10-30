export const stringOptions=['provider','name','account','zone','owner','project','environment','region','plan','repo','branch','host','user','ssh-port','key','fingerprint','domain','port','origin','admin-path','token-env','topology','connections','connection-providers','database-id','state','connection-account','connection-token-env','build-profile','domain-conflict'];
export const booleanOptions=['help','resume','new','add-account','no-save','repair','preview','project-token','result-page','json','non-interactive','include-credentials'];
export const optionSchema=Object.fromEntries([...stringOptions.map(key=>[key,{type:'string'}]),...booleanOptions.map(key=>[key,{type:'boolean'}])]);
export function validateOptions(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Installer options must be an object');
 for(const [key,value] of Object.entries(input))if(!Object.hasOwn(optionSchema,key)||typeof value!==optionSchema[key].type)throw Error('Unknown installer option or invalid option type');
 if(input['domain-conflict']&&!['reuse','new','fail'].includes(input['domain-conflict']))throw Error('domain-conflict must be reuse, new or fail');
 return {...input};
}
export function validateRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['options','environment'].includes(key)))throw Error('Expected options and optional environment');
 const options=validateOptions(input.options);
 const environment=input.environment??{};
 const allowed=new Set(['CLOUDFLARE_API_TOKEN','CLOUDFLARE_CONNECTION_TOKEN','RAILWAY_API_TOKEN','RAILWAY_TOKEN','RENDER_API_KEY','SSH_PASSWORD','ADMIN_TOKEN','ADMIN_PATH','APHRODITE_VARIABLES']);
 for(const key of ['token-env','connection-token-env'])if(options[key]&&/^[A-Z][A-Z0-9_]*TOKEN[A-Z0-9_]*$/.test(options[key]))allowed.add(options[key]);
 if(!environment||typeof environment!=='object'||Array.isArray(environment)||Object.entries(environment).some(([key,value])=>!allowed.has(key)||typeof value!=='string'||value.includes('\0')))throw Error('Invalid installer environment; only credential and application variable names are allowed');
 return {options,environment};
}
