using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Datos
{
    /// <summary>Estado de una carga OCDS (GET /robot/ocds/cargas/:id): EN_CURSO, EXITOSA o FALLIDA.</summary>
    public class ConsultarCarga : CodedWorkflow
    {
        [Workflow]
        public (string estado, string detalle) Execute(string apiUrl, int idCarga)
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);

            var c = api.Get($"robot/ocds/cargas/{idCarga}");
            var estado = c.GetProperty("estado").GetString();
            var etapa = c.GetProperty("etapa").GetString();
            var registros = c.GetProperty("registros").GetInt32();
            var error = c.TryGetProperty("error", out var e) && e.ValueKind == System.Text.Json.JsonValueKind.String ? e.GetString() : null;
            var detalle = $"Carga {idCarga} {estado}: {etapa} · {registros:N0} registros" + (error != null ? $" · {error}" : "");
            return (estado, detalle);
        }
    }
}
