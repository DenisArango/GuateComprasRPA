using System;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Analisis
{
    /// <summary>
    /// Guarda en la API el número de la tarea de Action Center creada para la ficha. Con ese número,
    /// RecogerRevisiones consulta cada tarea con Get Task Data en vez de listarlas como administrador.
    /// </summary>
    public class RegistrarTarea : CodedWorkflow
    {
        [Workflow]
        public void Execute(string nog, long tareaId, string apiUrl)
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);
            api.Put($"robot/concursos/{nog}/ficha/tarea", new { tareaId });
        }
    }
}
