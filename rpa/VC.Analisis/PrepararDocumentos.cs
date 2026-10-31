using System.Data;
using System.IO;
using System.Linq;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Analisis
{
    /// <summary>
    /// Descarga de la API los PDF del concurso que todavía no tienen texto extraído.
    /// Los demás formatos (Word, Excel, comprimidos) se omiten y se registran (RF-DOC-03 es "podría").
    /// </summary>
    public class PrepararDocumentos : CodedWorkflow
    {
        [Workflow]
        public (DataTable dt_Pendientes, int cantidad) Execute(string nog, string apiUrl, string carpeta)
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);

            var pendientes = new DataTable("Pendientes");
            pendientes.Columns.Add("DocumentoId", typeof(int));
            pendientes.Columns.Add("Nombre", typeof(string));
            pendientes.Columns.Add("Ruta", typeof(string));

            Directory.CreateDirectory(carpeta);
            foreach (var d in api.Get($"robot/concursos/{nog}/documentos").EnumerateArray().Where(d => !d.GetProperty("tieneTexto").GetBoolean()))
            {
                var id = d.GetProperty("id").GetInt32();
                var nombre = d.GetProperty("nombreOriginal").GetString();
                if (!nombre.EndsWith(".pdf", System.StringComparison.OrdinalIgnoreCase))
                {
                    Log($"NOG {nog}: se omite {nombre} (solo se analizan PDF)", LogLevel.Warn);
                    continue;
                }
                var ruta = Path.Combine(carpeta, $"{id}.pdf");
                File.WriteAllBytes(ruta, api.Descargar($"robot/documentos/{id}/archivo"));
                pendientes.Rows.Add(id, nombre, ruta);
            }

            Log($"NOG {nog}: {pendientes.Rows.Count} PDF por extraer texto");
            return (pendientes, pendientes.Rows.Count);
        }
    }
}
