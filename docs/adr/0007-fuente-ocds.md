# ADR-0007 · Datos OCDS desde el OCP Data Registry

**Estado:** Aceptada · **Fecha:** 2026-10-31

## Contexto

ADR-0001 decidió usar los datos abiertos OCDS para todo lo histórico. Al implementar la carga (CU-11) se encontró lo siguiente:

- **El portal `ocds.guatecompras.gt` está detrás de Cloudflare.** Responde 403 a clientes que no son navegador, igual que el boletín (ADR-0006), y no se evade.
- **Open Contracting Partnership republica los mismos datos.** Su *Data Registry* (`data.open-contracting.org`, publicación 142, "Guatemala: Ministerio de Finanzas Públicas") ofrece:
  - registros compilados por año en JSONL comprimido, de 2020 a hoy;
  - recolección diaria desde el portal oficial y licencia CC BY 4.0.
- **Cada archivo anual pesa unos 300 MB comprimido** (~340 mil procesos). Un año agrupa los registros *actualizados* ese año, no los publicados.
- **Faltan dos datos que pedían los indicadores:**
  - el monto estimado (`tender.value`);
  - la fecha de inscripción del proveedor en el RGAE.

## Decisión

- **Fuente:** la API descarga los archivos anuales del OCP Data Registry. Por defecto carga el año en curso y el anterior; el del año en curso se vuelve a descargar si tiene más de 6 días.
- **Carga:** se leen en flujo (gunzip, línea por línea) y se guardan por lotes con `jsonb_populate_recordset`, actualizando por `ocid`. Solo se guarda lo que usan el historial y los riesgos; el registro completo queda en el archivo, en `storage/ocds/`.
- **Coordinación:** `VC.Datos` inicia la carga y la vigila. La descarga y el cálculo los hace la API, porque procesar cientos de MB no es trabajo de un robot de interfaz.
- **Indicadores** (detalle en [10 · Banderas rojas](../10-banderas-rojas.md)):
  - IR-06 no se calcula, porque OCDS de Guatecompras no trae el monto estimado; lo reemplaza IR-08, que sí es calculable.
  - IR-05 se aproxima con el primer contrato del proveedor en los datos.

## Consecuencias

- ✅ Datos completos y oficiales sin evadir Cloudflare.
- ✅ La licencia CC BY 4.0 permite usarlos y mostrarlos, citando la fuente; el dashboard la muestra.
- ⚠ Depende de un tercero (OCP). Su frecuencia de recolección es diaria según el registro, aunque la última fecha que muestra es de octubre de 2026.
- ⚠ La carga de dos años tarda unos 15 minutos y ocupa algunos GB en la base; se programa semanal y de noche.
