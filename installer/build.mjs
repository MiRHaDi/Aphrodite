import {build,transform as minify} from 'esbuild';
import {randomBytes,createHash} from 'node:crypto';
import {mkdir,writeFile,cp,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function compileSource(source){
  const result=await minify(source,{minify:true,format:'esm',target:'es2022',legalComments:'eof'});
  return {code:result.code,id:randomBytes(12).toString('hex')};
}
export async function buildArtifact(platform,{out,transform=true,role='standalone'}={}){
  if(!['standalone','management','connection'].includes(role))throw Error('Invalid deployment role');
  if(platform==='node'&&role!=='standalone')throw Error('Split deployment roles currently require Workers or Pages');
  const node=platform==='node';
  const plugins=transform?[{name:'private-ui-build',setup(api){api.onLoad({filter:/[\\/]src[\\/]panel\.ts$/},async()=>{
    const panel=await build({entryPoints:[join(root,'src/panel.ts')],bundle:true,write:false,format:'esm'});
    const module=await import('data:text/javascript;base64,'+Buffer.from(panel.outputFiles[0].contents).toString('base64'));
    let html=module.PANEL_HTML;for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)){const script=await minify(match[1],{minify:true,target:'es2022'});html=html.replace(match[0],'<script>'+script.code+'</script>');}
    return {contents:'export const PANEL_HTML='+JSON.stringify(html)+';',loader:'js'};
  });}}]:[];
  const entry=node?'runtime/server.mjs':role==='standalone'?'src/direct-worker.ts':'src/'+role+'-worker.ts';
  const built=await build({entryPoints:[join(root,entry)],bundle:true,write:false,format:'esm',platform:node?'node':'browser',target:node?'node24':'es2022',external:node?['node:*']:['cloudflare:*'],banner:node?{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}:{},plugins});
  const original=Buffer.from(built.outputFiles[0].contents).toString();
  const variant=transform?await compileSource(original):{code:original,id:randomBytes(12).toString('hex')};
  const directory=resolve(out||join(root,'.artifacts',variant.id));await mkdir(directory,{recursive:true});
  const filename=node?'server.mjs':'worker.mjs';await writeFile(join(directory,filename),variant.code);
  await cp(join(root,'migrations'),join(directory,'migrations'),{recursive:true});
  const manifest={buildId:variant.id,platform,role,transformed:transform,sha256:createHash('sha256').update(variant.code).digest('hex'),bytes:Buffer.byteLength(variant.code),gzipBytes:gzipSync(variant.code).length,version:JSON.parse(await readFile(join(root,'package.json'),'utf8')).version};
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  await cp(join(root,'LICENSE'),join(directory,'LICENSE'));await cp(join(root,'THIRD_PARTY_NOTICES.md'),join(directory,'THIRD_PARTY_NOTICES.md'));
  return {directory,filename,manifest,code:variant.code};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))buildArtifact(process.argv[2]||'node',{out:process.argv[3]}).then(result=>console.log(JSON.stringify(result.manifest))).catch(()=>{console.error('Build failed');process.exitCode=1;});
