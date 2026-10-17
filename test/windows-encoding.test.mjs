import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {expect,it} from 'vitest';

const bootstrap=readFileSync(new URL('../install.ps1',import.meta.url),'utf8');
it('keeps the Windows bootstrap ASCII-only for legacy source decoding',()=>{
 expect(bootstrap).not.toMatch(/[^\x00-\x7f]/);
});
it.skipIf(process.platform!=='win32')('preserves Persian across Windows PowerShell 5.1 native input and output',()=>{
 const encoding=bootstrap.match(/# APHRODITE_CONSOLE_ENCODING_START([\s\S]*?)# APHRODITE_CONSOLE_ENCODING_END/)[1];
 const nodePath=Buffer.from(process.execPath,'utf8').toString('base64');
 const code=`$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
${encoding}
$nodePath=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nodePath}'))
$samples=@(([string][char]0x0633+[char]0x0644+[char]0x0627+[char]0x0645),([string][char]0xfee1+[char]0xfefc+[char]0xfeb3))
foreach($sample in $samples){
$result=($sample | & $nodePath -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>process.stdout.write(s.trim()))")
if($result -cne $sample){throw 'Persian round trip changed characters'}
}
Write-Output ('PASS '+[Console]::InputEncoding.CodePage+' '+[Console]::OutputEncoding.CodePage)
`;
 const executable=(process.env.SystemRoot||'C:\\Windows')+'\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
 const result=spawnSync(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:20000});
 expect(result.error).toBeUndefined();expect(result.status,result.stderr).toBe(0);expect(result.stdout).toContain('PASS 65001 65001');
});
