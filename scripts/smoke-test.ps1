param(
  [int]$Port = 4010,
  [int]$StartupTimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runId = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$stdoutLog = Join-Path $env:TEMP "vistorias_dev_stdout_$runId.log"
$stderrLog = Join-Path $env:TEMP "vistorias_dev_stderr_$runId.log"

function Read-EnvFile {
  param([string]$Path)

  $map = @{}
  if (-not (Test-Path $Path)) { return $map }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1)
    $map[$key] = $value
  }

  return $map
}

function To-JsonBody {
  param([object]$Body)
  if ($null -eq $Body) { return $null }
  return ($Body | ConvertTo-Json -Depth 10 -Compress)
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers,
    [object]$Body
  )

  $uri = "http://localhost:$Port$Path"
  $payload = To-JsonBody -Body $Body
  $tmpFile = [System.IO.Path]::GetTempFileName()
  $payloadFile = $null
  $args = @("-sS", "-o", $tmpFile, "-w", "%{http_code}", "-X", $Method, $uri)

  if ($Headers) {
    foreach ($k in $Headers.Keys) {
      $args += @("-H", "${k}: $($Headers[$k])")
    }
  }

  if ($null -ne $payload) {
    $payloadFile = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($payloadFile, $payload, $utf8NoBom)
    $args += @("-H", "Content-Type: application/json", "--data-binary", "@$payloadFile")
  }

  $statusText = & curl.exe @args
  $status = 0
  if ($statusText -match "^\d+$") {
    $status = [int]$statusText
  }
  $content = ""
  if (Test-Path $tmpFile) {
    $content = Get-Content $tmpFile -Raw
    Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
  }
  if ($null -ne $payloadFile -and (Test-Path $payloadFile)) {
    Remove-Item $payloadFile -Force -ErrorAction SilentlyContinue
  }

  $json = $null
  try { $json = $content | ConvertFrom-Json } catch {}

  return [pscustomobject]@{
    Status  = $status
    Content = $content
    Json    = $json
  }
}

function Assert-Status {
  param(
    [string]$Label,
    [int]$Expected,
    [object]$Response
  )
  if ($Response.Status -ne $Expected) {
    throw "${Label}: esperado HTTP $Expected, recebido HTTP $($Response.Status). Body: $($Response.Content)"
  }
}

function Invoke-SupabaseDelete {
  param(
    [string]$Url,
    [string]$Key,
    [string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Url) -or [string]::IsNullOrWhiteSpace($Key)) {
    return
  }

  $headers = @{
    apikey        = $Key
    Authorization = "Bearer $Key"
    Prefer        = "return=minimal"
  }
  try {
    $args = @("-sS", "-o", "NUL", "-X", "DELETE", "$Url$Path")
    foreach ($k in $headers.Keys) {
      $args += @("-H", "${k}: $($headers[$k])")
    }
    & curl.exe @args | Out-Null
  } catch {}
}

function Stop-LocalNextDev {
  param([string]$RepoPath)

  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -match "start-server\.js" -and
      $_.CommandLine -match [Regex]::Escape($RepoPath)
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Iniciando smoke test na porta $Port..."

$dev = $null
$createdPersonId = $null

$envMap = Read-EnvFile -Path (Join-Path $repoRoot ".env.local")
$adminPin = $envMap["ADMIN_PIN"]
$supabaseUrl = if ($envMap.ContainsKey("SUPABASE_URL") -and -not [string]::IsNullOrWhiteSpace($envMap["SUPABASE_URL"])) {
  $envMap["SUPABASE_URL"]
} else {
  $envMap["NEXT_PUBLIC_SUPABASE_URL"]
}
$supabaseKey = $envMap["SUPABASE_SERVICE_ROLE_KEY"]

try {
  Stop-LocalNextDev -RepoPath $repoRoot

  if (Test-Path (Join-Path $repoRoot ".next/dev/lock")) {
    Remove-Item (Join-Path $repoRoot ".next/dev/lock") -Force -ErrorAction SilentlyContinue
  }

  $dev = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "-p", "$Port" -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

  Start-Sleep -Seconds 6

  $ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    $probe = Invoke-Api -Method "GET" -Path "/api/people" -Headers @{} -Body $null
    if ($probe.Status -eq 200) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 2
  }

  if (-not $ready) {
    $outTail = if (Test-Path $stdoutLog) { (Get-Content $stdoutLog -Tail 40) -join "`n" } else { "" }
    $errTail = if (Test-Path $stderrLog) { (Get-Content $stderrLog -Tail 40) -join "`n" } else { "" }
    throw "Servidor nao subiu em tempo habil. Logs:`nSTDOUT:`n$outTail`nSTDERR:`n$errTail"
  }

  Write-Host "Servidor pronto. Rodando validacoes..."

  $peopleRes = Invoke-Api -Method "GET" -Path "/api/people" -Headers @{} -Body $null
  Assert-Status -Label "GET /api/people" -Expected 200 -Response $peopleRes
  $people = @($peopleRes.Json.people)
  $manager = $people | Where-Object { $_.role -eq "manager" -and $_.active -eq $true } | Select-Object -First 1
  $inspector = $people | Where-Object { $_.role -eq "inspector" -and $_.active -eq $true } | Select-Object -First 1
  if ($null -eq $manager -or $null -eq $inspector) {
    throw "Nao encontrei gestor e vistoriador ativos para testar."
  }

  $testHeadersManager = @{ "X-Actor-Id" = "$($manager.id)" }
  $testHeadersInspector = @{ "X-Actor-Id" = "$($inspector.id)" }
  $jsTzOffsetMinutes = [int](([DateTime]::Now.ToUniversalTime() - [DateTime]::Now).TotalMinutes)

  $baseLocal = (Get-Date).Date.AddDays(1).AddHours(10)
  while ($baseLocal.DayOfWeek -eq "Saturday" -or $baseLocal.DayOfWeek -eq "Sunday") {
    $baseLocal = $baseLocal.AddDays(1)
  }
  $slot1Utc = $baseLocal.ToUniversalTime().ToString("o")
  $slot2Utc = $baseLocal.AddHours(2).ToUniversalTime().ToString("o")

  $code1 = "ZZ-SMOKE-$runId-1"
  $create1 = Invoke-Api -Method "POST" -Path "/api/inspections" -Headers $testHeadersManager -Body @{
    type = "visita"
    property_code = $code1
    property_address = "Rua Teste API, 100"
    notes = "smoke test"
    assigned_to = "$($inspector.id)"
  }
  Assert-Status -Label "POST /api/inspections (1)" -Expected 201 -Response $create1
  $inspection1Id = $create1.Json.inspection.id

  $listInspector = Invoke-Api -Method "GET" -Path "/api/inspections?status=new" -Headers $testHeadersInspector -Body $null
  Assert-Status -Label "GET /api/inspections?status=new" -Expected 200 -Response $listInspector
  $hasInspection1 = @($listInspector.Json.inspections | Where-Object { $_.id -eq $inspection1Id }).Count -gt 0
  if (-not $hasInspection1) {
    throw "Inspecao criada nao apareceu na lista do vistoriador."
  }

  $receive1 = Invoke-Api -Method "POST" -Path "/api/inspections/$inspection1Id/receive" -Headers $testHeadersInspector -Body @{
    scheduled_start = $slot1Utc
    duration_minutes = 60
    tz_offset_minutes = $jsTzOffsetMinutes
  }
  Assert-Status -Label "POST /api/inspections/:id/receive (1)" -Expected 200 -Response $receive1

  $code2 = "ZZ-SMOKE-$runId-2"
  $create2 = Invoke-Api -Method "POST" -Path "/api/inspections" -Headers $testHeadersManager -Body @{
    type = "revistoria"
    property_code = $code2
    property_address = "Rua Teste API, 200"
    notes = "smoke conflict"
    assigned_to = "$($inspector.id)"
  }
  Assert-Status -Label "POST /api/inspections (2)" -Expected 201 -Response $create2
  $inspection2Id = $create2.Json.inspection.id

  $receiveConflict = Invoke-Api -Method "POST" -Path "/api/inspections/$inspection2Id/receive" -Headers $testHeadersInspector -Body @{
    scheduled_start = $slot1Utc
    duration_minutes = 60
    tz_offset_minutes = $jsTzOffsetMinutes
  }
  Assert-Status -Label "POST /api/inspections/:id/receive (conflito)" -Expected 409 -Response $receiveConflict
  if ($null -eq $receiveConflict.Json.suggestedStart) {
    throw "Conflito sem suggestedStart."
  }

  $receive2 = Invoke-Api -Method "POST" -Path "/api/inspections/$inspection2Id/receive" -Headers $testHeadersInspector -Body @{
    scheduled_start = $slot2Utc
    duration_minutes = 60
    tz_offset_minutes = $jsTzOffsetMinutes
  }
  Assert-Status -Label "POST /api/inspections/:id/receive (2)" -Expected 200 -Response $receive2

  $toInProgress = Invoke-Api -Method "POST" -Path "/api/inspections/$inspection1Id/status" -Headers $testHeadersInspector -Body @{
    status = "in_progress"
  }
  Assert-Status -Label "POST /api/inspections/:id/status in_progress" -Expected 200 -Response $toInProgress

  $toCompleted = Invoke-Api -Method "POST" -Path "/api/inspections/$inspection1Id/status" -Headers $testHeadersInspector -Body @{
    status = "completed"
  }
  Assert-Status -Label "POST /api/inspections/:id/status completed" -Expected 200 -Response $toCompleted

  $badPin = Invoke-Api -Method "POST" -Path "/api/people" -Headers @{} -Body @{
    name = "ZZ-SMOKE-BADPIN-$runId"
    role = "manager"
  }
  Assert-Status -Label "POST /api/people sem PIN" -Expected 401 -Response $badPin

  if ([string]::IsNullOrWhiteSpace($adminPin)) {
    throw "ADMIN_PIN nao encontrado no .env.local para validar fluxo admin."
  }

  $goodPinHeaders = @{ "X-Admin-Pin" = $adminPin }
  $createPerson = Invoke-Api -Method "POST" -Path "/api/people" -Headers $goodPinHeaders -Body @{
    name = "ZZ-SMOKE-ADMIN-$runId"
    role = "inspector"
  }
  Assert-Status -Label "POST /api/people com PIN" -Expected 201 -Response $createPerson
  $createdPersonId = $createPerson.Json.person.id

  $patchPerson = Invoke-Api -Method "PATCH" -Path "/api/people/$createdPersonId" -Headers $goodPinHeaders -Body @{
    active = $false
  }
  Assert-Status -Label "PATCH /api/people/:id com PIN" -Expected 200 -Response $patchPerson

  $fromRange = $baseLocal.AddHours(-1).ToUniversalTime().ToString("o")
  $toRange = $baseLocal.AddHours(4).ToUniversalTime().ToString("o")
  $calendar = Invoke-Api -Method "GET" -Path "/api/calendar?assignedTo=$($inspector.id)&from=$fromRange&to=$toRange" -Headers $testHeadersManager -Body $null
  Assert-Status -Label "GET /api/calendar" -Expected 200 -Response $calendar
  if (@($calendar.Json.events).Count -lt 2) {
    throw "Calendario retornou menos eventos que o esperado."
  }

  Write-Host ""
  Write-Host "Smoke test concluido com sucesso."
  Write-Host "- Fluxo principal validado: criar, receber, conflito, status, calendario."
  Write-Host "- Fluxo admin validado: sem PIN bloqueia, com PIN cria e edita."
  Write-Host "- Run ID: $runId"
}
finally {
  if ($null -ne $dev -and -not $dev.HasExited) {
    Stop-Process -Id $dev.Id -Force
  }
  Stop-LocalNextDev -RepoPath $repoRoot

  # Limpeza dos dados de teste direto no Supabase.
  Invoke-SupabaseDelete -Url $supabaseUrl -Key $supabaseKey -Path "/rest/v1/inspections?property_code=like.ZZ-SMOKE-$runId-*"
  if ($null -ne $createdPersonId) {
    Invoke-SupabaseDelete -Url $supabaseUrl -Key $supabaseKey -Path "/rest/v1/people?id=eq.$createdPersonId"
  }
}
