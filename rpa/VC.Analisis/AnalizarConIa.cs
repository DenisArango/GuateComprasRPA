using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Text.Json;
using UiPath.CodedWorkflows;


namespace VC.Analisis
{
    /// <summary>
    /// Obtiene la ficha de un concurso con Claude (docs/09-ia-extraccion.md, 9.2) y la guarda en la API.
    /// Estados de salida:
    ///   ANALIZADO        ficha válida con confianza suficiente
    ///   REVISION         ficha válida con confianza baja → Action Center
    ///   INVALIDA         no pasó la validación tras los reintentos → Action Center (RN-06)
    ///   RECHAZO          el modelo declinó la solicitud → Action Center
    ///   SIN_PRESUPUESTO  se superó el presupuesto diario de IA → se pospone (RNF-11)
    /// </summary>
    public class AnalizarConIa : CodedWorkflow
    {
        [Workflow]
        public (string estado, decimal confianza, string resumen, Dictionary<string, string> datosFormulario) Execute(
            string nog, string apiUrl, string modelo, string esfuerzo, int intentos, int maxCaracteres, decimal costoEstimadoUsd)
        {
            var (_, claveRobot) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, claveRobot).Password);

            var disponible = api.Get("robot/ia/presupuesto").GetProperty("disponibleUsd").GetDecimal();
            if (disponible < costoEstimadoUsd)
                return ("SIN_PRESUPUESTO", 0, $"Presupuesto de IA agotado (disponible USD {disponible:0.00})", Formulario(nog, null, null, null, null, null));

            var texto = api.Get($"robot/concursos/{nog}/texto");
            var documentos = texto.GetProperty("documentos").EnumerateArray().ToList();
            var paginas = documentos
                .Where(d => !d.GetProperty("requiereOcr").GetBoolean())
                .SelectMany(d => d.GetProperty("paginas").EnumerateArray().Select(p => new PaginaTexto
                {
                    Documento = d.GetProperty("nombre").GetString(),
                    Numero = p.GetProperty("numero").GetInt32(),
                    Texto = p.GetProperty("texto").GetString(),
                }))
                .ToList();
            var escaneados = documentos
                .Where(d => d.GetProperty("requiereOcr").GetBoolean())
                .Select(d => new DocumentoPdf
                {
                    Nombre = d.GetProperty("nombre").GetString(),
                    Contenido = api.Descargar($"robot/documentos/{d.GetProperty("id").GetInt32()}/archivo"),
                })
                .ToList();
            if (paginas.Count == 0 && escaneados.Count == 0)
                throw new UiPath.Core.BusinessRuleException("El concurso no tiene texto ni PDF para analizar");

            var contexto = Segmentacion.ArmarContexto(paginas, maxCaracteres);
            var esquema = api.Get("robot/esquemas/ficha").GetRawText();
            var (_, claveIa) = system.GetCredential("VC_IA", null, 30000, default);
            var apiKey = new NetworkCredential(string.Empty, claveIa).Password;

            List<string> errores = null;
            string json = null;
            long tokensEntrada = 0, tokensSalida = 0;
            for (var intento = 1; intento <= intentos; intento++)
            {
                var r = ClienteClaude.ExtraerFichaAsync(apiKey, modelo, esfuerzo, esquema, contexto, errores, json, escaneados)
                    .GetAwaiter().GetResult();
                tokensEntrada += r.TokensEntrada;
                tokensSalida += r.TokensSalida;
                api.Post("robot/ia/uso", new { nog, modelo = r.Modelo, tokensEntrada = r.TokensEntrada, tokensSalida = r.TokensSalida });
                Log($"NOG {nog}: intento {intento} con {r.Modelo}, stop={r.StopReason}, tokens {r.TokensEntrada}/{r.TokensSalida}");

                if (r.StopReason == "refusal")
                    return ("RECHAZO", 0, "El modelo declinó la solicitud",
                        Formulario(nog, texto, null, json, "La IA no procesó estas bases; completar la ficha a mano.", null));
                if (r.Json == null)
                {
                    errores = new List<string> { $"La respuesta no terminó (stop_reason = {r.StopReason})." };
                    continue;
                }

                json = r.Json;
                var ficha = JsonDocument.Parse(json).RootElement;
                var validacion = api.Post("robot/fichas/validar", new { ficha });
                if (!validacion.GetProperty("ok").GetBoolean())
                {
                    errores = validacion.GetProperty("errores").EnumerateArray().Select(e => e.GetString()).ToList();
                    Log($"NOG {nog}: ficha inválida ({errores.Count} errores), se reintenta", LogLevel.Warn);
                    continue;
                }

                var guardada = api.Post($"robot/concursos/{nog}/ficha",
                    new { ficha, modelo = r.Modelo, tokensEntrada, tokensSalida, validadaPor = "IA" });
                var confianza = guardada.GetProperty("confianza").GetDecimal();
                var resumen = ficha.GetProperty("resumen").GetString();
                return guardada.GetProperty("requiereRevision").GetBoolean()
                    ? ("REVISION", confianza, resumen,
                        Formulario(nog, texto, ficha, json, $"Confianza {confianza:0.00}: {DescribirComponentes(guardada.GetProperty("componentes"))}", resumen))
                    : ("ANALIZADO", confianza, resumen, Formulario(nog, texto, ficha, json, null, resumen));
            }

            return ("INVALIDA", 0, "La IA no produjo una ficha válida",
                Formulario(nog, texto, null, json ?? "{}", "Errores de validación: " + string.Join("; ", errores ?? new List<string>()), null));
        }

        /// <summary>Datos que se muestran en el formulario de Action Center (Data/FormularioValidacion.json).</summary>
        static Dictionary<string, string> Formulario(string nog, JsonElement? texto, JsonElement? ficha, string json, string motivo, string resumen)
        {
            string Campo(string nombre) => ficha is JsonElement f && f.TryGetProperty(nombre, out var v) && v.ValueKind != JsonValueKind.Null ? v.ToString() : "";
            return new Dictionary<string, string>
            {
                ["Nog"] = nog,
                ["Titulo"] = texto?.GetProperty("titulo").GetString() ?? "",
                ["UrlConcurso"] = texto?.GetProperty("url").GetString() ?? "",
                ["MotivoRevision"] = motivo ?? "",
                ["Resumen"] = resumen ?? "",
                ["MontoEstimado"] = Campo("montoEstimado"),
                // Action Center convierte las fechas ISO en fechas de JavaScript (y les cambia la zona horaria):
                // en el formulario la fecha va como DD/MM/AAAA HH:MM; ProcesarRevision la vuelve a ISO.
                ["FechaLimiteOfertas"] = DateTime.TryParse(Campo("fechaLimiteOfertas"), CultureInfo.InvariantCulture, DateTimeStyles.None, out var fecha)
                    ? fecha.ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture) : "",
                ["FichaJson"] = json ?? "",
            };
        }

        /// <summary>Explica qué verificaciones fallaron, para quien revisa en Action Center.</summary>
        static string DescribirComponentes(JsonElement componentes)
        {
            var nombres = new Dictionary<string, string>
            {
                ["fecha"] = "la fecha límite no coincide con el portal",
                ["monto"] = "el monto no coincide con el portal",
                ["paginas"] = "algunas páginas citadas no contienen el dato",
                ["completitud"] = "faltan requisitos o criterios de calificación",
            };
            var fallas = componentes.EnumerateObject().Where(c => c.Value.GetDouble() < 1).Select(c => nombres.GetValueOrDefault(c.Name, c.Name));
            return string.Join("; ", fallas);
        }
    }
}
