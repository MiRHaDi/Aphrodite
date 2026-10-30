import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
it('prints usable URLs and exits without opening a local result server by default',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const script="import {showInstallationResult} from './installer/installation-result.mjs';await showInstallationResult({url:'https://control.example',connections:[{url:'https://connect.example'}]},{ADMIN_PATH:'fixture-path',ADMIN_TOKEN:'fixture-token'});";
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:root,windowsHide:true,encoding:'utf8',timeout:5000});
 expect(result.error).toBeUndefined();expect(result.status).toBe(0);expect(result.stdout).toContain('https://control.example/fixture-path');expect(result.stdout).toContain('https://connect.example');expect(result.stdout).toContain('fixture-token');expect(result.stdout).not.toContain('127.0.0.1');
});
