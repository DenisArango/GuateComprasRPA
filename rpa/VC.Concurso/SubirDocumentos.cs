using System.Data;
using System.IO;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Concurso
{
    /// <summary>
    /// Sube a la API los documentos descargados (POST /robot/concursos/{nog}/documentos).
    /// La API calcula el SHA-256 y descarta los repetidos (RN-02). Un archivo vacío es un
    /// documento defectuoso del portal: se registra y se continúa con los demás (excepción ARCHIVO).
    /// </summary>
    public class SubirDocumentos : CodedWorkflow
    {
        [Workflow]
        public (int subidos, int repetidos, int defectuosos) Execute(string nog, DataTable dt_Descargados, string apiUrl)
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);

            int subidos = 0, repetidos = 0, defectuosos = 0;
            foreach (DataRow fila in dt_Descargados.Rows)
            {
                var ruta = fila["RutaArchivo"].ToString();
                var nombre = fila["Nombre"].ToString();
                if (!File.Exists(ruta) || new FileInfo(ruta).Length == 0)
                {
                    Log($"NOG {nog}: documento vacío o no descargado, se omite: {nombre}", LogLevel.Warn);
                    defectuosos++;
                    continue;
                }
                var resultado = api.SubirArchivo($"robot/concursos/{nog}/documentos", ruta, nombre,
                    NormalizarPortal.FechaHora(fila["PublicadoEn"]?.ToString()));
                if (resultado.GetProperty("nuevo").GetBoolean()) subidos++; else repetidos++;
            }

            Log($"NOG {nog}: {subidos} documentos nuevos, {repetidos} repetidos, {defectuosos} defectuosos");
            return (subidos, repetidos, defectuosos);
        }
    }
}
