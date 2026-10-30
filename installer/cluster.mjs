const clusterKeys=['DEPLOYMENT_ROLE','DATA_CONTROL_URL','DATA_CONTROL_PATH','DATA_CONTROL_TOKEN','DATA_CONTROL_TOKENS_JSON','EDGE_CONTROL_PATH','EDGE_CONTROL_TOKEN','EDGE_CONTROL_TOKENS_JSON'];
export async function restoreCluster(env,options,session,topology){
 if(!session?.state.services)return;
 const name=topology==='split'?options.name+'-control':options.name;
 const previous=Object.values(session.state.services).find(s=>s.name===name&&s.provider===options.provider&&(!options.account||s.account===options.account));
 if(!previous)return;
 const source=await session.secret('service-'+previous.owner);if(!source)return;
 const saved=JSON.parse(source);
 for(const key of clusterKeys)if(env[key]===undefined&&saved[key]!==undefined)env[key]=saved[key];
}
export function validateCluster(env,topology){
 const role=env.DEPLOYMENT_ROLE||'standalone';
 for(const key of ['DATA_CONTROL_TOKENS_JSON','EDGE_CONTROL_TOKENS_JSON'])if(env[key]){
  let values;try{values=JSON.parse(env[key])}catch{throw Error('Invalid '+key)}
  if(!Array.isArray(values)||values.length>64||values.some(v=>typeof v!=='string'||v.length<32||v.length>256))throw Error('Invalid '+key);
 }
 if(role==='database'){
  if(topology==='split'||env.DATA_CONTROL_URL)throw Error('Database authority must be a standalone local-data service');
  if(!/^[A-Za-z0-9_-]{16,128}$/.test(env.DATA_CONTROL_PATH||'')||!env.DATA_CONTROL_TOKEN||env.DATA_CONTROL_TOKEN.length<32)throw Error('Database authority requires a private path and dedicated data token');
 }
 if(env.DATA_CONTROL_URL){
  let url;try{url=new URL(env.DATA_CONTROL_URL)}catch{throw Error('Invalid DATA_CONTROL_URL')}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname==='/'||!env.DATA_CONTROL_TOKEN||env.DATA_CONTROL_TOKEN.length<32)throw Error('Remote data authority requires HTTPS, a private path and a dedicated data token');
  if(topology!=='split'&&role!=='management')throw Error('Remote data clients require management role');
  if(env.DATA_CONTROL_TOKEN===env.EDGE_CONTROL_TOKEN||env.DATA_CONTROL_TOKEN===env.ADMIN_TOKEN)throw Error('Data, connection and administrator credentials must be different');
 }
}
