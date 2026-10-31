<#
.SYNOPSIS
  Publica los robots de Vigía de Contrataciones en Orchestrator y crea sus disparadores.

.DESCRIPTION
  1. Empaqueta cada proyecto de rpa/ con Studio (versión de su project.json) y sube el paquete.
  2. Crea o actualiza el proceso en la carpeta (un proceso por punto de entrada).
  3. Crea los disparadores de tiempo y de cola (docs/08-diseno-del-bot.md, 8.2 y 8.6).
  Idempotente: los paquetes ya subidos se omiten, los procesos se actualizan a la versión del proyecto y
  los disparadores existentes no se tocan (salvo -Actualizar). Lee la conexión de infra/.env.

.EXAMPLE
  .\infra\orchestrator\programar-robots.ps1
  .\infra\orchestrator\programar-robots.ps1 -Actualizar
  .\infra\orchestrator\programar-robots.ps1 -SinDisparadores
#>
[CmdletBinding()]
param(
    [string]$EnvPath = (Join-Path $PSScriptRoot '..\.env'),
    [string]$Studio = 'C:\Program Files\UiPathPlatform\Studio\26.0.204-cloud.25540\UiPath.Studio.CommandLine.exe',
    [switch]$Actualizar,
    [switch]$SinDisparadores
)

$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$paquetes = Join-Path $env:TEMP 'vigia-paquetes'
New-Item -ItemType Directory -Force $paquetes | Out-Null

function Leer-Env([string]$ruta) {
    $cfg = @{}
    Get-Content $ruta -Encoding UTF8 | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
        $k, $v = $_ -split '=', 2
        $cfg[$k.Trim()] = $v.Trim().Trim('"')
    }
    $cfg
}
$cfg = Leer-Env $EnvPath

# Hora de Guatemala (UTC-6, sin horario de verano)
$zonaHoraria = 'Central America Standard Time'

# ---------- Qué se publica y cuándo corre ----------
# Cron de Quartz: segundos minutos horas día-del-mes mes día-de-la-semana año
$procesos = @(
    @{ Proyecto = 'VC.Captura'; Nombre = 'VC.Captura'; Entrada = 'Main.xaml'; Argumentos = @{ in_PreseleccionLocal = $false }
       Disparadores = @(@{ Nombre = 'VC.Captura · boletín diario (cada hora de 06:00 a 12:00)'; Cron = '0 0 6-12 ? * * *' }) }
    @{ Proyecto = 'VC.Concurso'; Nombre = 'VC.Concurso'; Entrada = 'Main.xaml'; Argumentos = @{}
       # Corre en la sesión abierta de la PC (robot desatendido con interfaz) cada hora; si aparece la verificación
       # del portal, avisa y espera a la persona (ADR-0006). También se puede iniciar desde UiPath Assistant.
       Disparadores = @(@{ Nombre = 'VC.Concurso · detalle de los concursos en cola (cada hora de 07:00 a 21:00)'; Cron = '0 0 7-21 ? * * *' }) }
    @{ Proyecto = 'VC.Expediente'; Nombre = 'VC.Expediente'; Entrada = 'Main.xaml'; Argumentos = @{}
       # Atendido: la persona lo inicia desde UiPath Assistant con el NOG que decidió preparar (CU-16)
       Disparadores = @() }
    @{ Proyecto = 'VC.Analisis'; Nombre = 'VC.Analisis'; Entrada = 'Main.xaml'; Argumentos = @{}
       Disparadores = @(@{ Nombre = 'VC.Analisis · cola VC_Analisis'; Cola = 'VC_Analisis' }) }
    @{ Proyecto = 'VC.Analisis'; Nombre = 'VC.Analisis.RecogerRevisiones'; Entrada = 'RecogerRevisiones.xaml'; Argumentos = @{}
       Disparadores = @(@{ Nombre = 'VC.Analisis · recoger revisiones (cada 30 min)'; Cron = '0 0/30 * ? * * *' }) }
    @{ Proyecto = 'VC.Notificador'; Nombre = 'VC.Notificador'; Entrada = 'Main.xaml'; Argumentos = @{ in_Modo = 'RESUMEN' }
       Disparadores = @(
           @{ Nombre = 'VC.Notificador · resumen diario 07:00'; Cron = '0 0 7 ? * * *'; Argumentos = @{ in_Modo = 'RESUMEN' } }
           @{ Nombre = 'VC.Notificador · avisos de la cola'; Cola = 'VC_Notificaciones'; Argumentos = @{ in_Modo = 'AVISOS' } }
       ) }
    @{ Proyecto = 'VC.Datos'; Nombre = 'VC.Datos'; Entrada = 'Main.xaml'; Argumentos = @{}
       Disparadores = @(@{ Nombre = 'VC.Datos · carga OCDS semanal (domingo 02:30)'; Cron = '0 30 2 ? * SUN *' }) }
)

# ---------- Conexión ----------
$tok = Invoke-RestMethod -Method Post -Uri "$($cfg.UIPATH_URL)/identity_/connect/token" -Body @{
    grant_type = 'client_credentials'; client_id = $cfg.UIPATH_CLIENT_ID; client_secret = $cfg.UIPATH_CLIENT_SECRET
    scope = 'OR.Folders OR.Execution OR.Jobs OR.Queues'
}
$base = "$($cfg.UIPATH_URL)/$($cfg.UIPATH_ORG)/$($cfg.UIPATH_TENANT)/orchestrator_"
$carpetaNombre = if ($cfg.UIPATH_FOLDER) { $cfg.UIPATH_FOLDER } else { 'Shared' }
$h = @{ Authorization = "Bearer $($tok.access_token)" }
$carpeta = (Invoke-RestMethod "$base/odata/Folders?`$filter=DisplayName eq '$carpetaNombre'" -Headers $h).value | Select-Object -First 1
if (-not $carpeta) { throw "No existe la carpeta '$carpetaNombre' en Orchestrator." }
$h['X-UIPATH-OrganizationUnitId'] = "$($carpeta.Id)"
Write-Host "Carpeta: $($carpeta.DisplayName) ($($carpeta.Id))"

function Enviar($metodo, $url, $cuerpo) {
    $json = $cuerpo | ConvertTo-Json -Depth 6
    try {
        Invoke-RestMethod -Method $metodo -Uri $url -Headers $h -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json))
    } catch {
        $detalle = $_.ErrorDetails.Message
        throw "$metodo $url falló: $($_.Exception.Message) $detalle"
    }
}

function Subir-Paquete([string]$archivo) {
    # PowerShell 5.1 no tiene -Form: se arma el multipart con HttpClient
    Add-Type -AssemblyName System.Net.Http
    $cliente = New-Object System.Net.Http.HttpClient
    $cliente.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $tok.access_token)
    $cliente.DefaultRequestHeaders.Add('X-UIPATH-OrganizationUnitId', "$($carpeta.Id)")
    $contenido = New-Object System.Net.Http.MultipartFormDataContent
    $flujo = [IO.File]::OpenRead($archivo)
    try {
        $parte = New-Object System.Net.Http.StreamContent($flujo)
        $contenido.Add($parte, 'file', [IO.Path]::GetFileName($archivo))
        $r = $cliente.PostAsync("$base/odata/Processes/UiPath.Server.Configuration.OData.UploadPackage", $contenido).Result
        $texto = $r.Content.ReadAsStringAsync().Result
        if ($r.StatusCode -eq 'Conflict' -or $texto -match 'already exists') { return 'existente' }
        if (-not $r.IsSuccessStatusCode) { throw "Subida de $archivo falló: $([int]$r.StatusCode) $texto" }
        return 'subido'
    } finally { $flujo.Dispose(); $cliente.Dispose() }
}

# ---------- 1. Paquetes ----------
$versiones = @{}
foreach ($proyecto in ($procesos.Proyecto | Select-Object -Unique)) {
    $pj = Join-Path $raiz "rpa\$proyecto\project.json"
    $version = (Get-Content $pj -Raw -Encoding UTF8 | ConvertFrom-Json).projectVersion
    $versiones[$proyecto] = $version
    $nupkg = Join-Path $paquetes "$proyecto.$version.nupkg"
    if (-not (Test-Path $nupkg)) {
        Write-Host "Empaquetando $proyecto $version..."
        # Studio escribe avisos en stderr (p. ej. el del diseñador de formularios): no son errores; vale el .nupkg
        & { $ErrorActionPreference = 'Continue'; & $Studio publish -p $pj -g Custom -f $paquetes -v $version 2>&1 | Out-Null }
        if (-not (Test-Path $nupkg)) { throw "Studio no generó $nupkg" }
    }
    Write-Host "Paquete $proyecto $version`: $(Subir-Paquete $nupkg)"
}

# ---------- 2. Procesos ----------
$releases = @{}
$existentes = (Invoke-RestMethod "$base/odata/Releases" -Headers $h).value
foreach ($p in $procesos) {
    $version = $versiones[$p.Proyecto]
    $argumentos = if ($p.Argumentos.Count) { $p.Argumentos | ConvertTo-Json -Compress } else { $null }
    $actual = $existentes | Where-Object Name -eq $p.Nombre
    if (-not $actual) {
        $cuerpo = @{ Name = $p.Nombre; ProcessKey = $p.Proyecto; ProcessVersion = $version; EntryPointPath = $p.Entrada; InputArguments = $argumentos
                     Description = "Vigía de Contrataciones · $($p.Entrada)" }
        $actual = Enviar Post "$base/odata/Releases" $cuerpo
        Write-Host "Proceso creado: $($p.Nombre) $version"
    } elseif ($actual.ProcessVersion -ne $version) {
        Enviar Post "$base/odata/Releases($($actual.Id))/UiPath.Server.Configuration.OData.UpdateToSpecificPackageVersion" @{ packageVersion = $version } | Out-Null
        Write-Host "Proceso actualizado: $($p.Nombre) $($actual.ProcessVersion) -> $version"
    } else {
        Write-Host "Proceso existente: $($p.Nombre) $version"
    }
    $releases[$p.Nombre] = $actual
}

if ($SinDisparadores) { return }

# ---------- 3. Disparadores ----------
$colas = (Invoke-RestMethod "$base/odata/QueueDefinitions" -Headers $h).value
$disparadores = (Invoke-RestMethod "$base/odata/ProcessSchedules" -Headers $h).value
foreach ($p in $procesos) {
    $release = $releases[$p.Nombre]
    foreach ($d in $p.Disparadores) {
        $argumentosDisparador = if ($d.Argumentos) { $d.Argumentos } else { $p.Argumentos }
        $cuerpo = @{
            Name = $d.Nombre; Enabled = $true; ReleaseId = $release.Id; ReleaseName = $release.Name
            RuntimeType = 'Unattended'; StartStrategy = 1; JobPriority = 'Normal'
            TimeZoneId = $zonaHoraria
            InputArguments = $(if ($argumentosDisparador.Count) { $argumentosDisparador | ConvertTo-Json -Compress } else { $null })
        }
        if ($d.Cola) {
            $cola = $colas | Where-Object Name -eq $d.Cola
            if (-not $cola) { throw "No existe la cola $($d.Cola): ejecute primero configurar-orchestrator.ps1" }
            $cuerpo.QueueDefinitionId = $cola.Id
            $cuerpo.ItemsActivationThreshold = 1
            $cuerpo.ItemsPerJobActivationTarget = 1
            $cuerpo.MaxJobsForActivation = 1
            # Sin estos dos campos vacíos Orchestrator responde 500 al crear un disparador de cola
            $cuerpo.StartProcessCron = ''
            $cuerpo.StartProcessCronDetails = ''
        } else {
            $cuerpo.StartProcessCron = $d.Cron
            $cuerpo.StartProcessCronDetails = '{"type":5,"advancedCron":"' + $d.Cron + '"}'
        }
        $actual = $disparadores | Where-Object Name -eq $d.Nombre
        if (-not $actual) {
            Enviar Post "$base/odata/ProcessSchedules" $cuerpo | Out-Null
            Write-Host "Disparador creado: $($d.Nombre)"
        } elseif ($Actualizar) {
            $cuerpo.Id = $actual.Id
            Enviar Put "$base/odata/ProcessSchedules($($actual.Id))" $cuerpo | Out-Null
            Write-Host "Disparador actualizado: $($d.Nombre)"
        } else {
            Write-Host "Disparador existente: $($d.Nombre)"
        }
    }
}
Write-Host 'Listo. Revise en Orchestrator > Automations > Triggers.'
