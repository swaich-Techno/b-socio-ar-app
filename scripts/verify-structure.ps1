[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$actual = [System.IO.Path]::GetFullPath($ProjectRoot)

$required = @(
    "apps\web\app",
    "apps\web\components",
    "apps\web\lib",
    "apps\web\models",
    "apps\web\public",
    "apps\web\tests",
    "apps\worker\app",
    "apps\worker\tests",
    "apps\worker\Dockerfile",
    "apps\worker\requirements.txt",
    "packages\shared-types",
    "packages\validation",
    "packages\database",
    "packages\storage",
    "packages\qr-engine",
    "packages\constants",
    "packages\ui",
    "docs\architecture",
    ".env.example",
    "README.md",
    "package.json",
    "pnpm-workspace.yaml"
)

$missing = foreach ($item in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $actual $item))) { $item }
}

if ($missing.Count -gt 0) {
    throw "Missing required paths:`n - $($missing -join "`n - ")"
}

$duplicate = Join-Path $actual "B SOCIO AR APP"
if (Test-Path -LiteralPath $duplicate) {
    throw "Nested duplicate project root detected: $duplicate"
}

$trackedSecretFiles = @(".env", ".env.local", "apps\worker\.env")
$presentSecrets = $trackedSecretFiles | Where-Object { Test-Path -LiteralPath (Join-Path $actual $_) }
if ($presentSecrets.Count -gt 0) {
    Write-Warning "Local secret files exist. Confirm they are ignored before sharing: $($presentSecrets -join ', ')"
}

Write-Host "Structure verification passed for $actual" -ForegroundColor Green
