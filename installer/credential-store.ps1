param([ValidateSet('get','set','delete')][string]$Operation,[string]$Target)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::InputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try{
 Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class InstallerCredentials {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct Credential {
  public uint Flags,Type; public string TargetName,Comment; public long LastWritten;
  public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist,AttributeCount;
  public IntPtr Attributes; public string TargetAlias,UserName;
 }
 [DllImport("advapi32.dll",EntryPoint="CredWriteW",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool Write(ref Credential value,uint flags);
 [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool Read(string target,uint type,uint flags,out IntPtr value);
 [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr value);
 [DllImport("advapi32.dll",EntryPoint="CredDeleteW",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool Delete(string target,uint type,uint flags);
}
'@
 if($Operation -eq 'delete'){[void][InstallerCredentials]::Delete($Target,1,0)}elseif($Operation -eq 'set'){
  $bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())
  if($bytes.Length -gt 2400){throw 'Credential too large'}
  $pointer=[Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  try{
   [Runtime.InteropServices.Marshal]::Copy($bytes,0,$pointer,$bytes.Length)
   $value=New-Object InstallerCredentials+Credential
   $value.Type=1;$value.TargetName=$Target;$value.CredentialBlobSize=$bytes.Length;$value.CredentialBlob=$pointer;$value.Persist=2;$value.UserName='Aphrodite Installer'
   if(-not [InstallerCredentials]::Write([ref]$value,0)){throw 'Credential storage unavailable'}
  }finally{[Runtime.InteropServices.Marshal]::FreeHGlobal($pointer)}
 }else{
  $pointer=[IntPtr]::Zero
  if(-not [InstallerCredentials]::Read($Target,1,0,[ref]$pointer)){exit 2}
  try{
   $value=[Runtime.InteropServices.Marshal]::PtrToStructure($pointer,[type][InstallerCredentials+Credential])
   $bytes=New-Object byte[] $value.CredentialBlobSize
   [Runtime.InteropServices.Marshal]::Copy($value.CredentialBlob,$bytes,0,$bytes.Length)
   [Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))
  }finally{[InstallerCredentials]::CredFree($pointer)}
 }
}catch{[Console]::Error.Write('System credential storage is unavailable.');exit 1}
