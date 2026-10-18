import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {expect,it} from 'vitest';
import {buildArtifact} from '../installer/build.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
it.each([['node','standalone'],['workers','management'],['pages','connection']])('rejects incompatible baseline target %s/%s before building',async(platform,role)=>{
  await expect(buildArtifact(platform,{role,profile:'working-baseline'})).rejects.toThrow('standalone Workers or Pages');
});
it.each([
  [['--provider','workers'],'offline candidate'],
  [['--provider','workers','--preview','--topology','split'],'standalone'],
  [['--provider','render','--preview'],'Workers/Pages bundles only'],
])('rejects unsupported baseline installation without prompting for provider credentials',(args,message)=>{
  const r=spawnSync(process.execPath,['installer/cli.mjs','--build-profile','working-baseline','--no-save',...args],{cwd:root,windowsHide:true,encoding:'utf8',timeout:10000});
  expect(r.error).toBeUndefined();expect(r.status).not.toBe(0);expect(r.stdout+r.stderr).toContain(message);expect(r.stdout+r.stderr).not.toMatch(/\n\s+at\s|UnhandledPromiseRejection/);
});
it.each([root,resolve(root,'..')])('builds the byte-verified standalone baseline from %s without cloud mutations',cwd=>{
  const r=spawnSync(process.execPath,[join(root,'installer/cli.mjs'),'--provider','bundle','--build-profile','working-baseline','--preview','--no-save'],{cwd,windowsHide:true,encoding:'utf8',timeout:25000});
  expect(r.error).toBeUndefined();expect(r.status,r.stderr).toBe(0);expect(r.stdout).toContain('"referenceReproduced": true');expect(r.stdout).toContain('"remoteDeploymentTested": false');expect(r.stdout).toContain('"mutations": false');
},30000);
