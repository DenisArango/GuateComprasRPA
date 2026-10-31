using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace VC.Analisis
{
    /// <summary>Una página de texto de un documento del concurso.</summary>
    public class PaginaTexto
    {
        public string Documento { get; set; }
        public int Numero { get; set; }
        public string Texto { get; set; }
    }

    /// <summary>
    /// Limpieza y segmentación del texto de las bases antes de enviarlo a la IA (docs/09-ia-extraccion.md, 9.2).
    /// Si todo el texto cabe en el límite, se envía completo; si no, se priorizan las páginas que hablan de
    /// requisitos, garantías, criterios, plazos y montos, sin perder el orden ni la marca de página.
    /// Sin dependencias de UiPath para probarlo con dotnet (rpa/tests/VC.Analisis.Tests).
    /// </summary>
    public static class Segmentacion
    {
        static readonly string[] PalabrasRelevantes =
        {
            "requisito", "documento", "fianza", "seguro de caucion", "garantia", "criterio", "calificacion", "ponderacion",
            "puntaje", "plazo", "entrega", "monto", "precio", "presupuesto", "oferta", "patente", "rgae", "rtu",
            "solvencia", "declaracion jurada", "especificacion", "experiencia", "forma de pago", "fecha", "hora",
        };

        /// <summary>Quita encabezados y pies que se repiten en casi todas las páginas, y la numeración suelta.</summary>
        public static List<PaginaTexto> Limpiar(IReadOnlyList<PaginaTexto> paginas)
        {
            var lineasPorPagina = paginas.Select(p => Lineas(p.Texto)).ToList();
            var repetidas = lineasPorPagina
                .SelectMany(ls => ls.Select(Normalizar).Where(l => l.Length > 3).Distinct())
                .GroupBy(l => l)
                .Where(g => paginas.Count >= 4 && g.Count() >= paginas.Count * 0.6)
                .Select(g => g.Key)
                .ToHashSet();

            return paginas.Select((p, i) => new PaginaTexto
            {
                Documento = p.Documento,
                Numero = p.Numero,
                Texto = string.Join("\n", lineasPorPagina[i]
                    .Where(l => !repetidas.Contains(Normalizar(l)))
                    .Where(l => !Regex.IsMatch(l.Trim(), @"^(p[aá]gina\s*)?\d+(\s*(de|/)\s*\d+)?$", RegexOptions.IgnoreCase))),
            }).ToList();
        }

        /// <summary>Arma el contexto con marcas "[p. N]" sin superar <paramref name="maximoCaracteres"/>.</summary>
        public static string ArmarContexto(IReadOnlyList<PaginaTexto> paginas, int maximoCaracteres)
        {
            var limpias = Limpiar(paginas);
            var total = limpias.Sum(p => p.Texto.Length + 16);
            IEnumerable<PaginaTexto> elegidas = limpias;

            if (total > maximoCaracteres)
            {
                // Siempre las dos primeras páginas de cada documento (objeto, entidad, fechas), luego las más relevantes
                var prioridad = limpias
                    .Select((p, i) => new { p, i, puntos = p.Numero <= 2 ? int.MaxValue : Relevancia(p.Texto) })
                    .OrderByDescending(x => x.puntos).ThenBy(x => x.i);
                var seleccion = new List<(PaginaTexto p, int i)>();
                var usados = 0;
                foreach (var x in prioridad)
                {
                    var largo = x.p.Texto.Length + 16;
                    if (usados + largo > maximoCaracteres) continue;
                    seleccion.Add((x.p, x.i));
                    usados += largo;
                }
                elegidas = seleccion.OrderBy(s => s.i).Select(s => s.p);
            }

            var sb = new StringBuilder();
            string documentoActual = null;
            foreach (var p in elegidas)
            {
                if (p.Documento != documentoActual)
                {
                    sb.Append("\n### Documento: ").Append(p.Documento).Append('\n');
                    documentoActual = p.Documento;
                }
                sb.Append("[p. ").Append(p.Numero).Append("] ").Append(p.Texto.Trim()).Append('\n');
            }
            return sb.ToString().Trim();
        }

        static int Relevancia(string texto)
        {
            var t = Normalizar(texto);
            return PalabrasRelevantes.Sum(p => Regex.Matches(t, Regex.Escape(p)).Count);
        }

        static string[] Lineas(string texto) => (texto ?? "").Replace("\r", "").Split('\n');

        static string Normalizar(string texto)
        {
            var sb = new StringBuilder();
            foreach (var ch in (texto ?? "").Normalize(NormalizationForm.FormD))
                if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(ch);
            return Regex.Replace(sb.ToString().ToLowerInvariant(), @"\s+", " ").Trim();
        }
    }
}
