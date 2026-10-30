import './build-runtime.mjs';
import {report} from './progress.mjs';
import {build,transform as minify} from 'esbuild';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile,cp,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {sourceFingerprint,cachedArtifact} from './build-cache.mjs';
import {migrationHash} from './reconcile.mjs';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function compileSource(source){
  const result=await minify(source,{minify:true,format:'esm',target:'es2022',legalComments:'eof'});
  return {code:result.code,id:randomBytes(12).toString('hex')};
}
export async function buildArtifact(platform,{out,transform=true,role='standalone',profile='current'}={}){
  if(!['current','working-baseline'].includes(profile))throw Error('Invalid build profile');
  if(profile==='working-baseline'){
    if(!['workers','pages'].includes(platform)||role!=='standalone')throw Error('Working baseline requires a standalone Workers or Pages bundle');
    report('Reproduce verified working source and overlay current panel UI');
    const {buildWorkingBaseline}=await import('./working-baseline.mjs');
    const artifact=await buildWorkingBaseline({out});report('Artifact ready | verified reference | offline UI-only candidate','done');return artifact;
  }
  if(!['standalone','management','connection','gateway','database'].includes(role))throw Error('Invalid deployment role');
  if(platform==='node'&&!['standalone','management','database'].includes(role))throw Error('This deployment role requires Workers or Pages');
  const node=platform==='node';
  const fingerprint=await sourceFingerprint(root,{platform,role,transform,node:process.versions.node});
  const cacheDirectory=join(root,'.artifacts','build-cache',fingerprint),filename=node?'server.mjs':'worker.mjs';
  if(!out){const cached=await cachedArtifact(cacheDirectory,filename,fingerprint);if(cached){report('Artifact ready | unchanged source; reuse cached '+role+' bundle','done');return cached;}}
  const plugins=transform?[{name:'private-ui-build',setup(api){api.onLoad({filter:/[\\/]src[\\/]panel\.ts$/},async()=>{
    const panel=await build({entryPoints:[join(root,'src/panel.ts')],bundle:true,write:false,format:'esm'});
    const module=await import('data:text/javascript;base64,'+Buffer.from(panel.outputFiles[0].contents).toString('base64'));
    let html=module.PANEL_HTML;for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){const script=await minify(match[1],{minify:true,target:'es2022'});html=html.replace(match[0],'<script>'+script.code+'</script>');}
    return {contents:'export const PANEL_HTML='+JSON.stringify(html)+';',loader:'js'};
  });}}]:[];
  const entry=node?'runtime/server.mjs':role==='standalone'?'src/direct-worker.ts':role==='gateway'?'src/subscription-gateway.ts':'src/'+role+'-worker.ts';
  report('Bundle '+role+' source for '+platform);
  const built=await build({entryPoints:[join(root,entry)],bundle:true,write:false,format:'esm',platform:node?'node':'browser',target:node?'node24':'es2022',external:node?['node:*']:['cloudflare:*'],banner:node?{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}:{},plugins});
  report('Source bundle complete; optimize JavaScript');
  const original=Buffer.from(built.outputFiles[0].contents).toString();
  const variant=transform?await compileSource(original):{code:original,id:randomBytes(12).toString('hex')};
  const directory=resolve(out||cacheDirectory);await mkdir(directory,{recursive:true});
  report('Write artifact, database migrations and license files');
  await writeFile(join(directory,filename),variant.code);
  await cp(join(root,'migrations'),join(directory,'migrations'),{recursive:true});
  const manifest={buildId:variant.id,sourceFingerprint:fingerprint,platform,role,transformed:transform,sha256:createHash('sha256').update(variant.code).digest('hex'),bytes:Buffer.byteLength(variant.code),gzipBytes:gzipSync(variant.code).length,version:JSON.parse(await readFile(join(root,'package.json'),'utf8')).version};
  manifest.migrationsHash=await migrationHash(directory);
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  await cp(join(root,'LICENSE'),join(directory,'LICENSE'));await cp(join(root,'THIRD_PARTY_NOTICES.md'),join(directory,'THIRD_PARTY_NOTICES.md'));
  report('Artifact ready | role: '+role+' | bytes: '+manifest.bytes+' | gzip bytes: '+manifest.gzipBytes,'done');
  return {directory,filename,manifest,code:variant.code};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))buildArtifact(process.argv[2]||'node',{out:process.argv[3]}).then(result=>console.log(JSON.stringify(result.manifest))).catch(()=>{console.error('Build failed');process.exitCode=1;});
