using System;
using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using UiPath.CodedWorkflows;

namespace VC.Analisis
{
    /// <summary>
    /// Guarda en la API la ficha que una persona corrigió en Action Center (CU-17).
    /// Los campos del formulario (resumen, monto, fecha) prevalecen sobre el JSON completo.
    /// Es idempotente: si la ficha ya se guardó con esta tarea, no hace nada.
    /// </summary>
    public class ProcesarRevision : CodedWorkflow
    {
        [Workflow]
        public (bool procesada, string nog, string resultado) Execute(long tareaId, string accion, string datosJson, string apiUrl)
        {
            var datos = JsonNode.Parse(datosJson)!.AsObject();
            var nog = datos["Nog"]?.ToString();
            if (string.IsNullOrWhiteSpace(nog)) return (false, null, $"Tarea {tareaId} sin NOG");

            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);

            var actual = api.GetOpcional($"robot/concursos/{nog}/ficha");
            if (actual is JsonElement f && f.GetProperty("validadaPor").GetString() == "HUMANO"
                && f.GetProperty("tareaActionCenter").ToString() == tareaId.ToString(CultureInfo.InvariantCulture))
                return (false, nog, "Ya procesada");

            if (!string.Equals(accion, "aprobar", StringComparison.OrdinalIgnoreCase))
                return (false, nog, $"Tarea {tareaId} cerrada con la acción '{accion}': el concurso queda en revisión manual");

            var ficha = JsonNode.Parse(datos["FichaJson"]?.ToString() ?? "{}")!.AsObject();
            if (Texto(datos, "Resumen") is string resumen) ficha["resumen"] = resumen;
            // El formulario muestra la fecha como DD/MM/AAAA HH:MM (ver AnalizarConIa.Formulario)
            if (Texto(datos, "FechaLimiteOfertas") is string fecha
                && DateTime.TryParseExact(fecha, new[] { "dd/MM/yyyy HH:mm", "d/M/yyyy H:mm", "dd/MM/yyyy", "yyyy-MM-ddTHH:mm:ss" },
                    CultureInfo.InvariantCulture, DateTimeStyles.None, out var fechaHora))
                ficha["fechaLimiteOfertas"] = fechaHora.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
            if (Texto(datos, "MontoEstimado") is string monto && decimal.TryParse(monto, NumberStyles.Number, CultureInfo.InvariantCulture, out var valor))
                ficha["montoEstimado"] = valor;

            var (codigo, cuerpo) = api.PostConCodigo($"robot/concursos/{nog}/ficha", new
            {
                ficha,
                modelo = "revision-humana",
                tokensEntrada = 0,
                tokensSalida = 0,
                validadaPor = "HUMANO",
                tareaActionCenter = tareaId.ToString(CultureInfo.InvariantCulture),
            });
            if (codigo == 422)
            {
                Log($"NOG {nog}: la ficha corregida en la tarea {tareaId} sigue siendo inválida: {cuerpo.GetProperty("errores")}", LogLevel.Warn);
                return (false, nog, "Ficha corregida inválida");
            }
            if (codigo >= 300) throw new Exception($"API {codigo}: {cuerpo}");

            Log($"NOG {nog}: ficha validada por una persona (tarea {tareaId})");
            return (true, nog, "Guardada como validada por una persona");
        }

        static string Texto(JsonObject datos, string campo)
        {
            var valor = datos[campo]?.ToString();
            return string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();
        }
    }
}
