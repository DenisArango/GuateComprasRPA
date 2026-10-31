# rpa

Proyectos UiPath del sistema. Diseño completo en [docs/08-diseno-del-bot.md](../docs/08-diseno-del-bot.md) y decisión en [ADR-0004](../docs/adr/0004-uipath-como-centro.md).

| Proyecto | Tipo | Estado |
|---|---|---|
| `VC.Comun` | Biblioteca | Pendiente |
| `VC.Captura` | Despachador (segundo plano) | 0.1.2: lee el boletín del buzón del proyecto (`Get IMAP Mail Messages` + `GuardarBoletinCorreo.cs`) o de un archivo, preselecciona con la API y encola. Si el boletín aún no llega, termina sin error. |
| `VC.Concurso` | Ejecutor REFramework con interfaz (Edge): disparador cada hora en la sesión abierta o desde Assistant (ADR-0008) | 0.2.1: Object Repository `Guatecompras > DetalleConcurso` (capturado en Studio). `Portal/AbrirDetalle` espera a la persona si aparece la verificación; `LeerDetalle` lee el HTML de los datos generales y de la pestaña Historial (que trae cada documento con su enlace) y lo interpreta `DetallePortal.cs` (pruebas con páginas reales en `rpa/fixtures/detalle`); `DescargarDocumentos` baja solo los nuevos por su enlace. Tandas de `MaxTransacciones` (5). Requiere en Edge "Descargar siempre los archivos PDF". |
| `VC.Analisis` | Ejecutor REFramework en segundo plano + Action Center | 0.1.0 publicado (.NET 10): texto de PDF con `Read PDF Text`, ficha con Claude (`AnalizarConIa.cs`), tareas de validación y segundo punto de entrada `RecogerRevisiones.xaml`. 0.1.5 probado en el robot real: ficha ANALIZADO (confianza 1.0); con confianza baja, tarea en Action Center, aprobación humana y `RecogerRevisiones.xaml` guarda la ficha como HUMANO (idempotente). |
| `VC.Notificador` | Proceso (segundo plano) | 0.1.1: `in_Modo = RESUMEN` (diario) arma un correo por perfil con oportunidades nuevas, recordatorios de cierre y documentos por vencer; `AVISOS` atiende `VC_Notificaciones` (FICHA y CAMBIO). Plantilla en C# (`PlantillaCorreo.cs`, con pruebas), envío con `Send SMTP Mail Message`, registro en la API. Probado con correo real. |
| `VC.Datos` | Proceso (segundo plano) | 0.1.0: pide a la API la carga semanal del histórico OCDS y el recálculo de banderas rojas, consulta el avance cada minuto y avisa por correo al administrador si falla. |
| `VC.Expediente` | Atendido o automático al marcar Participaré (`in_Desatendido`) | 0.2.1: con el NOG arma `Expediente_{NOG}` en `VC_CarpetaExpedientes`: bases del concurso, documentos vigentes de la empresa (de `_DocumentosEmpresa`, nombrados por código), `Checklist.xlsx` y borradores Word, todo generado en C# (`ArchivosOffice.cs`, sin Office). Registra el expediente en la API. Pruebas en `tests/VC.Expediente.Tests`. |

`fixtures/` guarda copias HTML del portal para los casos de prueba. `tests/` tiene las pruebas xUnit de la lógica en C# sin dependencias de UiPath (`dotnet test`).

**Requisitos:** UiPath Studio 2026.0 o superior, Robot conectado a Orchestrator (carpeta *Shared*).
