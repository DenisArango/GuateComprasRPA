using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace VC.Concurso
{
    /// <summary>
    /// Convierte los textos que muestra Guatecompras (montos y fechas) a valores normalizados.
    /// Sin dependencias de UiPath para probarlo con dotnet (rpa/tests/VC.Concurso.Tests).
    /// Los formatos exactos del detalle se confirman al capturar los selectores; aquí se aceptan
    /// los que usa el portal en el boletín y los formatos numéricos habituales.
    /// </summary>
    public static class NormalizarPortal
    {
        static readonly string[] MesesCortos = { "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic" };

        /// <summary>"Q 1,234,567.89", "Q1234567.89", "1.234.567,89" → 1234567.89. Vacío o sin dígitos → null.</summary>
        public static decimal? Monto(string texto)
        {
            if (string.IsNullOrWhiteSpace(texto)) return null;
            var limpio = Regex.Replace(texto, @"[^\d.,]", "");
            if (!Regex.IsMatch(limpio, @"\d")) return null;

            var ultimoPunto = limpio.LastIndexOf('.');
            var ultimaComa = limpio.LastIndexOf(',');
            // El último separador con 1 o 2 dígitos después es el decimal; los demás son de miles
            var separadorDecimal = ultimoPunto > ultimaComa ? '.' : ',';
            var posicion = Math.Max(ultimoPunto, ultimaComa);
            var esDecimal = posicion >= 0 && limpio.Length - posicion - 1 is >= 1 and <= 2;

            string entero = esDecimal ? limpio.Substring(0, posicion) : limpio;
            string fraccion = esDecimal ? limpio.Substring(posicion + 1) : "0";
            entero = Regex.Replace(entero, @"[.,]", "");
            return decimal.Parse($"{(entero.Length == 0 ? "0" : entero)}.{fraccion}", CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// "05.nov..2026 10:00", "05.noviembre.2026 10:00:00 hrs", "05/11/2026 10:00" → "2026-11-05T10:00:00".
        /// Sin hora → medianoche. No reconocida → null.
        /// </summary>
        public static string FechaHora(string texto)
        {
            if (string.IsNullOrWhiteSpace(texto)) return null;
            var t = texto.Trim().ToLowerInvariant();

            int anio, mes, dia;
            var conMes = Regex.Match(t, @"(\d{1,2})\s*[.\-/ ]\s*(?:de\s+)?([a-záéíóú]{3,})\.*\s*[.\-/ ]?\s*(?:de\s+)?(\d{4})");
            var numerica = Regex.Match(t, @"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})");
            if (conMes.Success)
            {
                mes = Array.IndexOf(MesesCortos, QuitarTildes(conMes.Groups[2].Value).Substring(0, 3)) + 1;
                if (mes == 0) return null;
                dia = int.Parse(conMes.Groups[1].Value);
                anio = int.Parse(conMes.Groups[3].Value);
            }
            else if (numerica.Success)
            {
                dia = int.Parse(numerica.Groups[1].Value);
                mes = int.Parse(numerica.Groups[2].Value);
                anio = int.Parse(numerica.Groups[3].Value);
            }
            else return null;

            var hora = Regex.Match(t, @"(\d{1,2}):(\d{2})(?::(\d{2}))?");
            int h = 0, m = 0, s = 0;
            if (hora.Success)
            {
                h = int.Parse(hora.Groups[1].Value);
                m = int.Parse(hora.Groups[2].Value);
                s = hora.Groups[3].Success ? int.Parse(hora.Groups[3].Value) : 0;
                if (t.Contains("p.m") || t.Contains("pm")) { if (h < 12) h += 12; }
                else if ((t.Contains("a.m") || t.Contains(" am")) && h == 12) h = 0;
            }

            try { return new DateTime(anio, mes, dia, h, m, s).ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture); }
            catch (ArgumentOutOfRangeException) { return null; }
        }

        static string QuitarTildes(string texto) =>
            texto.Replace('á', 'a').Replace('é', 'e').Replace('í', 'i').Replace('ó', 'o').Replace('ú', 'u');
    }
}
