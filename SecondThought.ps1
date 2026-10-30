[CmdletBinding()]
param(
    [ValidateSet('Demo','Live','Replay','Baseline','Compare','Dev','Preflight','Build','Test')]
    [string]$Mode = 'Demo',

    [ValidateSet('Berth','Run440','Door2')]
    [string]$Trial = 'Berth',

    [switch]$Install,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Write-STHeader {
    param([string]$Text)
    Write-Host ''
    Write-Host ('=' * 68) -ForegroundColor DarkGray
    Write-Host (' SECOND THOUGHT // ' + $Text) -ForegroundColor Cyan
    Write-Host ('=' * 68) -ForegroundColor DarkGray
}

function Write-STCheck {
    param([bool]$Ok, [string]$Label, [string]$Detail = '')
    if ($Ok) {
        Write-Host '[PASS] ' -NoNewline -ForegroundColor Green
    } else {
        Write-Host '[FAIL] ' -NoNewline -ForegroundColor Red
    }
    Write-Host $Label -NoNewline
    if ($Detail) { Write-Host ('  ' + $Detail) -ForegroundColor DarkGray } else { Write-Host '' }
}

function Get-CommandVersion {
    param([string]$Name, [string[]]$Args)
    try {
        $cmd = Get-Command $Name -ErrorAction Stop
        $value = & $cmd.Source @Args 2>$null | Select-Object -First 1
        return [string]$value
    } catch {
        return $null
    }
}

function Test-STPort {
    param([int]$Port)
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(300)
        if ($ok -and $client.Connected) {
            $client.EndConnect($async)
            $client.Dispose()
            return $true
        }
        $client.Dispose()
        return $false
    } catch { return $false }
}

function Test-STHttp {
    param([string]$Uri)
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    } catch { return $false }
}

function Invoke-STPreflight {
    Write-STHeader 'PREFLIGHT'

    $node = Get-CommandVersion 'node' @('--version')
    $npm = Get-CommandVersion 'npm' @('--version')
    $git = Get-CommandVersion 'git' @('--version')

    Write-STCheck ([bool]$node) 'Node.js' $node
    Write-STCheck ([bool]$npm) 'npm' $npm
    Write-STCheck ([bool]$git) 'Git' $git
    Write-STCheck (Test-Path (Join-Path $ProjectRoot 'package.json')) 'package.json' $ProjectRoot
    Write-STCheck (Test-Path (Join-Path $ProjectRoot 'package-lock.json')) 'package-lock.json'
    Write-STCheck (Test-Path (Join-Path $ProjectRoot 'src\lib\nmm\engine.ts')) 'NMM engine'
    Write-STCheck (Test-Path (Join-Path $ProjectRoot 'src\lib\nmm\trials.ts')) 'Canonical trials'

    $deps = Test-Path (Join-Path $ProjectRoot 'node_modules')
    Write-STCheck $deps 'node_modules' $(if ($deps) { 'installed' } else { 'missing; run with -Install once' })

    $nebius = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('NEBIUS_API_KEY'))
    $tavily = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('TAVILY_API_KEY'))
    Write-STCheck $nebius 'NEBIUS_API_KEY' $(if ($nebius) { 'present' } else { 'not set; reference harness still works' })
    Write-STCheck $tavily 'TAVILY_API_KEY' $(if ($tavily) { 'present' } else { 'not set; Tavily probe will remain unarmed' })

    if (-not $node) {
        throw 'Node.js is required before Second Thought can run.'
    }

    $prebuiltRunner = Test-Path (Join-Path $ProjectRoot 'prebuilt-local.mjs')
    $prebuiltBundle = Test-Path (Join-Path $ProjectRoot '.vercel\output\functions\__server.func\index.mjs')
    Write-STCheck $prebuiltRunner 'prebuilt-local.mjs'
    Write-STCheck $prebuiltBundle 'Prebuilt Vercel/Nitro bundle'

    if ($Mode -in @('Demo','Live','Replay','Baseline','Compare','Dev')) {
        if (-not $prebuiltRunner -or -not $prebuiltBundle) {
            throw 'The prebuilt runtime files are missing.'
        }
        return $true
    }

    if (-not $npm) {
        throw 'npm is required for Build and Test modes.'
    }

    if (-not $deps -and -not $Install) {
        Write-Host ''
        Write-Host 'Dependencies are not installed for Build/Test mode.' -ForegroundColor Yellow
        return $false
    }

    if (-not $deps -and $Install) {
        Write-Host ''
        Write-Host '[SETUP] Installing locked dependencies with npm ci...' -ForegroundColor Yellow
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
        Write-STCheck $true 'Dependencies installed'
    }

    return $true
}

function Start-STPrebuiltServer {
    $url = 'http://127.0.0.1:8080/'
    if (Test-STHttp $url) {
        Write-STCheck $true 'Second Thought runtime' 'already running on :8080'
        return
    }

    if (Test-STPort 8080) {
        throw 'Port 8080 is already occupied by another process.'
    }

    $runner = Join-Path $ProjectRoot 'prebuilt-local.mjs'
    $bundle = Join-Path $ProjectRoot '.vercel\output\functions\__server.func\index.mjs'
    if (-not (Test-Path $runner)) {
        throw 'prebuilt-local.mjs is missing from the project root.'
    }
    if (-not (Test-Path $bundle)) {
        throw 'The prebuilt Vercel/Nitro bundle is missing.'
    }

    $logDir = Join-Path $ProjectRoot '.secondthought'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $stdout = Join-Path $logDir 'runtime.stdout.log'
    $stderr = Join-Path $logDir 'runtime.stderr.log'

    Write-Host '[START] prebuilt Second Thought runtime' -ForegroundColor Yellow
    Start-Process -FilePath 'node.exe' -ArgumentList @($runner) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden | Out-Null

    $ready = $false
    foreach ($i in 1..40) {
        Start-Sleep -Milliseconds 250
        if (Test-STHttp $url) { $ready = $true; break }
    }

    if (-not $ready) {
        Write-Host ''
        Write-Host 'The prebuilt runtime did not become ready. Last log lines:' -ForegroundColor Red
        if (Test-Path $stderr) { Get-Content $stderr -Tail 25 }
        if (Test-Path $stdout) { Get-Content $stdout -Tail 25 }
        throw 'Second Thought prebuilt runtime failed to start.'
    }

    Write-STCheck $true 'Second Thought runtime' 'http://127.0.0.1:8080'
}

function Get-STTrialId {
    switch ($Trial) {
        'Berth'  { return 'berth-7' }
        'Run440' { return 'yield-440' }
        'Door2'  { return 'door-2' }
    }
}

$ok = Invoke-STPreflight
if (-not $ok) { exit 2 }

switch ($Mode) {
    'Preflight' {
        Write-Host ''
        Write-Host 'Preflight complete.' -ForegroundColor Green
    }
    'Build' {
        Write-STHeader 'BUILD'
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
        Write-Host 'Build passed.' -ForegroundColor Green
    }
    'Test' {
        Write-STHeader 'TEST'
        & npm test
        if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
        & npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
        Write-Host 'Tests and typecheck passed.' -ForegroundColor Green
    }
    'Dev' {
        Write-STHeader 'PREBUILT RUNTIME'
        Start-STPrebuiltServer
        $url = 'http://localhost:8080/'
        Write-Host ('OPEN  ' + $url) -ForegroundColor Cyan
        if (-not $NoBrowser) { Start-Process $url }
    }

    'Live' {
        Write-STHeader ('LIVE ADAPTIVE // ' + $Trial.ToUpperInvariant())
        $nebius = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('NEBIUS_API_KEY'))
        if (-not $nebius) { throw 'Live mode requires NEBIUS_API_KEY in this PowerShell session.' }
        $runner = Join-Path $ProjectRoot 'live-adaptive.mjs'
        if (-not (Test-Path $runner)) { throw 'live-adaptive.mjs is missing from the project root.' }
        Write-Host ('TRIAL  ' + $Trial) -ForegroundColor White
        Write-Host 'MODE   live adaptive NMM' -ForegroundColor Cyan
        Write-Host 'BOUNDARY  Live Nemotron posterior + observable evidence signals drive CCG/MRL. Ground truth scores only after termination.' -ForegroundColor DarkGray
        Write-Host ''
        & node $runner --trial $Trial
        if ($LASTEXITCODE -ne 0) { throw 'Live adaptive NMM failed.' }
    }
    'Replay' {
        Write-STHeader ('LIVE REPLAY // ' + $Trial.ToUpperInvariant())
        $nebius = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('NEBIUS_API_KEY'))
        $tavily = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('TAVILY_API_KEY'))
        if (-not $nebius -or -not $tavily) { throw 'Replay mode requires NEBIUS_API_KEY and TAVILY_API_KEY.' }
        & node (Join-Path $ProjectRoot 'live-replay.mjs') --trial $Trial
        if ($LASTEXITCODE -ne 0) { throw 'Live replay failed.' }
    }
    'Baseline' {
        Write-STHeader ('ULTRA BASELINE // ' + $Trial.ToUpperInvariant())
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('NEBIUS_API_KEY'))) { throw 'Baseline mode requires NEBIUS_API_KEY.' }
        & node (Join-Path $ProjectRoot 'live-baseline.mjs') --trial $Trial
        if ($LASTEXITCODE -ne 0) { throw 'Live baseline failed.' }
    }
    'Compare' {
        Write-STHeader ('LIVE COMPARISON // ' + $Trial.ToUpperInvariant())
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('NEBIUS_API_KEY'))) { throw 'Compare mode requires NEBIUS_API_KEY.' }
        & node (Join-Path $ProjectRoot 'compare-live.mjs') --trial $Trial
        if ($LASTEXITCODE -ne 0) { throw 'Live comparison failed.' }
    }
    'Demo' {
        Write-STHeader ('DEMO // ' + $Trial.ToUpperInvariant())
        Start-STPrebuiltServer
        $trialId = Get-STTrialId
        $url = "http://localhost:8080/?trial=$trialId"
        Write-Host ('TRIAL  ' + $Trial) -ForegroundColor White
        Write-Host ('MODE   reference harness') -ForegroundColor DarkGray
        Write-Host ('OPEN   ' + $url) -ForegroundColor Cyan
        Write-Host ''
        Write-Host 'The current canonical traces are deterministic reference traces.' -ForegroundColor Yellow
        Write-Host 'Live Token Factory/Tavily probes remain separate until the live trace path is wired.' -ForegroundColor Yellow
        if (-not $NoBrowser) { Start-Process $url }
    }
}