import {jsonRequest,required,verify} from './common.mjs';
export async function deployRender(options,env){
  const token=required(options.token,'Render API token');let owner=options.owner;
  if(!owner){const owners=await jsonRequest('https://api.render.com/v1/owners?limit=100',{token});if(owners.length!==1)throw Error('Specify --owner when multiple workspaces are accessible');owner=owners[0].owner.id;}
  if(!/^[a-zA-Z0-9-]+$/.test(owner))throw Error('Invalid workspace id');
  const existing=await jsonRequest('https://api.render.com/v1/services?name='+encodeURIComponent(options.name)+'&limit=100',{token});if(existing.some(item=>item.service?.name===options.name))throw Error('Service already exists; refusing replacement');
  const created=await jsonRequest('https://api.render.com/v1/services',{token,method:'POST',body:{type:'web_service',name:options.name,ownerId:owner,repo:options.repo||'https://github.com/MiRHaDi/Aphrodite',branch:options.branch||'codex/portable-installer',autoDeployTrigger:'off',envVars:Object.entries(env).map(([key,value])=>({key,value:String(value)})),serviceDetails:{runtime:'docker',plan:options.plan||'starter',region:options.region||'frankfurt',numInstances:1,disk:{name:options.name+'-data',mountPath:'/data',sizeGB:1},envSpecificDetails:{dockerfilePath:'./Dockerfile',dockerContext:'.'}}}});
  const service=created.service;
  if(!service?.id)throw Error('Render did not return a service id');
  let url=service.serviceDetails?.url;
  for(let i=0;!url&&i<12;i++){await new Promise(r=>setTimeout(r,5000));const current=await jsonRequest('https://api.render.com/v1/services/'+service.id,{token});url=current.serviceDetails?.url;}
  if(!url)throw Error('Service created without a public URL: '+service.id);
  if(!created.deployId)await jsonRequest('https://api.render.com/v1/services/'+service.id+'/deploys',{token,method:'POST',body:{clearCache:'do_not_clear'}});
  await verify(url,env,{attempts:90,delay:5000});return {url,service:service.id};
}
