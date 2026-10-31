using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net.Mail;
using System.Text;
using System.Text.RegularExpressions;

namespace VC.Captura
{
    /// <summary>
    /// Reconoce el correo del Boletín diario de concursos de Guatecompras y obtiene su HTML.
    /// Sin dependencias de UiPath, para probarlo con dotnet test.
    /// </summary>
    public static class BoletinCorreo
    {
        public const string RemitentePorDefecto = "guatecompras.gt";
        /// <summary>Guatecompras: el asunto es, por ejemplo, "Publicaciones de ayer 14.Mar.2005".</summary>
        public const string AsuntoBoletin = "Publicaciones de ayer";

        /// <summary>El boletín más reciente recibido en la fecha indicada (o sin fecha legible); null si no hay.</summary>
        public static MailMessage Elegir(IEnumerable<MailMessage> correos, DateTime dia, string remitente = null)
        {
            var dominio = string.IsNullOrWhiteSpace(remitente) ? RemitentePorDefecto : remitente.Trim();
            return (correos ?? Enumerable.Empty<MailMessage>())
                .Where(c => EsBoletin(c, dominio))
                .Select(c => (correo: c, fecha: FechaDe(c)))
                .Where(x => x.fecha is null || x.fecha.Value.Date == dia.Date)
                .OrderByDescending(x => x.fecha ?? DateTime.MinValue)
                .Select(x => x.correo)
                .FirstOrDefault();
        }

        public static bool EsBoletin(MailMessage c, string dominio) =>
            (c.From?.Address ?? "").EndsWith(dominio, StringComparison.OrdinalIgnoreCase)
            && (c.Subject ?? "").TrimStart().StartsWith(AsuntoBoletin, StringComparison.OrdinalIgnoreCase);

        /// <summary>Fecha del encabezado Date (RFC 2822) en hora local; null si no se puede leer.</summary>
        public static DateTime? FechaDe(MailMessage c)
        {
            var texto = c.Headers?["Date"];
            if (string.IsNullOrWhiteSpace(texto)) return null;
            texto = Regex.Replace(texto, @"\s*\([^)]*\)\s*$", "");
            return DateTimeOffset.TryParse(texto, CultureInfo.InvariantCulture, DateTimeStyles.None, out var f)
                ? f.LocalDateTime
                : null;
        }

        /// <summary>HTML del boletín: adjunto .htm/.html, o el cuerpo HTML del mensaje; null si no hay.</summary>
        public static string Html(MailMessage c)
        {
            var adjunto = c.Attachments?.FirstOrDefault(a => a.Name != null
                && (a.Name.EndsWith(".html", StringComparison.OrdinalIgnoreCase) || a.Name.EndsWith(".htm", StringComparison.OrdinalIgnoreCase)));
            if (adjunto != null) return Leer(adjunto.ContentStream);

            // UiPath deja el cuerpo HTML en Body (IsBodyHtml) o en el encabezado HTMLBody
            if (c.IsBodyHtml && !string.IsNullOrWhiteSpace(c.Body)) return c.Body;
            var htmlBody = c.Headers?["HTMLBody"];
            if (!string.IsNullOrWhiteSpace(htmlBody)) return htmlBody;
            var vista = c.AlternateViews?.FirstOrDefault(v => v.ContentType.MediaType == "text/html");
            return vista != null ? Leer(vista.ContentStream) : null;
        }

        private static string Leer(Stream flujo)
        {
            if (flujo.CanSeek) flujo.Position = 0;
            using var lector = new StreamReader(flujo, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 4096, leaveOpen: true);
            return lector.ReadToEnd();
        }
    }
}
