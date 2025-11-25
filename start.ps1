<#
  Script PowerShell avançado para iniciar o Sistema IoT ANKOM RF
  Recursos:
  - Verificação de dependências (Node, npm, Python, pip)
  - Instalação automática de pacotes npm e requirements
  - Checagem de portas (3000/3001, 3003, 8080, 1883)
  - Logs detalhados com cores e timestamps
  - Modo -Debug para logs verbosos
  - Inicializa Broker (Node/Aedes), Backend, Dashboard e Simulador
#>

param(
  [switch]$Debug
)

function Write-Log {
  param(
    [string]$Msg,
    [string]$Level = 'INFO'
  )
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  switch ($Level) {
    'INFO' { $c = 'Cyan' }
    'WARN' { $c = 'Yellow' }
    'ERROR' { $c = 'Red' }
    'OK' { $c = 'Green' }
    default { $c = 'White' }
  }
  Write-Host "[$ts] [$Level] $Msg" -ForegroundColor $c
}

function Test-PortFree {
  param([int]$Port)
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $tcp.Connect('127.0.0.1', $Port)
    $tcp.Close()
    return $false
  } catch {
    return $true
  }
}

function Ensure-Command {
  param([string]$Cmd, [string]$Name)
  $exists = Get-Command $Cmd -ErrorAction SilentlyContinue
  if (-not $exists) {
    Write-Log "Dependência ausente: $Name ($Cmd)" 'ERROR'
    exit 1
  }
}

$script:Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $script:Root

Write-Log 'Iniciando verificação de dependências'
Ensure-Command 'node' 'Node.js'
Ensure-Command 'npm' 'npm'
Ensure-Command 'python' 'Python'
Ensure-Command 'pip' 'pip'
Write-Log 'Dependências básicas OK' 'OK'

Write-Log 'Ajustando política de execução para scripts' 'INFO'
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force

Write-Log 'Checando portas necessárias' 'INFO'
$ports = @{ Dashboard = 3000; DashboardAlt = 3001; Backend = 3003; WS = 8080; MQTT = 1883 }
foreach ($k in $ports.Keys) {
  $free = Test-PortFree -Port $ports[$k]
  Write-Log "Porta $k (${ports[$k]}): " + ($free ? 'livre' : 'ocupada')
}

function Ensure-NpmInstall {
  param([string]$Path)
  Push-Location $Path
  if (-not (Test-Path 'node_modules')) {
    Write-Log "Instalando dependências npm em $Path" 'INFO'
    npm ci
  } elseif ($Debug) {
    Write-Log "node_modules existe em $Path, pulando instalação" 'WARN'
  }
  Pop-Location
}

function Ensure-PipInstall {
  param([string]$ReqPath, [string]$WorkDir)
  if (Test-Path $ReqPath) {
    Push-Location $WorkDir
    Write-Log "Instalando requirements do simulador ($ReqPath)" 'INFO'
    python -m pip install -r (Resolve-Path $ReqPath)
    Pop-Location
  }
}

Write-Log 'Instalando dependências' 'INFO'
Ensure-NpmInstall -Path (Join-Path $script:Root 'backend')
Ensure-NpmInstall -Path (Join-Path $script:Root 'dashboard')
Ensure-PipInstall -ReqPath (Join-Path $script:Root 'simulator/requirements.txt') -WorkDir (Join-Path $script:Root 'simulator')

Write-Log 'Iniciando serviços' 'INFO'

Write-Log 'Broker MQTT (Node/Aedes)' 'INFO'
Start-Process -FilePath 'node' -ArgumentList 'broker.js' -WorkingDirectory $script:Root -WindowStyle Normal -PassThru | Out-Null
Start-Sleep -Seconds 2

Write-Log 'Backend Node.js' 'INFO'
Start-Process -FilePath 'npm' -ArgumentList 'start' -WorkingDirectory (Join-Path $script:Root 'backend') -WindowStyle Normal -PassThru | Out-Null
Start-Sleep -Seconds 2

Write-Log 'Dashboard React' 'INFO'
Start-Process -FilePath 'npm' -ArgumentList 'start' -WorkingDirectory (Join-Path $script:Root 'dashboard') -WindowStyle Normal -PassThru | Out-Null
Start-Sleep -Seconds 3

Write-Log 'Simulador Python' 'INFO'
Start-Process -FilePath 'python' -ArgumentList 'simulator.py' -WorkingDirectory (Join-Path $script:Root 'simulator') -WindowStyle Normal -PassThru | Out-Null

Write-Log 'Todos os serviços foram iniciados' 'OK'
Write-Log 'Backend: http://localhost:3003'
Write-Log 'Dashboard: http://localhost:3001 (ou 3000 se livre)'
Write-Log 'MQTT Broker: tcp://localhost:1883'

if ($Debug) {
  Write-Log 'Modo debug habilitado: verifique as janelas para logs detalhados' 'WARN'
}
