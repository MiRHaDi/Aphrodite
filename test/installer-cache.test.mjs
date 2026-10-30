import {it,expect,afterEach} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ensureDependencies} from '../installer/dependency-cache.mjs';
import {buildArtifact} from '../installer/build.mjs';
const folders=[];afterEach(async()=>{for(const path of folders.splice(0))await rm(path,{recursive:true,force:true});});
it('skips dependency installation until lockfile, runtime or installed package availability changes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aphrodite-cache-test-'));folders.push(root);
 await writeFile(join(root,'package.json'),JSON.stringify({dependencies:{fixture:'1.0.0'}}));await writeFile(join(root,'package-lock.json'),'fixture-lock');
 let installs=0;const install=async()=>{installs++;await mkdir(join(root,'node_modules/fixture'),{recursive:true});await writeFile(join(root,'node_modules/fixture/package.json'),'{}');};
 expect((await ensureDependencies(root,install)).unchanged).toBe(false);expect((await ensureDependencies(root,install)).unchanged).toBe(true);expect(installs).toBe(1);
 await rm(join(root,'node_modules/fixture'),{recursive:true});expect((await ensureDependencies(root,install)).unchanged).toBe(false);
 await writeFile(join(root,'package-lock.json'),'changed-lock');await ensureDependencies(root,install);await ensureDependencies(root,install,{runtime:'changed-runtime'});expect(installs).toBe(4);
});
it('reuses byte-identical build artifacts when source is unchanged',async()=>{
 const first=await buildArtifact('workers',{role:'connection'}),second=await buildArtifact('workers',{role:'connection'});
 expect(second.directory).toBe(first.directory);expect(second.manifest.buildId).toBe(first.manifest.buildId);expect(second.code).toBe(first.code);expect(second.manifest.sha256).toBe(first.manifest.sha256);
});
