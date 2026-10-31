# Contexto del proyecto para Claude

## Qué es

**Vigía de Contrataciones**: proyecto universitario (Ingeniería en Sistemas, UMG) de RPA + IA. Un robot captura a diario concursos y documentos de Guatecompras, una IA extrae una ficha estructurada de las bases, y el sistema notifica a MiPymes proveedoras del Estado las oportunidades compatibles, con documentos faltantes y referencias de precio (datos abiertos OCDS). Módulo complementario: banderas rojas de riesgo sobre el histórico OCDS.

La documentación completa está en `docs/`. Antes de implementar algo, leer el documento relevante:
- Requerimientos y reglas de negocio: `docs/03-requerimientos.md`
- Casos de uso: `docs/04-casos-de-uso.md`
- Arquitectura y estructura del monorepo: `docs/05-arquitectura.md`
- Modelo de datos: `docs/07-modelo-de-datos.md`
- Robot: `docs/08-diseno-del-bot.md` · IA: `docs/09-ia-extraccion.md` · Riesgos: `docs/10-banderas-rojas.md`
- Plan y fases: `docs/11-plan-de-proyecto.md`

## Stack

**UiPath es el centro** (`docs/adr/0004-uipath-como-centro.md`): Studio 2026.0, Orchestrator en Automation Cloud, plan **Community** (org `dengouipath`, tenant `DefaultTenant`, carpeta `Shared`, 1 robot desatendido; catálogo de Action Center `VC_ValidacionFichas`), REFramework, colas, Action Center. Robots en `rpa/` (`VC.Comun`, `VC.Captura`, `VC.Concurso`, `VC.Analisis`, `VC.Notificador`, `VC.Datos`, `VC.Expediente`). Flujos en XAML (estructura, portal, actividades nativas) + coded workflows en C# (transformaciones). Robot CLI: `C:\Program Files\UiPathPlatform\Robot\26.0.204-cloud.25540\UiRobot.exe` (`execute`, `pack`).

IA: Claude (`claude-opus-5-5`, salida estructurada, SDK oficial de C# en el coded workflow `ExtraerFicha`), ver `docs/adr/0005-ia-claude.md`.

Resto en TypeScript. API: Node + Fastify + Prisma. BD: PostgreSQL 16 + pgvector. Validación: Zod. Frontend: Angular + Angular Material. ETL OCDS: Node. Infra: Docker Compose. Pruebas: casos de prueba de UiPath, Vitest y Playwright Test (solo dashboard).

## Reglas del proyecto

- Cada proceso UiPath tiene una sola responsabilidad y se conecta con los demás por colas de Orchestrator. Solo `VC.Captura` (boletín diario, desatendido) y `VC.Concurso` (detalle, **atendido**) acceden a Guatecompras. El portal usa Cloudflare Turnstile: **nunca evadir ni resolver el captcha automáticamente** (ADR-0006).
- Los robots **no acceden a la base de datos**: todo pasa por la API (`/robot/*`). Las reglas de dominio (Zod, compatibilidad, presupuesto de IA, riesgos) viven en la API.
- Todos los selectores del portal van en el Object Repository de la biblioteca `VC.Comun`.
- Programación, colas, assets y credenciales de los robots se administran en Orchestrator. Acceso por API con la External Application cuyos datos están en `infra/.env`.
- Uso responsable del portal: 1 navegador, pausas de 2–3 s, horario nocturno, solo información pública.
- Datos históricos desde OCDS, nunca con el robot (`docs/adr/0001-rpa-y-datos-abiertos.md`).
- Umbrales de modalidad y pesos de puntajes parametrizados, no codificados.
- Secretos solo en `.env` (existe `infra/.env.example`) o en assets de Orchestrator; nunca en `Config.json` ni en los flujos.
- Indicadores de riesgo siempre con el aviso de que son señales, no acusaciones.
- Al cambiar una decisión de diseño, actualizar el documento correspondiente en `docs/` o crear un ADR.

## Sobre el autor

Desarrollador full-stack con experiencia en TypeScript, Node, Fastify, Prisma y Angular. Conoce poco de HTML y CSS: en esa parte, solo comentarios puntuales, sin explicar cada regla. Prefiere respuestas directas y concisas, en español.

## Estado actual

- Fase 0 (documentación): completa y actualizada a UiPath (2026-10-30). Conexión a Orchestrator por API verificada.
- Siguiente: configurar Orchestrator (colas, assets) y crear `VC.Comun`; en paralelo, infraestructura base (Docker Compose, PostgreSQL, Prisma).
- Decidido: el catedrático acepta coded workflows; IA = Claude `claude-opus-5-5` (ADR-0005, clave en `infra/.env` como `ANTHROPIC_API_KEY`, verificada); Gantt del 03/10 al 30/10/2026.
- Robots: `VC.Captura` 0.1.2 lee el boletín del buzón `proyectorpagt@gmail.com` (IMAP, Gmail con contraseña de aplicación; suscrito al Boletín diario de concursos el 31/10/2026; llega de `boletines@guatecompras.gt` hacia la 01:15 con el HTML en el cuerpo; probado de punta a punta el 31/10: 850 concursos, 50 candidatos encolados) o de un archivo (`in_RutaBoletin`); probado contra Orchestrator (34 elementos en `VC_Concursos`). Pruebas del parser: `dotnet test` en `rpa/tests/VC.Captura.Tests`. Publicar: `UiPath.Studio.CommandLine.exe publish -p <project.json> -g Custom -f <carpeta> -v <versión>`; ejecutar: `UiRobot.exe execute --file <nupkg> --folder Shared --input '<json>'`. `analyze` de proyecto completo se cuelga; usar `analyze-file` por XAML.
- API (`api/`): Node 24 (`.nvmrc`; la versión global de nvm es 20.11, anteponer `C:
vm
vm24.18.0` al PATH), Prisma 7 con `prisma.config.ts` y adaptador `@prisma/adapter-pg`, Fastify 5, Zod 4, Vitest 5, TypeScript 7. BD en Docker en el puerto **5433** (el 5432 es un PostgreSQL 18 local de Windows). `POST /robot/boletin` probado de punta a punta con `VC.Captura` en modo API.
- Al editar archivos desde PowerShell 5.1 no usar `Get-Content`/`Set-Content` sin `-Encoding utf8`: dañan las tildes.
- `VC.Concurso` 0.2.0 publicado (atendido, Edge): Object Repository capturado por el autor (`Guatecompras > DetalleConcurso`, 8 elementos); `Portal/*.xaml` generados con referencias al repositorio; la pestaña Historial trae los documentos con enlace directo y fecha. Las pestañas del detalle cargan por AJAX (sin recargar ni cambiar la URL). Pendiente: prueba en vivo con el autor y corregir en el repositorio el selector de las pestañas (usar innertext en vez de idx).
- `VC.Analisis` 0.1.0 publicado con `dotNetVersion: net10.0` (el SDK de Anthropic necesita System.Text.Json 10; el ejecutor del robot ya es .NET 10). La extracción con Claude se probó de punta a punta con `dotnet test` (VIGIA_PRUEBA_IA=1) contra bases sintéticas (`rpa/fixtures/bases/`). Concursos sintéticos de prueba en la API: NOG 99300001 y 99300002 (PDF en `rpa/fixtures/bases/bases-sinteticas.pdf`, generado con Edge sin interfaz).
- 30/10/2026: la prueba de Automation Cloud expiró; se creó una organización Community nueva (`dengouipath`) y se reconfiguró con `infra/orchestrator/configurar-orchestrator.ps1`. `VC.Analisis` probado en el robot real: ficha con confianza 1.0 (NOG 99300001) y, con datos del portal distintos, tarea de Action Center creada (NOG 99300002). Ciclo completo de Action Center probado con `VC.Analisis` 0.1.5: tarea aprobada → `RecogerRevisiones.xaml` guarda la ficha como HUMANO y encola FICHA; una segunda ejecución no la repite. Detalles de formularios en `docs/08-diseno-del-bot.md` (8.5).
- Dashboard (`web/`, Angular 22, Node 24): ingresar, panel, oportunidades, detalle de concurso y perfil, contra `/app/*` de la API; diseño en `web/DESIGN.md`, revisado con Playwright CLI a 1440/768/390. Usuario de desarrollo: admin@vigia.local (contraseña la del seed). Si la API da ECONNREFUSED, Docker Desktop está apagado. Incluye historial OCDS (`/historial`, `/proveedores/:id`), banderas rojas (`/riesgos`) y compras anteriores parecidas en el detalle del concurso.
- 31/10/2026: `VC.Notificador` 0.1.1 (resumen diario y avisos de cola; correo real probado; destinatarios = usuarios activos del perfil, el admin no recibe). `VC.Datos` 0.1.0 + carga OCDS en la API desde el OCP Data Registry (ADR-0007; `npm run ocds:cargar`; 674,900 procesos 2025–2026 en `storage/ocds/`). Banderas rojas IR-01, 02, 03, 04, 05 e IR-08 (IR-06 no calculable); IR-04 se recalibró a "mismo día, unidad, proveedor y producto" (docs/10). Pruebas de la API: corren en serie (`fileParallelism: false`) porque comparten la BD.
- Disparadores y procesos en Orchestrator: `infra/orchestrator/programar-robots.ps1` (sube paquetes, crea procesos y disparadores; lo ejecuta el autor).
- 31/10/2026 (tarde): robot desatendido funcionando (máquina `workspace machine` con 1 runtime desatendido, asignada a `Shared`; usuario con Windows `pcalelejandra yol`). `VC.Concurso` 0.2.1 (enlaces relativos del historial → absolutos) descargó 17 documentos reales; `VC.Analisis` 0.1.6 asigna la tarea de Action Center a `VC_RevisorFichas`; confianza: citas a páginas escaneadas y fecha ausente en las bases se excluyen (docs/09). `VC.Expediente` 0.1.0 publicado (API `/robot/expedientes`, modelo `Expediente`); falta la prueba del autor desde Assistant.
- Telegram (RF-NOT-02): bot `@vigiacontratacionesbot` (token en `.env` y asset `VC_TelegramToken`). Se vincula por perfil desde el dashboard (Perfil → Avisos por Telegram); `VC.Notificador` 0.1.2 envía resumen y avisos a los chats del perfil.
- 31/10/2026 (cierre): CU-12 (dashboard → Ejecuciones, la API sincroniza trabajos de Orchestrator en `ejecucion_robot`) y CU-13 (NOG manual a `VC_Concursos`). ADR-0008: `VC.Concurso` corre desatendido en la sesión abierta (probado: 5 concursos) con disparador cada hora 07–21 (falta crearlo: `programar-robots.ps1` sin `-SinDisparadores`); `VC.Expediente` 0.2.1 lo inicia la API al marcar Participaré (`in_Desatendido`). Docs finales: 15 manual de usuario, 16 manual técnico, 17 informe de resultados (piloto **simulado**, rotulado como tal), 18 guion de presentación. `UIPATH_CLIENT_SECRET` en `.env` va entre comillas (tiene `#`). API: 76 pruebas.
- Pendiente: selectores de VC.Concurso (sesión guiada en Studio); verificar licencia (vencimiento) y licencia atendida (R-16); conseguir empresa piloto.
