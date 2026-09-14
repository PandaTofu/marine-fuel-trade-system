$ErrorActionPreference = 'Stop'
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $appRoot '.local/processes.json'
if (Test-Path -LiteralPath $pidFile) {
    foreach ($entry in (Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json)) {
        $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq ([DateTime]$entry.start).ToUniversalTime().Ticks) { Stop-Process -Id $process.Id }
    }
}
$pgbin = if ($env:PG_BIN) { $env:PG_BIN } else { Split-Path (Get-Command psql.exe).Source }
$dataDir = [IO.Path]::GetFullPath((Join-Path $appRoot '.local/postgres'))
if (-not $dataDir.StartsWith($appRoot + [IO.Path]::DirectorySeparatorChar)) {throw 'Unexpected database directory'}
if (Test-Path -LiteralPath (Join-Path $dataDir 'postmaster.pid')) { & (Join-Path $pgbin 'pg_ctl.exe') -D $dataDir -m fast stop }
Write-Host 'Project services stopped. Database files are preserved.'
