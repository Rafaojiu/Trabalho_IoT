Param()

$ErrorActionPreference = 'Stop'

function Ensure-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    $candidateDirs = @(
      "$env:ProgramFiles\nodejs",
      "$env:LOCALAPPDATA\Programs\nodejs",
      "$env:ProgramFiles(x86)\nodejs"
    )
    foreach ($d in $candidateDirs) {
      if (Test-Path (Join-Path $d 'node.exe')) {
        $env:Path = "$d;" + $env:Path
        $node = Get-Command node -ErrorAction SilentlyContinue
        break
      }
    }
  }
  if (-not $node) {
    Write-Host "[ERRO] Node.js não encontrado no PATH. Instale em https://nodejs.org/" -ForegroundColor Red
    exit 1
  }
}

function Ensure-Python {
  $script:PyCmd = 'python'
  $py = Get-Command $script:PyCmd -ErrorAction SilentlyContinue
  if (-not $py) {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) { $script:PyCmd = 'py -3' }
  }
  if (-not $py) {
    Write-Host "[ERRO] Python não encontrado no PATH. Instale em https://python.org/" -ForegroundColor Red
    exit 1
  }
}

function Start-Window($title, $workDir, $command) {
  Start-Process powershell -ArgumentList @(
    '-NoExit','-ExecutionPolicy','Bypass','-Command',
    "Set-Location -Path '$workDir'; $command"
  ) -WindowStyle Normal -WorkingDirectory $workDir -Wait:$false -Verb RunAs -ErrorAction SilentlyContinue | Out-Null
}

# Ir para diretório do script
Set-Location -Path $PSScriptRoot

Ensure-Node
Ensure-Python

Start-Window 'MQTT Broker' $PSScriptRoot 'node broker.js'
Start-Window 'Backend'     (Join-Path $PSScriptRoot 'backend')   'npm run dev'
Start-Window 'Simulator'   (Join-Path $PSScriptRoot 'simulator') "$script:PyCmd simulator.py"
Start-Window 'Dashboard'   (Join-Path $PSScriptRoot 'dashboard') 'npm start'

Start-Process 'http://localhost:3003/' | Out-Null
