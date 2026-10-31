# ADR-0005 · Claude como servicio de IA

**Estado:** Aceptada · **Fecha:** 2026-10-30

## Contexto

`VC.Analisis` necesita un modelo de lenguaje que convierta el texto de las bases (30–80 páginas en español) en una ficha JSON que cumpla el esquema de [09 · IA](../09-ia-extraccion.md), y que resuma las adendas. La llamada sale de un coded workflow en C# dentro de UiPath.

## Decisión

1. **Proveedor:** Anthropic, API de Claude (`POST /v1/messages`).
2. **Modelo:** `claude-opus-5-5`, configurable con el asset `VC_IA_Modelo`. Esfuerzo (`output_config.effort`) inicial **`high`**, configurable; se ajusta con la evaluación de exactitud de [13.4](../13-plan-de-pruebas.md#134-evaluación-de-la-extracción-con-ia).
3. **Salida estructurada:** `output_config.format` con el **JSON Schema generado desde el esquema Zod** de la ficha. La API lo publica en `GET /robot/esquemas/ficha`, así el robot y la API usan el mismo esquema sin copiarlo. La API vuelve a validar con Zod antes de guardar.
4. **Cliente:** SDK oficial de Anthropic para C# (paquete NuGet `Anthropic`) en el coded workflow `ExtraerFicha` de `VC.Comun`.
5. **Respaldo ante rechazos:** se activa el respaldo del lado del servidor (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) y el robot revisa `stop_reason` antes de leer la respuesta. Un `refusal` se trata como Business Rule Exception: el concurso pasa a validación humana.
6. **Clave:** asset de credencial `VC_IA` en Orchestrator. En `infra/.env` solo para pruebas locales.
7. **Similitud semántica:** la API de Claude no ofrece embeddings. Los embeddings del perfil y de los ítems los calcula la API con un modelo local multilingüe (sin costo por llamada) y se guardan en `pgvector`.

## Costo estimado

Precio de `claude-opus-5-5`: USD 4 por millón de tokens de entrada y USD 20 por millón de salida.

| Supuesto | Valor |
|---|---|
| Contexto por ficha (solo secciones relevantes) | ~15 000 tokens |
| Salida por ficha (incluye razonamiento) | ~4 000 tokens |
| Costo por ficha | ~USD 0.14 |
| Fichas por mes en el piloto (1–2 categorías) | ~100 |
| **Costo mensual estimado** | **~USD 14** |

El presupuesto diario (`IA_PRESUPUESTO_DIARIO_USD`) limita el gasto real. Si se quiere bajar el costo, las opciones son bajar el esfuerzo o cambiar a `claude-sonnet-5-5` (USD 2 / 10) o `claude-haiku-5-5` (USD 0.10 / 0.50), **solo si la evaluación de 13.4 muestra que la exactitud se mantiene ≥ 85 %**.

## Consecuencias

- ✅ Ventana de contexto de 1 M de tokens: las bases completas caben aunque la segmentación falle.
- ✅ La salida estructurada reduce los reintentos por JSON inválido.
- ✅ Claude puede leer PDF directamente, incluidas páginas escaneadas. Queda como alternativa al OCR si la calidad de `Read PDF With OCR` es baja (R-05).
- ⚠ Costo por uso; se controla con el presupuesto diario y la métrica de costo por ficha.
- **Documentos escaneados (30/10/2026):** en lugar de `Read PDF With OCR` (requiere incrustar un motor de OCR), el PDF escaneado se envía a Claude como documento. Las páginas con texto digital se leen con `Read PDF Text`, una por una, para conservar la referencia de página.
- **Requisito técnico (30/10/2026):** el SDK de C# depende de `System.Text.Json` 10, así que `VC.Analisis` usa `"dotNetVersion": "net10.0"` en `project.json`. El ejecutor del Robot 26.0 ya corre sobre .NET 10.
- **Esquema (30/10/2026):** la salida estructurada no acepta `minimum`, `maximum`, `exclusiveMinimum`, `minLength`, etc. La API los quita del esquema que publica para la IA; la validación completa sigue en Zod.
- **Prueba real:** con bases sintéticas de 4 páginas, 3 421 tokens de entrada y 1 510 de salida (≈ USD 0,04), ficha válida en 11 s, con el requisito de marca única marcado como posiblemente restrictivo.
- ⚠ El texto de las bases sale a un servicio externo. Es información pública, así que no hay problema de confidencialidad. Los datos de la empresa **no** se envían a la IA: la comparación con el perfil la hace la API.
