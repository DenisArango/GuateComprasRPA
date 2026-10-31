using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using UiPath.CodedWorkflows;

namespace VC.Captura
{
    /// <summary>
    /// Interpreta el boletín diario de Guatecompras (archivo HTML recibido por correo o guardado
    /// a mano) y devuelve los candidatos que deben ir a la cola VC_Concursos. No descarga nada del
    /// portal: Cloudflare rechaza clientes que no son navegador y el robot no lo evade (ADR-0006). La preselección la hace la API (POST /robot/boletin);
    /// en desarrollo, sin API, se usa la preselección local de Data/Config.json.
    /// La clave de la API se lee aquí (asset VC_ApiClave) porque va en un encabezado HTTP
    /// y el Workflow Analyzer no permite convertir SecureString a texto en XAML.
    /// </summary>
    public class LeerBoletin : CodedWorkflow
    {
        [Workflow]
        public (DataTable candidatos, int publicados, string resumen) Execute(
            string rutaBoletin, bool preseleccionLocal, string apiUrl)
        {
            var config = JsonDocument.Parse(File.ReadAllText(Path.Combine("Data", "Config.json"))).RootElement;
            var boletin = BoletinParser.Leer(File.ReadAllText(rutaBoletin, Encoding.UTF8));
            var fecha = boletin.FechaPublicacion
                ?? throw new InvalidDataException("CAMBIO_ESTRUCTURA: el boletín no indica la fecha de las publicaciones.");
            var publicados = boletin.Concursos.Count(c => c.Seccion == "CONCURSO");
            if (boletin.TotalDeclarado.HasValue && boletin.TotalDeclarado != publicados)
                throw new InvalidDataException(
                    $"CAMBIO_ESTRUCTURA: el boletín declara {boletin.TotalDeclarado} concursos y se leyeron {publicados}.");

            var candidatos = preseleccionLocal
                ? PreseleccionarLocal(boletin, config.GetProperty("PreseleccionLocal"))
                : PreseleccionarConApi(boletin, fecha, apiUrl, LeerClaveApi(), config);

            var resumen = $"Boletín de publicaciones del {fecha:dd-MM-yyyy}: {publicados} concursos, {candidatos.Count} candidatos " +
                          (preseleccionLocal ? "(preselección local)" : "(preselección de la API)");
            Log(resumen);
            return (ATabla(candidatos), publicados, resumen);
        }

        string LeerClaveApi()
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            return new System.Net.NetworkCredential(string.Empty, clave).Password;
        }

        static List<ConcursoBoletin> PreseleccionarLocal(Boletin boletin, JsonElement reglas)
        {
            List<string> Lista(string nombre) => reglas.GetProperty(nombre).EnumerateArray().Select(e => Normalizar(e.GetString())).ToList();
            var secciones = reglas.GetProperty("Secciones").EnumerateArray().Select(e => e.GetString()).ToList();
            var categorias = Lista("Categorias");
            var modalidades = Lista("Modalidades");
            var palabras = Lista("PalabrasClave");

            return boletin.Concursos.Where(c =>
                    secciones.Contains(c.Seccion)
                    && (c.Fecha == null || c.Fecha >= DateTime.Today)
                    && (categorias.Count == 0 || c.Categorias.Any(cat => categorias.Contains(Normalizar(cat))))
                    && (modalidades.Count == 0 || modalidades.Any(m => Normalizar(c.Modalidad).StartsWith(m)))
                    && (palabras.Count == 0 || palabras.Any(p => Normalizar(c.Descripcion).Contains(p))))
                .ToList();
        }

        static List<ConcursoBoletin> PreseleccionarConApi(Boletin boletin, DateTime fecha, string apiUrl, string apiClave, JsonElement config)
        {
            if (string.IsNullOrWhiteSpace(apiUrl)) throw new ArgumentException("Falta la URL de la API (asset VC_ApiUrl).");

            var opciones = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            var cuerpo = JsonSerializer.Serialize(new { fechaPublicacion = fecha.ToString("yyyy-MM-dd"), concursos = boletin.Concursos }, opciones);

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(config.GetProperty("TimeoutSegundos").GetInt32()) };
            using var solicitud = new HttpRequestMessage(HttpMethod.Post, apiUrl.TrimEnd('/') + "/robot/boletin")
            {
                Content = new StringContent(cuerpo, Encoding.UTF8, "application/json"),
            };
            solicitud.Headers.Add("X-Robot-Clave", apiClave);
            using var respuesta = http.SendAsync(solicitud).GetAwaiter().GetResult();
            var texto = respuesta.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!respuesta.IsSuccessStatusCode)
                throw new HttpRequestException($"La API rechazó el boletín ({(int)respuesta.StatusCode}): {texto}");

            var porNog = boletin.Concursos.Where(c => c.Seccion == "CONCURSO").ToDictionary(c => c.Nog);
            return JsonDocument.Parse(texto).RootElement.GetProperty("candidatos").EnumerateArray()
                .Select(e => e.GetProperty("nog").GetString())
                .Where(porNog.ContainsKey)
                .Select(nog => porNog[nog])
                .ToList();
        }

        static DataTable ATabla(IEnumerable<ConcursoBoletin> concursos)
        {
            var tabla = new DataTable("Candidatos");
            foreach (var columna in new[] { "Nog", "Url", "Descripcion", "Entidad", "Modalidad", "FechaCierre" })
                tabla.Columns.Add(columna, typeof(string));
            foreach (var c in concursos)
                tabla.Rows.Add(c.Nog, c.Url, Recortar(c.Descripcion, 500), c.Entidad, c.Modalidad, c.Fecha?.ToString("yyyy-MM-dd") ?? "");
            return tabla;
        }

        static string Recortar(string texto, int maximo) => texto.Length <= maximo ? texto : texto.Substring(0, maximo);

        /// <summary>Minúsculas y sin tildes, para comparar textos del boletín con la configuración.</summary>
        static string Normalizar(string texto)
        {
            var sinTildes = new StringBuilder();
            foreach (var ch in (texto ?? "").Normalize(NormalizationForm.FormD))
                if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sinTildes.Append(ch);
            return sinTildes.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant().Trim();
        }
    }
}
