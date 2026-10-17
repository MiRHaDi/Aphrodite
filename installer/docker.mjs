import {report} from './progress.mjs';
import {cp} from 'node:fs/promises';
import {join} from 'node:path';
import {run,root,verify} from './common.mjs';
export async function deployDocker(options,env,artifact){
  const command=process.platform==='win32'?'docker.exe':'docker';
  report('Check Docker daemon','Check Docker daemon');
  await run(command,['info']);
  const matches=await run(command,['ps','-a','--filter','name=^/'+options.name+'$','--format','{{.ID}}']);if(matches.trim())throw Error('Container already exists; no existing installation was replaced.');
  await cp(join(root,'deploy/Dockerfile.prebuilt'),join(artifact.directory,'Dockerfile'));
  const image=options.name+':'+artifact.manifest.buildId;
  report('Build container image','Build container image');
  await run(command,['build','--tag',image,artifact.directory]);
  const port=Number(options.port||8080);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
  report('Start container and persistent volume','Start container and persistent volume');
  await run(command,['run','--detach','--name',options.name,'--restart','unless-stopped','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--publish','127.0.0.1:'+port+':8080','--volume',options.name+'-data:/data',...Object.keys(env).flatMap(key=>['--env',key]),image],{env:{...process.env,...env}});
  const url='http://127.0.0.1:'+port;await verify(url,env);return {url,image,volume:options.name+'-data',localOnly:true};
}
