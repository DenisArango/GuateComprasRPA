using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Anthropic;
using Anthropic.Models.Beta.Messages;

namespace VC.Analisis
{
    public class ResultadoIa
    {
        /// <summary>Ficha en JSON (null si el modelo rechazó la solicitud o no terminó).</summary>
        public string Json { get; set; }
        public string Modelo { get; set; }
        public long TokensEntrada { get; set; }
        public long TokensSalida { get; set; }
        public string StopReason { get; set; }
    }

    /// <summary>
    /// Llamada a Claude para extraer la ficha (docs/adr/0005-ia-claude.md). Salida estructurada con el
    /// JSON Schema que publica la API; respaldo del lado del servidor ante rechazos.
    /// Sin dependencias de UiPath para probarlo con dotnet (rpa/tests/VC.Analisis.Tests).
    /// </summary>
    /// <summary>PDF escaneado que Claude lee directamente (alternativa al OCR, ADR-0005).</summary>
    public class DocumentoPdf
    {
        public string Nombre { get; set; }
        public byte[] Contenido { get; set; }
    }

    public static class ClienteClaude
    {
        /// <summary>Instrucciones al modelo (docs/09-ia-extraccion.md, 9.4). Fijas para aprovechar la caché.</summary>
        public const string Instrucciones =
@"Eres un analista de compras públicas de Guatemala. Recibirás el texto de las bases de un concurso
publicado en Guatecompras, dividido por páginas con el formato [p. N].

Extrae la información en el esquema JSON indicado. Reglas:
1. Usa solo información presente en el texto. Si un dato no aparece, usa null.
2. Para cada requisito, garantía y criterio indica la página donde aparece.
3. Mapea cada requisito documental al código del catálogo; si no corresponde, usa OTRO.
4. Marca posibleRestrictivo = true solo si el requisito exige una marca específica, una experiencia
   inusualmente puntual o una condición que pocos proveedores podrían cumplir, y explica el motivo.
5. El resumen debe tener entre 3 y 5 oraciones en español sencillo: qué se compra, para quién,
   por cuánto, cuándo cierra y el requisito más exigente.
6. No interpretes la ley ni des recomendaciones legales.";

        public static async Task<ResultadoIa> ExtraerFichaAsync(
            string apiKey, string modelo, string esfuerzo, string esquemaJson, string contexto,
            IReadOnlyList<string> erroresPrevios = null, string jsonPrevio = null,
            IReadOnlyList<DocumentoPdf> pdfsEscaneados = null)
        {
            var client = new AnthropicClient { ApiKey = apiKey };

            var mensaje = "Bases del concurso:\n\n" + contexto;
            if (pdfsEscaneados != null && pdfsEscaneados.Count > 0)
                mensaje += "\n\nAdemás se adjuntan como PDF los documentos escaneados (sin texto digital): "
                         + string.Join(", ", pdfsEscaneados.Select(p => p.Nombre)) + ". Cita sus páginas igual que las demás.";
            if (erroresPrevios != null && erroresPrevios.Count > 0)
            {
                // Reintento (RF-IA-02): se reenvía la respuesta anterior con los errores de validación
                mensaje += "\n\nTu respuesta anterior no pasó la validación. Corrige estos errores y devuelve la ficha completa:\n- "
                         + string.Join("\n- ", erroresPrevios)
                         + (jsonPrevio != null ? "\n\nRespuesta anterior:\n" + jsonPrevio : "");
            }

            var esquema = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(esquemaJson);
            esquema.Remove("$schema");

            var respuesta = await client.Beta.Messages.Create(new MessageCreateParams
            {
                Model = modelo,
                MaxTokens = 32000,
                Betas = ["server-side-fallback-2026-07-01"],
                // fallbacks: "default" → el servidor elige el modelo de respaldo según la categoría del rechazo
                Fallbacks = new Default(),
                System = new List<BetaTextBlockParam> { new() { Text = Instrucciones, CacheControl = new BetaCacheControlEphemeral() } },
                OutputConfig = new BetaOutputConfig
                {
                    Effort = esfuerzo,
                    Format = new BetaJsonOutputFormat { Schema = esquema },
                },
                Messages = [MensajeUsuario(mensaje, pdfsEscaneados)],
            });

            string stop = respuesta.StopReason?.Raw();
            string json = stop == "end_turn"
                ? string.Concat(respuesta.Content.Select(b => b.TryPickText(out var t) ? t.Text : ""))
                : null;

            return new ResultadoIa
            {
                Json = json,
                Modelo = respuesta.Model.Raw(),
                TokensEntrada = respuesta.Usage.InputTokens + (respuesta.Usage.CacheReadInputTokens ?? 0) + (respuesta.Usage.CacheCreationInputTokens ?? 0),
                TokensSalida = respuesta.Usage.OutputTokens,
                StopReason = stop,
            };
        }

        static BetaUserMessageParam MensajeUsuario(string texto, IReadOnlyList<DocumentoPdf> pdfs)
        {
            if (pdfs == null || pdfs.Count == 0) return new BetaUserMessageParam { Content = texto };
            var bloques = new List<BetaContentBlockParam>();
            foreach (var pdf in pdfs)
                bloques.Add(new BetaRequestDocumentBlock { Source = new BetaBase64PdfSource { Data = Convert.ToBase64String(pdf.Contenido) }, Title = pdf.Nombre });
            bloques.Add(new BetaTextBlockParam { Text = texto });
            return new BetaUserMessageParam { Content = bloques };
        }
    }
}
