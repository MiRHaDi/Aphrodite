import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {migrationHash} from './reconcile.mjs';
export async function sourceFingerprint(root,settings){
 const hash=createHash('sha256').update(JSON.stringify(settings));
 async function directory(path){for(const item of (await readdir(join(root,path),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const relative=path+'/'+item.name;if(item.isDirectory())await directory(relative);else if(/\.(ts|mjs|sql)$/.test(item.name))hash.update(relative).update(await readFile(join(root,relative)));}}
 for(const folder of ['src','runtime','installer','migrations'])await directory(folder);
 for(const file of ['package.json','package-lock.json','LICENSE','THIRD_PARTY_NOTICES.md'])hash.update(file).update(await readFile(join(root,file)));
 return hash.digest('hex');
}
export async function cachedArtifact(directory,filename,fingerprint){
 try{const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8')),code=await readFile(join(directory,filename),'utf8');
  if(manifest.sourceFingerprint!==fingerprint||manifest.sha256!==createHash('sha256').update(code).digest('hex')||manifest.migrationsHash!==await migrationHash(directory))return null;
  return {directory,filename,manifest,code};
 }catch{return null;}
}
