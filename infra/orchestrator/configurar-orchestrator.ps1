<#
.SYNOPSIS
  Crea en Orchestrator las colas y los assets de Vigía de Contrataciones.

.DESCRIPTION
  Idempotente: lo que ya existe no se toca, salvo que se use -Actualizar.
  Lee la conexión y los secretos de infra/.env. Ver docs/08-diseno-del-bot.md (8.10)
  y docs/05-arquitectura.md (5.4).

.EXAMPLE
  .\infra\orchestrator\configurar-orchestrator.ps1
  .\infra\orchestrator\configurar-orchestrator.ps1 -Actualizar
#>
[CmdletBinding()]
param(
    [string]$EnvPath = (Join-Path $PSScriptRoot '..\.env'),
    [switch]$Actualizar
)

$ErrorActionPreference = 'Stop'

function Leer-Env([string]$ruta) {
    $cfg = @{}
    Get-Content $ruta | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
        $k, $v = $_ -split '=', 2
        $cfg[$k.Trim()] = $v.Trim().Trim('"')
    }
    $cfg
}

$cfg = Leer-Env $EnvPath

# La clave de los robots para /robot/* se genera una vez y se guarda en .env
if (-not $cfg.ROBOT_API_CLAVE) {
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $cfg.ROBOT_API_CLAVE = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Add-Content -Path $EnvPath -Value "`nROBOT_API_CLAVE=$($cfg.ROBOT_API_CLAVE)" -Encoding utf8
    Write-Host 'ROBOT_API_CLAVE generada y agregada a .env'
}

# Solo se piden los scopes que usa este script
$scopes = 'OR.Folders OR.Queues OR.Assets OR.Tasks'
$tok = Invoke-RestMethod -Method Post -Uri "$($cfg.UIPATH_URL)/identity_/connect/token" -Body @{
    grant_type    = 'client_credentials'
    client_id     = $cfg.UIPATH_CLIENT_ID
    client_secret = $cfg.UIPATH_CLIENT_SECRET
    scope         = $scopes
}
$base = "$($cfg.UIPATH_URL)/$($cfg.UIPATH_ORG)/$($cfg.UIPATH_TENANT)/orchestrator_"
$carpetaNombre = if ($cfg.UIPATH_FOLDER) { $cfg.UIPATH_FOLDER } else { 'Shared' }

$h = @{ Authorization = "Bearer $($tok.access_token)" }
$carpeta = (Invoke-RestMethod "$base/odata/Folders?`$filter=DisplayName eq '$carpetaNombre'" -Headers $h).value | Select-Object -First 1
if (-not $carpeta) { throw "No existe la carpeta '$carpetaNombre' en Orchestrator." }
$h['X-UIPATH-OrganizationUnitId'] = "$($carpeta.Id)"
Write-Host "Carpeta: $($carpeta.DisplayName) ($($carpeta.Id))"

function Enviar($metodo, $url, $cuerpo) {
    $json = $cuerpo | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Method $metodo -Uri $url -Headers $h -ContentType 'application/json; charset=utf-8' `
        -Body ([Text.Encoding]::UTF8.GetBytes($json))
}

# ---------- Colas ----------
$colas = @(
    @{ Name = 'VC_Concursos';      MaxNumberOfRetries = 2; Description = 'NOG por capturar o revisar (NUEVO, REVISION, MANUAL). Ejecutor: VC.Concurso' }
    @{ Name = 'VC_Analisis';       MaxNumberOfRetries = 1; Description = 'Concursos por analizar con IA (NUEVO, ADENDA). Ejecutor: VC.Analisis' }
    @{ Name = 'VC_Notificaciones'; MaxNumberOfRetries = 3; Description = 'Alertas inmediatas por cambios en concursos seguidos. Ejecutor: VC.Notificador' }
)

$existentes = (Invoke-RestMethod "$base/odata/QueueDefinitions" -Headers $h).value
foreach ($c in $colas) {
    $actual = $existentes | Where-Object Name -eq $c.Name
    $cuerpo = @{
        Name                     = $c.Name
        Description              = $c.Description
        MaxNumberOfRetries       = $c.MaxNumberOfRetries
        AcceptAutomaticallyRetry = $true
        EnforceUniqueReference   = $false
    }
    if (-not $actual) {
        Enviar Post "$base/odata/QueueDefinitions" $cuerpo | Out-Null
        Write-Host "Cola creada: $($c.Name)"
    } elseif ($Actualizar) {
        $cuerpo.Id = $actual.Id
        Enviar Put "$base/odata/QueueDefinitions($($actual.Id))" $cuerpo | Out-Null
        Write-Host "Cola actualizada: $($c.Name)"
    } else {
        Write-Host "Cola existente: $($c.Name)"
    }
}

# ---------- Catálogo de Action Center ----------
# VC.Analisis crea las tareas de validación de fichas en este catálogo (docs/08-diseno-del-bot.md, 8.5)
$catalogo = 'VC_ValidacionFichas'
$catalogos = (Invoke-RestMethod "$base/odata/TaskCatalogs" -Headers $h).value
if ($catalogos | Where-Object Name -eq $catalogo) {
    Write-Host "Catálogo existente: $catalogo"
} else {
    # POST /odata/TaskCatalogs responde 405: la creación es una acción OData
    Enviar Post "$base/odata/TaskCatalogs/UiPath.Server.Configuration.OData.CreateTaskCatalog" @{ Name = $catalogo; Description = 'Validación humana de fichas de concursos (Vigía de Contrataciones)' } | Out-Null
    Write-Host "Catálogo creado: $catalogo"
}

# ---------- Assets ----------
$assets = @(
    @{ Name = 'VC_ApiUrl';             Tipo = 'Text';    Valor = $(if ($cfg.VC_API_URL) { $cfg.VC_API_URL } else { 'http://localhost:3000' }); Description = 'URL base de la API' }
    @{ Name = 'VC_ApiClave';           Tipo = 'Credential'; Usuario = 'robot'; Secreto = $cfg.ROBOT_API_CLAVE; Description = 'Clave de robot para /robot/*' }
    @{ Name = 'VC_IA';                 Tipo = 'Credential'; Usuario = 'anthropic'; Secreto = $cfg.ANTHROPIC_API_KEY; Description = 'Clave de la API de Claude' }
    @{ Name = 'VC_IA_Modelo';          Tipo = 'Text';    Valor = 'claude-opus-5-5'; Description = 'Modelo de Claude para la extraccion' }
    @{ Name = 'VC_IA_Esfuerzo';        Tipo = 'Text';    Valor = 'high'; Description = 'output_config.effort de Claude' }
    @{ Name = 'VC_PausaMinMs';         Tipo = 'Integer'; Valor = 2000; Description = 'Pausa minima entre acciones en Guatecompras' }
    @{ Name = 'VC_PausaMaxMs';         Tipo = 'Integer'; Valor = 3000; Description = 'Pausa maxima entre acciones en Guatecompras' }
    @{ Name = 'VC_CarpetaTrabajo';     Tipo = 'Text';    Valor = 'C:\Vigia\Trabajo'; Description = 'Descargas temporales y evidencia del robot' }
    @{ Name = 'VC_CarpetaExpedientes'; Tipo = 'Text';    Valor = 'C:\Vigia\Expedientes'; Description = 'Carpeta base de los expedientes de oferta' }
    @{ Name = 'VC_SMTP_Servidor';      Tipo = 'Text';    Valor = $(if ($cfg.SMTP_HOST) { "$($cfg.SMTP_HOST):$($cfg.SMTP_PORT)" } else { '' }); Description = 'host:puerto SMTP' }
    @{ Name = 'VC_SMTP';               Tipo = 'Credential'; Usuario = $cfg.SMTP_USER; Secreto = $cfg.SMTP_PASS; Description = 'Cuenta de correo del proyecto (SMTP e IMAP)' }
    @{ Name = 'VC_IMAP_Servidor';      Tipo = 'Text';    Valor = $(if ($cfg.IMAP_HOST) { "$($cfg.IMAP_HOST):$($cfg.IMAP_PORT)" } else { '' }); Description = 'host:puerto IMAP del buzon del boletin' }
    @{ Name = 'VC_RevisorFichas';      Tipo = 'Text';    Valor = $cfg.REVISOR_FICHAS; Description = 'Usuario de Orchestrator (correo) al que se asignan las tareas de VC_ValidacionFichas; vacio = sin asignar' }
    @{ Name = 'VC_CorreoAdmin';        Tipo = 'Text';    Valor = $cfg.CORREO_ADMIN; Description = 'Destinatario de alertas de los robots' }
    @{ Name = 'VC_TelegramToken';      Tipo = 'Credential'; Usuario = 'telegram'; Secreto = $cfg.TELEGRAM_BOT_TOKEN; Description = 'Token del bot de Telegram' }
)

$existentes = (Invoke-RestMethod "$base/odata/Assets" -Headers $h).value
foreach ($a in $assets) {
    if ($a.Tipo -eq 'Credential' -and -not $a.Secreto) { Write-Host "Omitido (falta el secreto en .env): $($a.Name)"; continue }
    if ($a.Tipo -eq 'Text' -and -not $a.Valor)        { Write-Host "Omitido (falta el valor en .env): $($a.Name)"; continue }

    $cuerpo = @{ Name = $a.Name; Description = $a.Description; ValueScope = 'Global'; ValueType = $a.Tipo }
    switch ($a.Tipo) {
        'Text'       { $cuerpo.StringValue = $a.Valor }
        'Integer'    { $cuerpo.IntValue = $a.Valor }
        'Credential' { $cuerpo.CredentialUsername = $a.Usuario; $cuerpo.CredentialPassword = $a.Secreto }
    }

    $actual = $existentes | Where-Object Name -eq $a.Name
    if (-not $actual) {
        Enviar Post "$base/odata/Assets" $cuerpo | Out-Null
        Write-Host "Asset creado: $($a.Name)"
    } elseif ($Actualizar) {
        $cuerpo.Id = $actual.Id
        Enviar Put "$base/odata/Assets($($actual.Id))" $cuerpo | Out-Null
        Write-Host "Asset actualizado: $($a.Name)"
    } else {
        Write-Host "Asset existente: $($a.Name)"
    }
}
