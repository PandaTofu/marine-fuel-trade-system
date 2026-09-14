$ErrorActionPreference = 'Stop'
$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pythonPath = Join-Path $appRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Install dependencies first. See app/README.md.' }
& $pythonPath (Join-Path $PSScriptRoot 'init_local.py')
if ($LASTEXITCODE -ne 0) { throw 'Database startup failed.' }
& $pythonPath (Join-Path $appRoot 'backend/manage.py') migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
$localDir = Join-Path $appRoot '.local'
$runtime = @()
foreach ($port in @(8000,5173)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "Port $port is in use. Stop the previous app instance first." }
}
$backend = Start-Process -FilePath $pythonPath -ArgumentList @('manage.py','runserver','127.0.0.1:8000','--noreload') -WorkingDirectory (Join-Path $appRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localDir 'backend.out.log') -RedirectStandardError (Join-Path $localDir 'backend.err.log') -PassThru
$runtime += @{id=$backend.Id;start=$backend.StartTime.ToUniversalTime().ToString('o')}
$nodePath = (Get-Command node.exe).Source
$frontend = Start-Process -FilePath $nodePath -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1') -WorkingDirectory (Join-Path $appRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $localDir 'frontend.out.log') -RedirectStandardError (Join-Path $localDir 'frontend.err.log') -PassThru
$runtime += @{id=$frontend.Id;start=$frontend.StartTime.ToUniversalTime().ToString('o')}
foreach ($port in @(8000,5173)) {
    $listener = $null
    for ($attempt=0; $attempt -lt 40; $attempt++) {
        $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) { break }
        Start-Sleep -Milliseconds 250
    }
    if ($listener) {
        # Windows venv launcher can spawn a separate Python worker.
        $worker = Get-Process -Id $listener.OwningProcess
        if ($runtime.id -notcontains $worker.Id) { $runtime += @{id=$worker.Id;start=$worker.StartTime.ToUniversalTime().ToString('o')} }
    }
}
ConvertTo-Json -InputObject $runtime | Set-Content -LiteralPath (Join-Path $localDir 'processes.json') -Encoding UTF8
if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) -or -not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) { throw 'Startup incomplete; inspect .local logs and run scripts/stop.ps1.' }
Write-Host 'Website: http://127.0.0.1:5173/  Login: http://127.0.0.1:5173/login'
