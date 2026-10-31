using System.Collections.Generic;
using System.Linq;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Analisis
{
    /// <summary>
    /// Guarda en la API el texto de un PDF, por página (PUT /robot/documentos/{id}/texto).
    /// Si la mayoría de las páginas casi no tiene texto, el documento es escaneado: se marca
    /// requiereOcr y AnalizarConIa lo envía a Claude como PDF (ADR-0005).
    /// </summary>
    public class GuardarTexto : CodedWorkflow
    {
        [Workflow]
        public (int paginas, bool requiereOcr) Execute(int documentoId, Dictionary<int, string> textoPorPagina, int minimoCaracteres, string apiUrl)
        {
            var paginas = textoPorPagina.OrderBy(p => p.Key)
                .Select(p => new { numero = p.Key, texto = p.Value ?? "" })
                .ToList();
            var vacias = paginas.Count(p => p.texto.Trim().Length < minimoCaracteres);
            var requiereOcr = paginas.Count > 0 && vacias > paginas.Count / 2;

            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);
            api.Put($"robot/documentos/{documentoId}/texto", new { paginas, requiereOcr });

            Log($"Documento {documentoId}: {paginas.Count} páginas" + (requiereOcr ? ", escaneado (se enviará como PDF a la IA)" : ""));
            return (paginas.Count, requiereOcr);
        }
    }
}
