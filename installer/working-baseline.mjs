import './build-runtime.mjs';
import {build,transform} from 'esbuild';
import {readFileSync} from 'node:fs';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const baselineCommit='f0be266977ac173c3212c39fef34f34dbda2009f';
export const referenceSha256='2c5cd1f776e3e2e92292170df8b53092961aa6368da1f6cd46b4bf1e3495e06e';
const uiFiles=new Set(['src/panel.ts','src/panel-i18n.ts','src/panel-font.ts']);
const digest=value=>createHash('sha256').update(value).digest('hex');
const history=new Map();
const snapshotRoot=join(root,'baseline','working');
const snapshot=JSON.parse(readFileSync(join(snapshotRoot,'snapshot.json'),'utf8'));
if(snapshot.commit!==baselineCommit||snapshot.referenceSha256!==referenceSha256)throw Error('Working baseline provenance mismatch');
function historical(file){
  if(!Object.hasOwn(snapshot.files,file)||!/^(src\/[A-Za-z0-9._-]+\.ts|migrations\/[A-Za-z0-9._-]+\.sql)$/.test(file))throw Error('Unexpected baseline source path');
  if(!history.has(file)){
    const contents=readFileSync(join(snapshotRoot,file));
    if(digest(contents)!==snapshot.files[file])throw Error('Working baseline source checksum mismatch: '+file);
    history.set(file,contents.toString('utf8'));
  }
  return history.get(file);
}
async function bundle(currentUi){
  const snapshot={name:'known-working-source',setup(api){api.onLoad({filter:/[\\/]src[\\/].*\.ts$/},async args=>{
    const file=relative(root,args.path).replaceAll('\\','/');
    if(!file.startsWith('src/'))throw Error('Unexpected baseline source');
    const contents=currentUi&&uiFiles.has(file)?await readFile(args.path,'utf8'):historical(file);
    return {contents,loader:'ts',resolveDir:dirname(args.path)};
  });}};
  const panel={name:'baseline-panel-html',setup(api){api.onLoad({filter:/[\\/]src[\\/]panel\.ts$/},async()=>{
    const result=await build({absWorkingDir:root,entryPoints:[join(root,'src/panel.ts')],bundle:true,write:false,format:'esm',plugins:[snapshot]});
    const module=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
    let html=module.PANEL_HTML;
    for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))html=html.replace(match[0],'<script>'+(await transform(match[1],{minify:true,target:'es2022'})).code+'</script>');
    return {contents:'export const PANEL_HTML='+JSON.stringify(html)+';',loader:'js'};
  });}};
  const result=await build({absWorkingDir:root,entryPoints:[join(root,'src/direct-worker.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:*'],plugins:[panel,snapshot]});
  return (await transform(Buffer.from(result.outputFiles[0].contents).toString(),{minify:true,format:'esm',target:'es2022',legalComments:'eof'})).code;
}
/** Offline UI-only candidate. Never deploys or touches a provider or database. */
export async function rebuildWorkingReference(){
  const reference=await bundle(false),actual=digest(reference);
  if(actual!==referenceSha256)throw Error('Historical source does not reproduce the verified artifact; baseline promotion refused. Actual SHA-256: '+actual);
  return reference;
}
export async function buildWorkingBaseline({out=join(root,'.artifacts','working-baseline-ui')}={}){
  await rebuildWorkingReference();
  const code=await bundle(true),directory=resolve(out);
  await mkdir(directory,{recursive:true});
  const migrationFiles=Object.keys(snapshot.files).filter(file=>file.startsWith('migrations/'));
  for(const file of migrationFiles){if(!/^migrations\/[A-Za-z0-9._-]+\.sql$/.test(file))throw Error('Unexpected baseline migration');await mkdir(dirname(join(directory,file)),{recursive:true});await writeFile(join(directory,file),historical(file));}
  for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(root,file),join(directory,file));
  const manifest={buildId:'baseline-ui-'+digest(code).slice(0,16),platform:'workers',role:'standalone',transformed:true,version:JSON.parse(await readFile(join(root,'package.json'),'utf8')).version,bytes:Buffer.byteLength(code),gzipBytes:gzipSync(code).length,purpose:'offline-ui-only-candidate',baselineCommit,referenceSha256,referenceReproduced:true,sha256:digest(code),uiFiles:[...uiFiles],runtimeChanges:false,remoteDeploymentTested:false};
  await writeFile(join(directory,'worker.mjs'),code);
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
  return {directory,filename:'worker.mjs',code,manifest};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))buildWorkingBaseline().then(({manifest})=>console.log(JSON.stringify(manifest))).catch(error=>{console.error(error.message);process.exitCode=1;});
