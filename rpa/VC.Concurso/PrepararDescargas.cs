using System;
using System.Data;
using System.Linq;
using UiPath.CodedWorkflows;

namespace VC.Concurso
{
    /// <summary>
    /// De los documentos leídos del historial, deja solo los que la API pidió descargar (los nuevos, RN-02),
    /// con su URL. Devuelve también la tabla vacía de descargados.
    /// </summary>
    public class PrepararDescargas : CodedWorkflow
    {
        [Workflow]
        public (DataTable dt_PorDescargar, DataTable dt_Descargados) Execute(DataTable dt_Documentos, string[] nombres)
        {
            var pedidos = (nombres ?? Array.Empty<string>()).Select(n => n.Trim()).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var porDescargar = dt_Documentos.Clone();
            foreach (DataRow fila in dt_Documentos.Rows)
                if (pedidos.Contains(fila["Nombre"].ToString().Trim()) && !string.IsNullOrWhiteSpace(fila["Url"]?.ToString()))
                    porDescargar.ImportRow(fila);
            return (porDescargar, GuardarDescarga.NuevaTabla());
        }
    }
}
