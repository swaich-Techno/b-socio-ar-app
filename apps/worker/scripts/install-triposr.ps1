param(
    [string]$Destination = (Join-Path $PSScriptRoot "..\vendor\TripoSR"),
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$Revision
)

$ErrorActionPreference = "Stop"
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$workerRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $destinationPath.StartsWith($workerRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "TripoSR must be installed under the worker directory: $workerRoot"
}
if (Test-Path -LiteralPath $destinationPath) {
    throw "Destination already exists. Preserve or review it before replacing: $destinationPath"
}

git clone --filter=blob:none https://github.com/VAST-AI-Research/TripoSR.git $destinationPath
git -C $destinationPath checkout $Revision
python -m pip install -r (Join-Path $destinationPath "requirements.txt")

Write-Host "TripoSR installed. Set TRIPOSR_REPOSITORY_PATH=$destinationPath" -ForegroundColor Green
