using System;
using System.Data;
using System.Linq;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Concurso
{
    /// <summary>
    /// Envía a la API lo que el robot leyó del detalle (PUT /robot/concursos/{nog}/detalle).
    /// La API guarda la instantánea y devuelve los cambios respecto a la lectura anterior;
    /// con eso se decide qué documentos descargar: todos en la primera captura, solo los nuevos
    /// en una revisión.
    /// </summary>
    public class RegistrarDetalle : CodedWorkflow
    {
        [Workflow]
        public (bool primeraCaptura, string[] documentosPorDescargar, bool hayCambioFechaEstado, string resumenCambios) Execute(
            string nog, string urlConcurso, string titulo, string entidad, string unidadCompradora, string modalidad,
            string estadoGc, string montoTexto, string fechaCierreTexto, DataTable dt_Documentos, int aclaraciones, string apiUrl)
        {
            var documentos = dt_Documentos.AsEnumerable()
                .Select(f => new { nombre = f["Nombre"].ToString().Trim(), publicadoEn = Vacio(f["PublicadoEn"]?.ToString()) })
                .Where(d => d.nombre.Length > 0)
                .ToList();

            var detalle = new
            {
                titulo = Vacio(titulo),
                entidad = Vacio(entidad),
                unidadCompradora = Vacio(unidadCompradora),
                modalidad = Vacio(modalidad),
                estadoGc = Vacio(estadoGc),
                montoEstimado = NormalizarPortal.Monto(montoTexto),
                fechaCierre = NormalizarPortal.FechaHora(fechaCierreTexto),
                documentos = documentos.Select(d => new { d.nombre, publicadoEn = NormalizarPortal.FechaHora(d.publicadoEn) }),
                aclaraciones,
                url = Vacio(urlConcurso),
            };

            using var api = new ApiVigia(apiUrl, ClaveRobot());
            var respuesta = api.Put($"robot/concursos/{nog}/detalle", detalle);

            var primeraCaptura = respuesta.GetProperty("primeraCaptura").GetBoolean();
            var cambios = respuesta.GetProperty("cambios").EnumerateArray().ToList();
            var porDescargar = primeraCaptura
                ? documentos.Select(d => d.nombre).ToArray()
                : cambios.Where(c => c.GetProperty("tipo").GetString() == "DOCUMENTO")
                    .Select(c => c.GetProperty("despues").GetProperty("nombre").GetString())
                    .ToArray();
            var hayCambioFechaEstado = cambios.Any(c => c.GetProperty("tipo").GetString() is "FECHA" or "ESTADO");
            var resumen = cambios.Count == 0
                ? (primeraCaptura ? "Primera captura" : "Sin cambios")
                : string.Join("; ", cambios.Select(c => $"{c.GetProperty("tipo").GetString()}: {c.GetProperty("antes")} → {c.GetProperty("despues")}"));

            Log($"NOG {nog}: {resumen}. Documentos por descargar: {porDescargar.Length}");
            return (primeraCaptura, porDescargar, hayCambioFechaEstado, resumen);
        }

        /// <summary>La clave va en un encabezado HTTP; se lee aquí y no en XAML (regla ST-SEC-009).</summary>
        string ClaveRobot()
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            return new NetworkCredential(string.Empty, clave).Password;
        }

        static string Vacio(string texto) => string.IsNullOrWhiteSpace(texto) ? null : texto.Trim();
    }
}
