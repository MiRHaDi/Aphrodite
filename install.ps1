param([Parameter(ValueFromRemainingArguments=$true)][string[]]$InstallerArguments)
$ErrorActionPreference='Stop'
# APHRODITE_CONSOLE_ENCODING_START
# Keep this bootstrap ASCII-only for Windows PowerShell 5.1 source decoding.
# Configure both console directions and PowerShell-to-native pipelines.
$OutputEncoding=[System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=$OutputEncoding
[Console]::OutputEncoding=$OutputEncoding
# APHRODITE_CONSOLE_ENCODING_END
$ProgressPreference='Continue'
Write-Host "`nAphrodite | Preparing a private installation" -ForegroundColor Cyan
Write-Host ('Console UTF-8 | input: '+[Console]::InputEncoding.CodePage+' | output: '+[Console]::OutputEncoding.CodePage) -ForegroundColor DarkGray
$installerCache=Join-Path $env:LOCALAPPDATA 'Aphrodite\installer'
New-Item -ItemType Directory -Force -Path $installerCache | Out-Null
$installerArch=if([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64'){'arm64'}else{'x64'}
Write-Host '[1/5] Resolve official Node version and checksums' -ForegroundColor Cyan
$installerChecksums=(Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt').Content
$installerMatch=[regex]::Match($installerChecksums,"(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-$installerArch\.zip)\s*$")
if(-not $installerMatch.Success){throw 'Unable to resolve the official Node release'}
$installerFilename=$installerMatch.Groups[2].Value
$installerNodeDir=Join-Path $installerCache ($installerFilename -replace '\.zip$','')
$installerNode=Join-Path $installerNodeDir 'node.exe'
if(-not (Test-Path -LiteralPath $installerNode)){
  $installerArchive=Join-Path $installerCache $installerFilename
  Write-Host '[2/5] Download Node runtime' -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v24.x/$installerFilename" -OutFile $installerArchive
  if((Get-FileHash -LiteralPath $installerArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $installerMatch.Groups[1].Value){throw 'Node checksum mismatch'}
  Expand-Archive -LiteralPath $installerArchive -DestinationPath $installerCache -Force
}
Write-Host '[3/5] Prepare installer source' -ForegroundColor Cyan
$installerRepo=$PSScriptRoot
if(-not $installerRepo -or -not (Test-Path -LiteralPath (Join-Path $installerRepo 'installer/cli.mjs'))){
  $installerSource=Join-Path $installerCache ('source-'+[guid]::NewGuid().ToString('N'))
  $installerZip=$installerSource+'.zip'
  Invoke-WebRequest -UseBasicParsing 'https://github.com/MiRHaDi/Aphrodite/archive/refs/heads/main.zip' -OutFile $installerZip
  Expand-Archive -LiteralPath $installerZip -DestinationPath $installerSource
  $installerRepo=(Get-ChildItem -LiteralPath $installerSource -Directory | Select-Object -First 1).FullName
}
$env:PATH=$installerNodeDir+';'+$env:PATH
Push-Location -LiteralPath $installerRepo
try{
  Write-Host '[4/5] Install dependencies (status every 5 seconds)' -ForegroundColor Cyan
  & $installerNode 'installer\bootstrap-dependencies.mjs' (Join-Path $installerNodeDir 'node_modules\npm\bin\npm-cli.js')
  if($LASTEXITCODE -ne 0){throw 'Dependency installation failed'}
  Write-Host '[5/5] Start guided build and deployment' -ForegroundColor Cyan
  & $installerNode 'installer\cli.mjs' @InstallerArguments
  if($LASTEXITCODE -ne 0){throw 'Installation did not verify'}
}finally{Pop-Location}
