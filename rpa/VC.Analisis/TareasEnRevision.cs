using System;
using System.Linq;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Analisis
{
    /// <summary>Números de las tareas de Action Center cuyas fichas siguen esperando validación humana (CU-17).</summary>
    public class TareasEnRevision : CodedWorkflow
    {
        [Workflow]
        public (long[] tareas, int total) Execute(string apiUrl)
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);
            var tareas = api.Get("robot/fichas/en-revision").EnumerateArray().Select(f => f.GetProperty("tareaId").GetInt64()).ToArray();
            return (tareas, tareas.Length);
        }
    }
}
