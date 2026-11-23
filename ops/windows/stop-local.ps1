$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
Push-Location -LiteralPath $projectRoot
try {
    $nodeExe = if ($env:NUXT_NODE_EXE) { $env:NUXT_NODE_EXE } else { 'node' }
    $runtime = & $nodeExe --input-type=module -e "import { localState } from './scripts/local-paths.mjs'; console.log(localState)"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve local process state.' }
} finally { Pop-Location }
$state = Join-Path $runtime 'dev-process.json'
if (Test-Path -LiteralPath $state) {
    $saved = Get-Content -LiteralPath $state -Raw | ConvertFrom-Json
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$saved.pid)"
    $expectedEntry = Join-Path $projectRoot 'node_modules\nuxt\bin\nuxt.mjs'
    if ($proc -and $proc.Name -eq 'node.exe' -and $proc.CommandLine -and $proc.CommandLine.Contains($expectedEntry)) {
        & taskkill.exe /PID $proc.ProcessId /T /F
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop Nuxt.' }
    }
}
Remove-Item -LiteralPath $state -ErrorAction SilentlyContinue
Write-Host 'Nuxt stopped. Your PostgreSQL server is managed separately and remains running.'
