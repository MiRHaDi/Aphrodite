param([Parameter(ValueFromRemainingArguments=$true)][string[]]$InstallerArguments)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Write-Host "`nAphrodite | Preparing a private installation" -ForegroundColor Cyan
$installerCache=Join-Path $env:LOCALAPPDATA 'Aphrodite\installer'
New-Item -ItemType Directory -Force -Path $installerCache | Out-Null
$installerArch=if([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64'){'arm64'}else{'x64'}
$installerChecksums=(Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt').Content
$installerMatch=[regex]::Match($installerChecksums,"(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-$installerArch\.zip)\s*$")
if(-not $installerMatch.Success){throw 'Unable to resolve the official Node release'}
$installerFilename=$installerMatch.Groups[2].Value
$installerNodeDir=Join-Path $installerCache ($installerFilename -replace '\.zip$','')
$installerNode=Join-Path $installerNodeDir 'node.exe'
if(-not (Test-Path -LiteralPath $installerNode)){
  $installerArchive=Join-Path $installerCache $installerFilename
  Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v24.x/$installerFilename" -OutFile $installerArchive
  if((Get-FileHash -LiteralPath $installerArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $installerMatch.Groups[1].Value){throw 'Node checksum mismatch'}
  Expand-Archive -LiteralPath $installerArchive -DestinationPath $installerCache -Force
}
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
  & $installerNode (Join-Path $installerNodeDir 'node_modules\npm\bin\npm-cli.js') ci --include=dev --ignore-scripts --no-fund --no-audit --loglevel=error
  if($LASTEXITCODE -ne 0){throw 'Dependency installation failed'}
  & $installerNode 'installer\cli.mjs' @InstallerArguments
  if($LASTEXITCODE -ne 0){throw 'Installation did not verify'}
}finally{Pop-Location}
