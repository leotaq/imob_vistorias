param(
  [int]$Port = 3000,
  [int]$StartupTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$stdoutLog = Join-Path $env:TEMP "vistorias_dev_stdout_$runId.log"
$stderrLog = Join-Path $env:TEMP "vistorias_dev_stderr_$runId.log"

$dev = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList @("node_modules/next/dist/bin/next", "dev", "-p", "$Port", "--hostname", "0.0.0.0") `
  -WorkingDirectory $repoRoot `
  -PassThru `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog

$ready = $false
$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  try {
    $probe = Invoke-WebRequest -Uri "http://localhost:$Port/api/people" -UseBasicParsing -TimeoutSec 5
    if ($probe.StatusCode -eq 200) {
      $ready = $true
      break
    }
  } catch {}
}

if (-not $ready) {
  $outTail = if (Test-Path $stdoutLog) { (Get-Content $stdoutLog -Tail 50) -join "`n" } else { "" }
  $errTail = if (Test-Path $stderrLog) { (Get-Content $stderrLog -Tail 50) -join "`n" } else { "" }
  throw "Servidor nao respondeu em http://localhost:$Port.`nSTDOUT:`n$outTail`nSTDERR:`n$errTail"
}

Write-Host "Servidor ativo em http://localhost:$Port"
Write-Host "PID: $($dev.Id)"
Write-Host "STDOUT: $stdoutLog"
Write-Host "STDERR: $stderrLog"
