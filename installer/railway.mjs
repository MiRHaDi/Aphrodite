import {jsonRequest,required,run,root,verify} from './common.mjs';
import {railwayBinary} from './tools.mjs';
export async function deployRailway(options,env){
  const token=required(options.token,'Railway API token');
  const headers=options.projectToken?{'Project-Access-Token':token}:{Authorization:'Bearer '+token};
  async function gql(query,variables){const result=await jsonRequest('https://backboard.railway.com/graphql/v2',{method:'POST',headers,body:{query,variables}});return result.data;}
  let project=options.project;
  if(!project){if(options.projectToken)throw Error('Project tokens require --project and --environment');project=(await gql('mutation($input:ProjectCreateInput!){projectCreate(input:$input){id}}',{input:{name:options.name,isPublic:false}})).projectCreate.id;}
  const details=(await gql('query($id:String!){project(id:$id){environments{edges{node{id name}}} services{edges{node{id name}}}}}',{id:project})).project;
  if(details.services.edges.some(item=>item.node.name===options.name))throw Error('Service already exists; refusing replacement');
  const environment=options.environment||(details.environments.edges.length===1?details.environments.edges[0].node.id:details.environments.edges.find(item=>item.node.name==='production')?.node.id);required(environment,'environment id');
  const service=(await gql('mutation($input:ServiceCreateInput!){serviceCreate(input:$input){id}}',{input:{projectId:project,name:options.name}})).serviceCreate.id;
  await gql('mutation($input:VolumeCreateInput!){volumeCreate(input:$input){id}}',{input:{projectId:project,serviceId:service,environmentId:environment,mountPath:'/data'}});
  const domain=(await gql('mutation($input:ServiceDomainCreateInput!){serviceDomainCreate(input:$input){domain}}',{input:{serviceId:service,environmentId:environment,targetPort:8080}})).serviceDomainCreate.domain;
  env.PUBLIC_EDGE_HOST=domain;env.TRUST_PROXY='true';
  await gql('mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}',{input:{projectId:project,environmentId:environment,serviceId:service,variables:env,skipDeploys:true}});
  await run(await railwayBinary(),['up',root,'--project',project,'--environment',environment,'--service',service,'--detach'],{env:{...process.env,CI:'true',BROWSER:'none',...(options.projectToken?{RAILWAY_TOKEN:token}:{RAILWAY_API_TOKEN:token})}});
  const url='https://'+domain;await verify(url,env,{attempts:90,delay:5000});return {url,project,service,environment};
}
