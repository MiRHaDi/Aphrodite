param([Parameter(ValueFromRemainingArguments=$true)][string[]]$InstallerArguments)
$ErrorActionPreference='Stop'
$ProgressPreference='Continue'
try{
Write-Host "`nAphrodite | Preparing a private installation" -ForegroundColor Cyan
$installerCache=Join-Path $env:LOCALAPPDATA 'Aphrodite\installer'
New-Item -ItemType Directory -Force -Path $installerCache | Out-Null
$installerArch=if([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64'){'arm64'}else{'x64'}
Write-Host '[BOOTSTRAP] Resolve official Node version and checksums' -ForegroundColor Cyan
$installerChecksums=(Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt').Content
$installerMatch=[regex]::Match($installerChecksums,"(?m)^([a-f0-9]{64})\s+(node-v24\.\d+\.\d+-win-$installerArch\.zip)\s*$")
if(-not $installerMatch.Success){throw 'Unable to resolve the official Node release'}
$installerFilename=$installerMatch.Groups[2].Value
$installerNodeDir=Join-Path $installerCache ($installerFilename -replace '\.zip$','')
$installerNode=Join-Path $installerNodeDir 'node.exe'
if(-not (Test-Path -LiteralPath $installerNode)){
  $installerArchive=Join-Path $installerCache $installerFilename
  Write-Host '[BOOTSTRAP] Download Node runtime' -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/latest-v24.x/$installerFilename" -OutFile $installerArchive
  Write-Host '[BOOTSTRAP] Verify Node SHA256 checksum' -ForegroundColor Cyan
  if((Get-FileHash -LiteralPath $installerArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $installerMatch.Groups[1].Value){throw 'Node checksum mismatch'}
  Write-Host '[BOOTSTRAP] Extract Node runtime' -ForegroundColor Cyan
  Expand-Archive -LiteralPath $installerArchive -DestinationPath $installerCache -Force
}else{Write-Host '[BOOTSTRAP] Use cached Node runtime' -ForegroundColor Green}
Write-Host '[BOOTSTRAP] Prepare installer source' -ForegroundColor Cyan
$installerRepo=$PSScriptRoot
if(-not $installerRepo -or -not (Test-Path -LiteralPath (Join-Path $installerRepo 'installer/cli.mjs'))){
  $installerSource=Join-Path $installerCache ('source-'+[guid]::NewGuid().ToString('N'))
  $installerZip=$installerSource+'.zip'
  Write-Host '[BOOTSTRAP] Download latest installer source' -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing 'https://github.com/MiRHaDi/Aphrodite/archive/refs/heads/main.zip' -OutFile $installerZip
  Expand-Archive -LiteralPath $installerZip -DestinationPath $installerSource
  $installerRepo=(Get-ChildItem -LiteralPath $installerSource -Directory | Select-Object -First 1).FullName
}else{Write-Host '[BOOTSTRAP] Use local installer source' -ForegroundColor Green}
$env:PATH=$installerNodeDir+';'+$env:PATH
Push-Location -LiteralPath $installerRepo
try{
  Write-Host '[BOOTSTRAP] Install dependencies (live progress)' -ForegroundColor Cyan
  & $installerNode 'installer\bootstrap-dependencies.mjs' (Join-Path $installerNodeDir 'node_modules\npm\bin\npm-cli.js')
  if($LASTEXITCODE -ne 0){Write-Host 'Dependencies could not be installed. Check the network and retry.' -ForegroundColor Red;[Environment]::ExitCode=$LASTEXITCODE;return}
  Write-Host '[BOOTSTRAP] Start guided build and deployment' -ForegroundColor Cyan
  & $installerNode 'installer\cli.mjs' @InstallerArguments
  if($LASTEXITCODE -ne 0){Write-Host 'Installation paused. Follow the recovery message above and run this installer again to resume.' -ForegroundColor Yellow;[Environment]::ExitCode=$LASTEXITCODE}
}finally{Pop-Location}

}catch{Write-Host ('Setup stopped: '+$_.Exception.Message) -ForegroundColor Red;Write-Host 'Resolve the issue and run the installer again. Saved installation settings are preserved.' -ForegroundColor Yellow;[Environment]::ExitCode=1}
