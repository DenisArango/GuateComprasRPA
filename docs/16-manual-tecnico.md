# 16 · Manual técnico: instalación y operación

Este manual es para quien instala, opera o mantiene Vigía de Contrataciones. El diseño está en [05 · Arquitectura](05-arquitectura.md) y [08 · Diseño de los robots](08-diseno-del-bot.md). El uso diario está en [15 · Manual de usuario](15-manual-de-usuario.md).

## 16.1 Componentes y dónde corren

| Componente | Tecnología | Dónde corre | Puerto |
|---|---|---|---|
| Robots `VC.*` | UiPath Studio 2026.0, Robot 26.0 (.NET 10), REFramework, coded workflows en C# | PC con UiPath Assistant conectada a Automation Cloud | — |
| Orchestrator, colas, assets, Action Center | UiPath Automation Cloud (Community) | Nube: org `dengouipath`, tenant `DefaultTenant`, carpeta `Shared` | — |
| API | Node 24, Fastify 5, Prisma 7, Zod 4 | PC o servidor | 3000 |
| Base de datos | PostgreSQL 16 + pgvector (Docker) | PC o servidor | 5433 |
| Dashboard | Angular 22 + Angular Material | Navegador (en desarrollo, `ng serve`) | 4200 |
| IA | Claude `claude-opus-5-5` (SDK oficial de C#) | Llamada desde el coded workflow de `VC.Analisis` | — |
| Avisos | SMTP (Gmail) y Bot API de Telegram | Desde `VC.Notificador` | — |
| Datos abiertos | OCDS de Guatecompras desde el OCP Data Registry | Descarga de la API, pedida por `VC.Datos` | — |

## 16.2 Requisitos

- Windows 10/11 con UiPath Studio y UiPath Assistant 2026.0 (Robot `26.0.204`), Edge con la extensión de UiPath.
- Docker Desktop.
- Node 24 (`api/.nvmrc` y `web/.nvmrc`). Con nvm para Windows: `nvm install 24.18.0`. Si la versión global es otra, anteponer `C:\nvm\nvm\v24.18.0` al `PATH`.
- .NET SDK 10 (pruebas de los coded workflows con `dotnet test`).
- Cuenta de UiPath Automation Cloud con una **External Application** (confidencial) con los alcances `OR.Folders OR.Queues OR.Assets OR.Tasks OR.Jobs OR.Execution OR.Machines OR.Robots`.
- Cuenta de correo del proyecto (Gmail con **contraseña de aplicación**) suscrita al *Boletín diario de concursos* de Guatecompras.
- Clave de la API de Anthropic; bot de Telegram creado con @BotFather.

## 16.3 Configuración (`infra/.env`)

Copie `infra/.env.example` a `infra/.env` y complete los valores. Los secretos viven **solo** en `.env` y en los assets de Orchestrator.

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL (puerto 5433) |
| `JWT_SECRET` | Firma de las sesiones del dashboard (sin él, las sesiones se pierden al reiniciar la API) |
| `ROBOT_API_CLAVE` | Clave de los robots para `/robot/*`; la genera `configurar-orchestrator.ps1` si falta |
| `ANTHROPIC_API_KEY`, `IA_PRESUPUESTO_DIARIO_USD`, `FICHA_UMBRAL_CONFIANZA` | IA, tope de gasto diario (2 USD) y umbral de revisión humana (0.7) |
| `UIPATH_URL`, `UIPATH_ORG`, `UIPATH_TENANT`, `UIPATH_CLIENT_ID`, `UIPATH_CLIENT_SECRET`, `UIPATH_FOLDER` | External Application. **Si un valor contiene `#`, escríbalo entre comillas dobles**: sin ellas, la librería de Node lo toma como comentario. |
| `SMTP_*`, `IMAP_*` | Cuenta de correo del proyecto (envío de avisos y lectura del boletín) |
| `WEB_URL`, `CORREO_ADMIN` | Enlaces de los correos y destinatario de alertas de los robots |
| `TELEGRAM_BOT_TOKEN` | Bot de Telegram |
| `REVISOR_FICHAS` | Usuario de Orchestrator (correo) al que se asignan las tareas de validación |

## 16.4 Instalación paso a paso

```powershell
# 1. Base de datos
cd infra
docker compose up -d                       # PostgreSQL 16 + pgvector en el puerto 5433

# 2. API
cd ..\api
$env:PATH = "C:\nvm\nvm\v24.18.0;$env:PATH"
npm ci
npm run db:generate
npx prisma migrate deploy                  # crea las tablas
npm run db:seed                            # usuario admin@vigia.local y perfil de prueba (muestra la contraseña)
npm run ocds:cargar -- 2025 2026           # histórico OCDS + banderas rojas (~674 900 procesos; tarda)
npm start                                  # http://localhost:3000/salud

# 3. Dashboard
cd ..\web
npm ci
npm start                                  # http://localhost:4200 (proxy a la API en proxy.conf.json)

# 4. Orchestrator (una vez)
cd ..
.\infra\orchestrator\configurar-orchestrator.ps1   # colas, catálogo de Action Center y assets
.\infra\orchestrator\programar-robots.ps1          # publica los paquetes, crea los procesos y los disparadores
```

### Robot desatendido en la PC

1. **Orchestrator → Máquinas:** la máquina de la PC (`… workspace machine`) con **1 Unattended runtime**, asignada a la carpeta `Shared`.
2. **Tenant → Access:** el usuario con **Robot setup → Unattended** y las credenciales de Windows de la PC (`pcale\alejandra yol`).
3. **Carpeta `Shared` → Folder management:** el usuario con el rol **Folder Administrator** (incluye los permisos de Action Center que necesita `RecogerRevisiones`).
4. UiPath Assistant conectado con la sesión iniciada. La PC debe quedar **encendida, con la sesión de Windows abierta y sin suspensión**.
5. **Edge:** Configuración → Cookies y permisos del sitio → Documentos PDF → **Descargar siempre los archivos PDF**.

## 16.5 Procesos, disparadores y colas

| Proceso | Disparador | Entrada | Salida |
|---|---|---|---|
| `VC.Captura` | Cada hora de 06:00 a 12:00 (termina sin error si el boletín aún no llega) | Correo del boletín (IMAP) | `POST /robot/boletin` → candidatos en `VC_Concursos` |
| `VC.Concurso` | Cada hora de 07:00 a 21:00 (sesión abierta) o desde Assistant | `VC_Concursos` (tandas de 5) | Detalle y documentos en la API → `VC_Analisis` |
| `VC.Analisis` | Cola `VC_Analisis` | Documentos del concurso | Ficha con Claude; si la confianza < 0.7, tarea en Action Center; si no, `VC_Notificaciones` |
| `VC.Analisis.RecogerRevisiones` | Cada 30 minutos | Tareas completadas de `VC_ValidacionFichas` | Ficha `HUMANO` → `VC_Notificaciones` |
| `VC.Notificador` | 07:00 (resumen) y cola `VC_Notificaciones` (avisos) | API | Correo y Telegram; registro en la API |
| `VC.Datos` | Domingo 02:30 | — | Carga OCDS y recálculo de banderas rojas en la API |
| `VC.Expediente` | Al marcar **Participaré** (la API lo inicia) o desde Assistant | NOG | Carpeta `Expediente_{NOG}` y registro en la API |

**Assets** (carpeta `Shared`): `VC_ApiUrl`, `VC_ApiClave`, `VC_IA`, `VC_IA_Modelo`, `VC_IA_Esfuerzo`, `VC_PausaMinMs`, `VC_PausaMaxMs`, `VC_CarpetaTrabajo`, `VC_CarpetaExpedientes`, `VC_SMTP_Servidor`, `VC_SMTP`, `VC_IMAP_Servidor`, `VC_CorreoAdmin`, `VC_RevisorFichas`, `VC_TelegramToken`.

## 16.6 Publicar una versión nueva de un robot

1. Cambie `projectVersion` en `rpa/VC.*/project.json`.
2. Revise el XAML con el analizador: `UiPath.Studio.CommandLine.exe analyze-file -p <archivo.xaml>` (el `analyze` del proyecto completo se cuelga).
3. Ejecute `.\infra\orchestrator\programar-robots.ps1 -SinDisparadores`: empaqueta, sube y actualiza el proceso a la versión nueva.

## 16.7 Pruebas

| Qué | Comando | Resultado al 31/10/2026 |
|---|---|---|
| API (dominio y rutas, contra la BD de Docker) | `cd api; npm test` | 76 pruebas, todas pasan |
| Parser del boletín | `cd rpa/tests/VC.Captura.Tests; dotnet test` | 16 pasan |
| Lectura del detalle del portal | `cd rpa/tests/VC.Concurso.Tests; dotnet test` | 30 pasan |
| Extracción con IA (con `VIGIA_PRUEBA_IA=1` llama a Claude) | `cd rpa/tests/VC.Analisis.Tests; dotnet test` | Pasan |
| Plantillas de correo y Telegram | `cd rpa/tests/VC.Notificador.Tests; dotnet test` | 9 pasan |
| Expediente (checklist, Excel y Word) | `cd rpa/tests/VC.Expediente.Tests; dotnet test` | 11 pasan |
| Dashboard | `cd web; npx ng build` | Compila sin errores |

## 16.8 Monitoreo

- **Dashboard → Ejecuciones** (administrador): tasa de éxito, bitácora y costo de IA, sincronizados desde los trabajos de Orchestrator.
- **Orchestrator → Monitoring / Jobs / Queues:** detalle de cada trabajo y de cada elemento de cola.
- **Registros del robot:** `%LOCALAPPDATA%\UiPath\Logs\<fecha>_Execution.log`.
- **Correo al administrador** (`VC_CorreoAdmin`) cuando falla la carga OCDS o se agota el presupuesto de IA.

## 16.9 Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| La API responde `ECONNREFUSED` o el dashboard no carga datos | Docker Desktop apagado | Encender Docker Desktop y reiniciar la API |
| La sesión del dashboard se pierde al reiniciar la API | Falta `JWT_SECRET` | Agregarlo a `infra/.env` |
| Los disparadores no crean trabajos | No hay runtime desatendido en la carpeta | Ver 16.4, "Robot desatendido en la PC" |
| `RecogerRevisiones` falla con *No folders exist with action admin permissions* | El usuario del robot no tiene permisos de Action Center en `Shared` | Asignarle el rol **Folder Administrator** en la carpeta |
| La API no obtiene token de Orchestrator (`invalid_client`) | Un `#` en el secreto sin comillas | Escribir el valor entre comillas dobles en `.env` |
| Las descargas de `VC.Concurso` vencen por tiempo | Edge abre el PDF en el visor | Activar "Descargar siempre los archivos PDF" en Edge |
| `VC.Concurso` se detiene con un aviso | Guatecompras pidió verificación | Resolverla en Edge y presionar Aceptar. **Nunca automatizarla.** |
| Fichas con confianza 0 | El concurso no publica bases con requisitos (compras directas) | Es correcto: van a revisión humana |
| Faltan documentos de la empresa en el expediente | No están en `_DocumentosEmpresa` o el nombre no empieza con el código | Ver [15.6](15-manual-de-usuario.md#156-expediente-de-oferta) |
| Al editar archivos en PowerShell se dañan las tildes | `Get-Content`/`Set-Content` sin codificación | Usar `-Encoding utf8` |

## 16.10 Respaldo

- Base de datos: `docker exec vigia-db-1 pg_dump -U vigia vigia > respaldo.sql`.
- Documentos descargados: carpeta `storage/` (excluida de Git).
- Expedientes: `C:\Vigia\Expedientes`.
- Configuración de Orchestrator: se puede recrear completa con los dos scripts de `infra/orchestrator/`.
