using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;

namespace VC.Concurso
{
    /// <summary>Un documento publicado en el concurso, tal como aparece en el historial de acciones.</summary>
    public sealed record DocumentoPortal(string Nombre, string Tipo, string Url, string PublicadoEnTexto);

    /// <summary>Lo que el robot lee del detalle del concurso (textos tal cual; RegistrarDetalle normaliza fechas).</summary>
    public sealed class DetalleLeido
    {
        public string Nog { get; set; } = "";
        public string Titulo { get; set; } = "";
        public string Entidad { get; set; } = "";
        public string UnidadCompradora { get; set; } = "";
        public string Modalidad { get; set; } = "";
        public string EstadoGc { get; set; } = "";
        public string FechaPublicacionTexto { get; set; } = "";
        public string FechaCierreTexto { get; set; } = "";
        /// <summary>El detalle no publica el monto: lo extrae la IA de las bases.</summary>
        public string MontoTexto { get; set; } = "";
        public List<DocumentoPortal> Documentos { get; } = new List<DocumentoPortal>();
        /// <summary>Acciones del historial posteriores a la creación (adendas, aclaraciones, cambios de estado).</summary>
        public int AccionesPosteriores { get; set; }
    }

    /// <summary>
    /// Interpreta el HTML del detalle de Guatecompras (consultaConcurso.aspx). El robot lee con Get Attribute
    /// el HTML de dos elementos del Object Repository: DatosGenerales (filas etiqueta/valor) y ContenidoPestana
    /// con la pestaña "Historial de acciones" abierta (cada acción trae fecha y documentos con su enlace).
    /// Sin dependencias de UiPath para probarlo con las páginas guardadas en rpa/fixtures/detalle.
    /// </summary>
    public static class DetallePortal
    {
        static readonly Regex Fila = new Regex(
            @"class=""[^""]*EtiquetaForm3[^""]*""[^>]*>(?<etiqueta>.*?)</div>\s*<div[^>]*class=""[^""]*EtiquetaInfo[^""]*""[^>]*>(?<valor>.*?)</div>\s*</div>",
            RegexOptions.Singleline | RegexOptions.IgnoreCase);

        static readonly Regex FilaHistorial = new Regex(@"<tr[^>]*class=""FilaTablaDetalle""[^>]*>(?<fila>.*?)</tr>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        static readonly Regex Celda = new Regex(@"<td[^>]*>(?<c>.*?)</td>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        static readonly Regex Documento = new Regex(@"<b>(?<tipo>[^<]+)</b>\s*<a[^>]*href=""(?<url>[^""]+)""[^>]*>(?<texto>[^<]+)</a>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        static readonly Regex FechaAccion = new Regex(@"(\d{1,2}\.[a-záéíóú]+\.\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?)", RegexOptions.IgnoreCase);

        public static DetalleLeido Leer(string htmlDatos, string htmlHistorial)
        {
            var d = new DetalleLeido();
            var campos = Campos(htmlDatos ?? "");
            if (!campos.ContainsKey("nog") || !campos.ContainsKey("descripcion"))
                throw new FormatException("CAMBIO_ESTRUCTURA: el detalle no tiene las filas de NOG y descripción.");

            d.Nog = campos["nog"];
            d.Titulo = campos["descripcion"];
            d.Modalidad = Valor(campos, "modalidad");
            d.Entidad = Valor(campos, "entidad");
            d.UnidadCompradora = Valor(campos, "unidad compradora");
            d.EstadoGc = Valor(campos, "estatus");
            d.FechaPublicacionTexto = Valor(campos, "fecha de publicacion");
            d.FechaCierreTexto = Valor(campos, "fecha de cierre de recepcion de ofertas");
            if (d.FechaCierreTexto.Length == 0) d.FechaCierreTexto = Valor(campos, "fecha de presentacion de ofertas");
            d.MontoTexto = Valor(campos, "monto");

            var filas = FilaHistorial.Matches(htmlHistorial ?? "").Cast<Match>().ToList();
            foreach (Match fila in filas)
            {
                var celdas = Celda.Matches(fila.Groups["fila"].Value).Cast<Match>().Select(c => c.Groups["c"].Value).ToList();
                if (celdas.Count < 3) continue;
                var accion = Texto(celdas[1]);
                var descripcion = celdas[2];
                var fecha = FechaAccion.Match(Texto(descripcion));
                if (!accion.StartsWith("CREACI", StringComparison.OrdinalIgnoreCase)) d.AccionesPosteriores++;

                foreach (Match doc in Documento.Matches(descripcion))
                {
                    var nombre = NombreDocumento(doc.Groups["texto"].Value);
                    if (d.Documentos.Any(x => x.Nombre.Equals(nombre, StringComparison.OrdinalIgnoreCase))) continue;
                    d.Documentos.Add(new DocumentoPortal(nombre, Texto(doc.Groups["tipo"].Value), UrlAbsoluta(WebUtility.HtmlDecode(doc.Groups["url"].Value)), fecha.Success ? fecha.Value : ""));
                }
            }
            return d;
        }

        /// <summary>
        /// En la página en vivo los enlaces de los documentos son relativos ("concursos/files/…", "../concursos/files/…");
        /// al guardar la página, Edge los vuelve absolutos. Se completan siempre con el dominio del portal.
        /// </summary>
        public static string UrlAbsoluta(string href)
        {
            var h = (href ?? "").Trim();
            if (Uri.TryCreate(h, UriKind.Absolute, out var absoluta) && (absoluta.Scheme == Uri.UriSchemeHttps || absoluta.Scheme == Uri.UriSchemeHttp))
                return absoluta.AbsoluteUri;
            var ruta = Regex.Replace(h, @"^(\./|\.\./|/)+", "");
            return ruta.StartsWith("concursos/", StringComparison.OrdinalIgnoreCase)
                ? "https://www.guatecompras.gt/" + ruta
                : new Uri(new Uri("https://www.guatecompras.gt/concursos/consultaConcurso.aspx"), h).AbsoluteUri;
        }

        /// <summary>"32533209@BASES.pdf (539KB) (4 Descargas)" → "32533209@BASES.pdf".</summary>
        public static string NombreDocumento(string texto)
        {
            var t = Texto(texto);
            t = Regex.Replace(t, @"\s*\(\d+\s*Descargas?\)\s*$", "", RegexOptions.IgnoreCase);
            t = Regex.Replace(t, @"\s*\([\d.,]+\s*[KMG]?B\)\s*$", "", RegexOptions.IgnoreCase);
            return t.Trim();
        }

        static Dictionary<string, string> Campos(string html)
        {
            var campos = new Dictionary<string, string>();
            foreach (Match m in Fila.Matches(html))
            {
                var etiqueta = Clave(Texto(m.Groups["etiqueta"].Value));
                if (etiqueta.Length > 0 && !campos.ContainsKey(etiqueta)) campos[etiqueta] = Texto(m.Groups["valor"].Value);
            }
            return campos;
        }

        static string Valor(Dictionary<string, string> campos, string clave) => campos.TryGetValue(clave, out var v) ? v : "";

        /// <summary>"Unidad compradora:" → "unidad compradora" (sin tildes ni dos puntos).</summary>
        static string Clave(string etiqueta) =>
            etiqueta.TrimEnd(':', ' ').ToLowerInvariant()
                .Replace('á', 'a').Replace('é', 'e').Replace('í', 'i').Replace('ó', 'o').Replace('ú', 'u');

        /// <summary>Texto visible: sin etiquetas, entidades decodificadas y espacios colapsados.</summary>
        static string Texto(string html)
        {
            var sinEtiquetas = Regex.Replace(html ?? "", @"<(script|style)[^>]*>.*?</\1>", " ", RegexOptions.Singleline | RegexOptions.IgnoreCase);
            sinEtiquetas = Regex.Replace(sinEtiquetas, @"<br\s*/?>|</li>", " ", RegexOptions.IgnoreCase);
            sinEtiquetas = Regex.Replace(sinEtiquetas, "<[^>]+>", " ");
            return Regex.Replace(WebUtility.HtmlDecode(sinEtiquetas), @"\s+", " ").Trim();
        }
    }
}
