using System.Data;
using UiPath.CodedWorkflows;

namespace VC.Concurso
{
    /// <summary>
    /// Convierte el HTML leído del detalle (Get Attribute "outerhtml" de DatosGenerales y de ContenidoPestana con
    /// el historial abierto) en los valores que registra la API. La lógica está en DetallePortal (con pruebas).
    /// </summary>
    public class InterpretarDetalle : CodedWorkflow
    {
        [Workflow]
        public (string titulo, string entidad, string unidadCompradora, string modalidad, string estadoGc, string montoTexto,
            string fechaCierreTexto, DataTable dt_Documentos, int aclaraciones) Execute(string htmlDatos, string htmlHistorial, string nogEsperado)
        {
            var d = DetallePortal.Leer(htmlDatos, htmlHistorial);
            if (!string.IsNullOrEmpty(nogEsperado) && d.Nog != nogEsperado)
                throw new System.InvalidOperationException($"El navegador muestra el NOG {d.Nog} y se esperaba {nogEsperado}.");

            var tabla = new DataTable("Documentos");
            tabla.Columns.Add("Nombre", typeof(string));
            tabla.Columns.Add("PublicadoEn", typeof(string));
            tabla.Columns.Add("Tipo", typeof(string));
            tabla.Columns.Add("Url", typeof(string));
            foreach (var doc in d.Documentos) tabla.Rows.Add(doc.Nombre, doc.PublicadoEnTexto, doc.Tipo, doc.Url);

            Log($"Detalle {d.Nog}: {d.Documentos.Count} documentos, {d.AccionesPosteriores} acciones posteriores a la creación, estado \"{d.EstadoGc}\"");
            return (d.Titulo, d.Entidad, d.UnidadCompradora, d.Modalidad, d.EstadoGc, d.MontoTexto, d.FechaCierreTexto, tabla, d.AccionesPosteriores);
        }
    }
}
