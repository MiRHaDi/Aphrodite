import {createHash} from 'node:crypto';
import {readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
export async function ensureDependencies(root,install,{runtime=process.version+' '+process.platform+' '+process.arch}={}){
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 const fingerprint=createHash('sha256').update(await readFile(join(root,'package-lock.json'))).update(JSON.stringify({dependencies:pkg.dependencies,devDependencies:pkg.devDependencies,engines:pkg.engines,runtime})).digest('hex');
 const receipt=join(root,'node_modules','.aphrodite-dependencies.json');
 try{
  if(JSON.parse(await readFile(receipt,'utf8')).fingerprint===fingerprint){
   for(const name of Object.keys({...pkg.dependencies,...pkg.devDependencies}))await access(join(root,'node_modules',name,'package.json'));
   return {unchanged:true};
  }
 }catch{}
 await install();await writeFile(receipt,JSON.stringify({fingerprint}));return {unchanged:false};
}
