import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';
import {resultHtml} from '../installer/result-card.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
it('handles invalid options and configuration without a JavaScript stack trace',()=>{
 for(const args of [['--unknown-option'],['--provider','workers','--name','invalid name','--no-save']]){
  const result=spawnSync(process.execPath,['installer/cli.mjs',...args],{cwd:root,windowsHide:true,encoding:'utf8',timeout:10000});
  expect(result.status).not.toBe(0);expect(result.stderr+result.stdout).not.toMatch(/\n\s+at\s|UnhandledPromiseRejection/);
 }
},30000);
it('has no Persian rendering or language-selection code in installer sources',()=>{
 for(const file of readdirSync(new URL('../installer/',import.meta.url)).filter(f=>f.endsWith('.mjs'))){
  const source=readFileSync(new URL('../installer/'+file,import.meta.url),'utf8');
  expect(source,file).not.toMatch(/[\u0600-\u06ff]/u);
  expect(source,file).not.toMatch(/APHRODITE_RTL|APHRODITE_LANG|PersianShaper|bidiFactory|Language \/|ui\.pick/);
 }
 expect(resultHtml({management:'https://example.com/private',token:'fake'},'nonce')).toContain('<html lang="en" dir="ltr">');
});
it.each(['split','standalone'])('prints English-only contiguous progress in a real %s preview',topology=>{
 const result=spawnSync(process.execPath,['installer/cli.mjs','--provider','workers','--preview','--topology',topology,'--name','installer-preview'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:25000,env:{...process.env,APHRODITE_LANG:'fa',APHRODITE_RTL:'invalid-old-setting',NO_COLOR:'1'}});
 expect(result.error).toBeUndefined();expect(result.status,result.stderr).toBe(0);
 expect(result.stdout).not.toMatch(/[\u0600-\u06ff]/u);expect(result.stdout).not.toContain('Language');
 const numbers=[...result.stdout.matchAll(/^\s*\[(\d+)\] \[/gm)].map(m=>Number(m[1]));
 expect(numbers.length).toBeGreaterThan(6);expect(numbers).toEqual(numbers.map((_,i)=>i+1));
 expect(result.stdout).toContain('Artifact ready');expect(result.stdout).toContain('"mutations": false');
},30000);
