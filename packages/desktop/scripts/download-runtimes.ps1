# Download Python and Node.js runtimes for bundling with Helm (Windows)
# Usage: ./scripts/download-runtimes.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResourcesDir = Join-Path $ScriptDir ".." "src-tauri" "resources"

# Versions (keep in sync with download-runtimes.sh)
$PythonVersion = "3.12.13"
$PythonReleaseTag = "20260303"
$NodeVersion = "22.15.0"

# --- Python ---

$PyFilename = "cpython-${PythonVersion}+${PythonReleaseTag}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz"
$PyUrl = "https://github.com/astral-sh/python-build-standalone/releases/download/${PythonReleaseTag}/${PyFilename}"
$PyDest = Join-Path $ResourcesDir "python"

Write-Host "=== Downloading Python $PythonVersion ==="
if (Test-Path $PyDest) { Remove-Item -Recurse -Force $PyDest }
New-Item -ItemType Directory -Path $PyDest -Force | Out-Null

$TmpFile = [System.IO.Path]::GetTempFileName()
Invoke-WebRequest -Uri $PyUrl -OutFile $TmpFile
tar -xzf $TmpFile -C $PyDest --strip-components=1
Remove-Item $TmpFile
Write-Host "Python: $(& (Join-Path $PyDest 'python.exe') --version)"

# --- Node.js ---

$NodeFilename = "node-v${NodeVersion}-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/v${NodeVersion}/${NodeFilename}"
$NodeDest = Join-Path $ResourcesDir "node"

Write-Host "=== Downloading Node.js $NodeVersion ==="
if (Test-Path $NodeDest) { Remove-Item -Recurse -Force $NodeDest }
New-Item -ItemType Directory -Path $NodeDest -Force | Out-Null

$TmpZip = [System.IO.Path]::GetTempFileName() + ".zip"
Invoke-WebRequest -Uri $NodeUrl -OutFile $TmpZip
Expand-Archive -Path $TmpZip -DestinationPath $NodeDest -Force

# Flatten: move contents of inner directory up
$InnerDir = Get-ChildItem $NodeDest -Directory | Select-Object -First 1
if ($InnerDir) {
    Get-ChildItem $InnerDir.FullName | Move-Item -Destination $NodeDest
    Remove-Item $InnerDir.FullName -Recurse
}
Remove-Item $TmpZip

Write-Host "Node.js: $(& (Join-Path $NodeDest 'node.exe') --version)"
Write-Host "=== Done ==="
