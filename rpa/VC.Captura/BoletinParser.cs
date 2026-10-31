using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;

namespace VC.Captura
{
    /// <summary>Un concurso tal como aparece en el boletín diario de Guatecompras.</summary>
    public class ConcursoBoletin
    {
        public string Nog { get; set; }
        /// <summary>CONCURSO o PROYECTO_BASES.</summary>
        public string Seccion { get; set; }
        /// <summary>Fecha que muestra el boletín junto al NOG (fecha de presentación de ofertas).</summary>
        public DateTime? Fecha { get; set; }
        public string FechaTexto { get; set; }
        public string Modalidad { get; set; }
        /// <summary>Público, Privado, etc.</summary>
        public string Tipo { get; set; }
        public string Entidad { get; set; }
        public string UnidadCompradora { get; set; }
        public string Descripcion { get; set; }
        public string Url { get; set; }
        public List<string> Categorias { get; set; } = new List<string>();
    }

    public class Boletin
    {
        /// <summary>Total de concursos que declara el encabezado ("Se publicaron N concursos").</summary>
        public int? TotalDeclarado { get; set; }
        /// <summary>Día de las publicaciones que resume el boletín ("…publicaciones realizadas ayer 29.oct..2026").</summary>
        public DateTime? FechaPublicacion { get; set; }
        public List<ConcursoBoletin> Concursos { get; set; } = new List<ConcursoBoletin>();
    }

    /// <summary>
    /// Interpreta el HTML del boletín diario (BoletinDiarioDD-MM-AAAA.html).
    /// Sin dependencias de UiPath para poder probarlo con dotnet (ver rpa/tests).
    /// </summary>
    public static class BoletinParser
    {
        static readonly Regex Marcadores = new Regex(
            @"text-align:center;"">(?<seccion>CONCURSOS|PROYECTOS DE BASES)</td>" +
            @"|<a name=""tag\d+""><b>(?<cat1>[^<]*)</b>(?<cat2>[^<]*)</a>" +
            @"|<b>(?<nog>\d{6,})</b>",
            RegexOptions.Compiled);

        // Bloque de un concurso, desde el NOG hasta el cierre del enlace con la descripción
        static readonly Regex Fila = new Regex(
            @"<b>(?<nog>\d{6,})</b></font>\s*<br\s*/>\s*<font[^>]*>(?<fecha>[^<]*)<br\s*/>\s*<font[^>]*>(?<modalidad>[^<]*)</b></font>\s*<br\s*/>\s*(?<tipo>[^<]*)</font>" +
            @".*?<div[^>]*>(?<entidad>.*?)</div>\s*<a href=""(?<url>[^""]+)""[^>]*>(?<descripcion>.*?)</a>",
            RegexOptions.Compiled | RegexOptions.Singleline);

        static readonly Regex TotalConcursos = new Regex(@"Se publicaron (\d+) concursos", RegexOptions.Compiled);
        static readonly Regex FechaPublicaciones = new Regex(@"publicaciones realizadas \w+\s*(?:<b>)?\s*(\d{1,2}\.\w{3}\.+\d{4})", RegexOptions.Compiled);

        static readonly string[] Meses = { "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic" };

        public static Boletin Leer(string html)
        {
            var boletin = new Boletin();
            var total = TotalConcursos.Match(html);
            if (total.Success) boletin.TotalDeclarado = int.Parse(total.Groups[1].Value);
            var fecha = FechaPublicaciones.Match(html);
            if (fecha.Success) boletin.FechaPublicacion = LeerFecha(fecha.Groups[1].Value);

            var porNog = new Dictionary<string, ConcursoBoletin>();
            string seccion = null;
            string categoria = null;

            foreach (Match m in Marcadores.Matches(html))
            {
                if (m.Groups["seccion"].Success)
                {
                    seccion = m.Groups["seccion"].Value == "CONCURSOS" ? "CONCURSO" : "PROYECTO_BASES";
                    categoria = null;
                    continue;
                }
                if (m.Groups["cat1"].Success)
                {
                    categoria = Limpiar(m.Groups["cat1"].Value + m.Groups["cat2"].Value);
                    continue;
                }
                if (seccion == null) continue; // NOG fuera de las tablas (no debería ocurrir)

                var fila = Fila.Match(html, m.Index);
                if (!fila.Success || fila.Index != m.Index)
                    throw new FormatException($"Formato de fila no reconocido para el NOG {m.Groups["nog"].Value} (posición {m.Index}).");

                var nog = fila.Groups["nog"].Value;
                var clave = seccion + ":" + nog;
                if (!porNog.TryGetValue(clave, out var concurso))
                {
                    var lineasEntidad = Regex.Split(fila.Groups["entidad"].Value, @"<br\s*/>")
                        .Select(Limpiar).Where(s => s.Length > 0).ToList();

                    concurso = new ConcursoBoletin
                    {
                        Nog = nog,
                        Seccion = seccion,
                        FechaTexto = Limpiar(fila.Groups["fecha"].Value),
                        Modalidad = Limpiar(fila.Groups["modalidad"].Value),
                        Tipo = Limpiar(fila.Groups["tipo"].Value),
                        Entidad = lineasEntidad.ElementAtOrDefault(0),
                        UnidadCompradora = lineasEntidad.Count > 1 ? string.Join(" / ", lineasEntidad.Skip(1)) : null,
                        Descripcion = Limpiar(fila.Groups["descripcion"].Value),
                        Url = WebUtility.HtmlDecode(fila.Groups["url"].Value).Replace("http://", "https://"),
                    };
                    concurso.Fecha = LeerFecha(concurso.FechaTexto);
                    porNog[clave] = concurso;
                    boletin.Concursos.Add(concurso);
                }
                if (categoria != null && !concurso.Categorias.Contains(categoria))
                    concurso.Categorias.Add(categoria);
            }
            return boletin;
        }

        /// <summary>Convierte "02.nov..2026" (formato del boletín) a fecha.</summary>
        public static DateTime? LeerFecha(string texto)
        {
            var m = Regex.Match(texto ?? "", @"(\d{1,2})\.([a-zA-Z]{3})\.+(\d{4})");
            if (!m.Success) return null;
            var mes = Array.IndexOf(Meses, m.Groups[2].Value.ToLowerInvariant()) + 1;
            if (mes == 0) return null;
            return new DateTime(int.Parse(m.Groups[3].Value), mes, int.Parse(m.Groups[1].Value));
        }

        static string Limpiar(string html)
        {
            var texto = Regex.Replace(html, "<[^>]+>", " ");
            texto = WebUtility.HtmlDecode(texto);
            return Regex.Replace(texto, @"\s+", " ").Trim();
        }

        /// <summary>URL del boletín publicado en una fecha (contiene lo publicado el día anterior).</summary>
        public static string UrlDelDia(DateTime fecha) =>
            "https://www.guatecompras.gt/BoletinDiario/BoletinDiario" + fecha.ToString("dd-MM-yyyy", CultureInfo.InvariantCulture) + ".html";
    }
}
