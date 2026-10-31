using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace VC.Notificador
{
    /// <summary>Un correo listo para enviar y registrar.</summary>
    public sealed record Mensaje(int? PerfilId, string Tipo, string[] Para, string Asunto, string Html, string[] Nogs);

    /// <summary>
    /// Arma los correos de VC.Notificador a partir de lo que devuelve la API
    /// (/robot/notificaciones/resumen y /robot/notificaciones/aviso). Sin dependencias de UiPath.
    /// HTML de correo: tablas y estilos en línea, porque los clientes de correo ignoran las hojas de estilo.
    /// </summary>
    public static class PlantillaCorreo
    {
        static readonly CultureInfo Es = new CultureInfo("es-GT");

        // Paleta del dashboard (web/DESIGN.md)
        const string Fondo = "#f7f8f6", Tarjeta = "#ffffff", Borde = "#e3e6e2", Regla = "#eef0ed";
        const string Texto = "#141714", Secundario = "#555c56", Terciario = "#687069";
        const string Verde = "#0e6b55", VerdeClaro = "#8fbfb0", Pista = "#e7ece9", Rojo = "#b4262c", Primario = "#1b1f1c";
        const string Fuente = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

        // ---------- Resumen diario ----------

        public static List<Mensaje> Resumenes(JsonElement respuesta, DateTime hoy)
        {
            var webUrl = Cadena(respuesta, "webUrl") ?? "";
            return respuesta.GetProperty("perfiles").EnumerateArray().Select(p => Resumen(p, hoy, webUrl)).ToList();
        }

        public static Mensaje Resumen(JsonElement p, DateTime hoy, string webUrl)
        {
            var empresa = Cadena(p, "empresa") ?? "";
            var oportunidades = p.GetProperty("oportunidades").EnumerateArray().ToList();
            var total = p.TryGetProperty("oportunidadesTotal", out var t) ? t.GetInt32() : oportunidades.Count;
            var recordatorios = p.GetProperty("recordatorios").EnumerateArray().ToList();
            var documentos = p.GetProperty("documentosPorVencer").EnumerateArray().ToList();

            var asunto = total > 0
                ? $"{total} {(total == 1 ? "oportunidad nueva" : "oportunidades nuevas")} para {empresa}"
                : recordatorios.Count > 0 ? $"Concursos que sigues cierran pronto · {empresa}" : $"Documentos por vencer · {empresa}";

            var cuerpo = new StringBuilder();
            var semana = oportunidades.Count(o => Entero(o, "diasParaCierre") is int d && d <= 7);
            var hallazgo = total == 0
                ? "No hay oportunidades nuevas hoy."
                : $"Encontramos {total} {(total == 1 ? "concurso compatible" : "concursos compatibles")} con tu perfil"
                  + (semana > 0 ? $"; {semana} {(semana == 1 ? "cierra" : "cierran")} en los próximos 7 días." : ".");
            cuerpo.Append(Parrafo(hallazgo, 15, Texto));

            if (oportunidades.Count > 0)
            {
                cuerpo.Append(Seccion("Oportunidades nuevas"));
                if (oportunidades.All(o => Cadena(o, "etapa") == "PRELIMINAR"))
                    cuerpo.Append(Parrafo("Puntajes preliminares, calculados con los datos del boletín; se completan cuando el robot lee las bases.", 12, Terciario));
                cuerpo.Append(Tabla(oportunidades.Select(FilaOportunidad)));
                if (total > oportunidades.Count)
                    cuerpo.Append(Parrafo($"Y {total - oportunidades.Count} más en el panel.", 13, Secundario));
            }
            if (recordatorios.Count > 0)
            {
                cuerpo.Append(Seccion("Concursos que sigues y cierran pronto"));
                cuerpo.Append(Tabla(recordatorios.Select(FilaRecordatorio)));
            }
            if (documentos.Count > 0)
            {
                cuerpo.Append(Seccion("Documentos de la empresa por vencer"));
                cuerpo.Append(Tabla(documentos.Select(FilaDocumento)));
                cuerpo.Append(Parrafo("Renuévalos antes de ofertar: un documento vencido descalifica la oferta.", 13, Secundario));
            }
            cuerpo.Append(Boton("Abrir el panel", webUrl.TrimEnd('/') + "/panel"));

            var nogs = oportunidades.Select(o => Cadena(o, "nog")).Where(n => n != null).ToArray();
            var titulo = $"Resumen del {hoy.ToString("dddd d 'de' MMMM", Es)}";
            return new Mensaje(Entero(p, "perfilId"), "RESUMEN", Destinatarios(p), asunto, Documento(titulo, empresa, cuerpo.ToString()), nogs!);
        }

        // ---------- Avisos inmediatos (cola VC_Notificaciones) ----------

        public static List<Mensaje> Avisos(JsonElement respuesta, string resumenCola)
        {
            var tipo = Cadena(respuesta, "tipo") ?? "";
            var c = respuesta.GetProperty("concurso");
            return respuesta.GetProperty("perfiles").EnumerateArray()
                .Select(p => tipo == "FICHA" ? AvisoFicha(c, p) : AvisoCambio(c, p, resumenCola))
                .ToList();
        }

        static Mensaje AvisoFicha(JsonElement c, JsonElement p)
        {
            var titulo = Cadena(c, "titulo") ?? "";
            var cuerpo = new StringBuilder();
            cuerpo.Append(Titular(c));
            cuerpo.Append(Datos(c, Entero(p, "puntaje"), false));
            var resumen = Cadena(c, "resumen");
            if (resumen != null)
            {
                cuerpo.Append(Seccion("Resumen de las bases"));
                cuerpo.Append(Parrafo(resumen, 14, Texto));
            }
            var faltantes = Lista(p, "faltantes");
            cuerpo.Append(Seccion("Lo que te falta para participar"));
            cuerpo.Append(faltantes.Length == 0
                ? Parrafo("Tienes todos los documentos que piden las bases.", 14, Texto)
                : Lista(faltantes, Rojo));
            if (c.TryGetProperty("restrictivos", out var rs) && rs.GetArrayLength() > 0)
            {
                cuerpo.Append(Seccion("Requisitos que podrían ser restrictivos"));
                cuerpo.Append(Lista(rs.EnumerateArray().Select(r => Cadena(r, "descripcion") + (Cadena(r, "motivoRestrictivo") is string m ? $" ({m})" : "")).ToArray(), Texto));
                cuerpo.Append(Parrafo("Es una señal para revisar con calma, no una acusación.", 12, Terciario));
            }
            var validada = Cadena(c, "validadaPor") == "HUMANO" ? "La ficha la revisó una persona." : "La ficha la extrajo la IA de las bases.";
            cuerpo.Append(Parrafo($"{validada} Confirma los datos en el documento oficial antes de ofertar.", 12, Terciario));
            cuerpo.Append(Boton("Ver la ficha completa", Cadena(c, "enlace") ?? ""));

            return new Mensaje(Entero(p, "perfilId"), "FICHA", Destinatarios(p), $"Ficha lista: {Corto(titulo)}",
                Documento("Ficha lista", Cadena(p, "empresa") ?? "", cuerpo.ToString()), new[] { Cadena(c, "nog")! });
        }

        static Mensaje AvisoCambio(JsonElement c, JsonElement p, string resumenCola)
        {
            var titulo = Cadena(c, "titulo") ?? "";
            var cuerpo = new StringBuilder();
            cuerpo.Append(Titular(c));
            cuerpo.Append(Datos(c, null, true));
            cuerpo.Append(Seccion("Qué cambió"));
            var cambios = c.TryGetProperty("cambios", out var cs)
                ? cs.EnumerateArray().Select(x => Cadena(x, "resumen") ?? NombreCambio(Cadena(x, "tipo"))).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray()
                : Array.Empty<string>();
            if (cambios.Length == 0 && !string.IsNullOrWhiteSpace(resumenCola)) cambios = new[] { resumenCola };
            cuerpo.Append(cambios.Length == 0 ? Parrafo("Hubo un cambio en la publicación del concurso.", 14, Texto) : Lista(cambios!, Texto));
            cuerpo.Append(Boton("Revisar el concurso", Cadena(c, "enlace") ?? ""));

            return new Mensaje(Entero(p, "perfilId"), "CAMBIO", Destinatarios(p), $"Cambió un concurso que sigues: {Corto(titulo)}",
                Documento("Cambio en un concurso que sigues", Cadena(p, "empresa") ?? "", cuerpo.ToString()), new[] { Cadena(c, "nog")! });
        }

        // ---------- Piezas ----------

        static string FilaOportunidad(JsonElement o)
        {
            var puntaje = Entero(o, "puntaje") ?? 0;
            var preliminar = Cadena(o, "etapa") == "PRELIMINAR";
            var faltantes = o.TryGetProperty("faltantes", out var f) && f.ValueKind == JsonValueKind.Array
                ? f.EnumerateArray().Select(x => x.GetString()).ToArray() : null;
            var nota = preliminar ? null
                : faltantes == null || faltantes.Length == 0 ? "Tienes todos los documentos que piden." : "Te falta: " + string.Join(", ", faltantes);
            return $@"<tr><td style=""padding:14px 0;border-top:1px solid {Regla}"">
  <a href=""{Attr(Cadena(o, "enlace"))}"" style=""color:{Texto};font-weight:600;font-size:15px;line-height:21px;text-decoration:none"">{H(Recortar(Legible(Cadena(o, "titulo")), 120))}</a>
  <div style=""color:{Secundario};font-size:13px;line-height:19px;margin-top:2px"">{H(Legible(Cadena(o, "entidad"), true))} · {H(Modalidad(Cadena(o, "modalidad")))}{Monto(o)}</div>
  <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" style=""margin-top:8px""><tr>
    <td style=""font-size:13px;color:{Texto};padding-right:16px;white-space:nowrap"">{Cierre(o)}</td>
    <td style=""font-size:13px;font-weight:600;color:{Texto};padding-right:8px"">{puntaje}</td>
    <td>{Barra(puntaje, preliminar)}</td>{(preliminar ? $@"
    <td style=""font-size:12px;color:{Terciario};padding-left:8px"">preliminar</td>" : "")}
  </tr></table>
{(nota == null ? "" : $@"  <div style=""color:{(faltantes != null && faltantes.Length > 0 ? Rojo : Terciario)};font-size:12px;line-height:17px;margin-top:6px"">{H(nota)}</div>
")}</td></tr>";
        }

        static string FilaRecordatorio(JsonElement r) => $@"<tr><td style=""padding:12px 0;border-top:1px solid {Regla}"">
  <a href=""{Attr(Cadena(r, "enlace"))}"" style=""color:{Texto};font-weight:600;font-size:14px;line-height:20px;text-decoration:none"">{H(Legible(Cadena(r, "titulo")))}</a>
  <div style=""font-size:13px;line-height:19px;margin-top:2px;color:{Secundario}"">{Cierre(r)} · {(Cadena(r, "seguimiento") == "PARTICIPARE" ? "marcaste que participarás" : "lo estás siguiendo")}</div>
</td></tr>";

        static string FilaDocumento(JsonElement d)
        {
            var dias = Entero(d, "dias") ?? 0;
            var cuando = dias == 0 ? "vence hoy" : dias == 1 ? "vence mañana" : $"vence en {dias} días";
            return $@"<tr><td style=""padding:10px 0;border-top:1px solid {Regla};font-size:14px;color:{Texto}"">{H(Cadena(d, "documento"))}
  <span style=""color:{(dias <= 7 ? Rojo : Secundario)};font-size:13px""> · {cuando} ({Fecha(Cadena(d, "venceEn"))})</span></td></tr>";
        }

        static string Titular(JsonElement c) =>
            $@"<p style=""margin:0 0 4px;color:{Terciario};font-size:12px;font-family:Consolas,Menlo,monospace"">NOG {H(Cadena(c, "nog"))}</p>
<h2 style=""margin:0;font-size:19px;line-height:26px;color:{Texto};font-weight:600"">{H(Legible(Cadena(c, "titulo")))}</h2>
<p style=""margin:4px 0 0;color:{Secundario};font-size:14px;line-height:20px"">{H(Legible(Cadena(c, "entidad"), true))} · {H(Modalidad(Cadena(c, "modalidad")))}</p>";

        static string Datos(JsonElement c, int? puntaje, bool sinPuntaje)
        {
            var celdas = new List<(string, string)> { ("Cierre", Cierre(c)), ("Monto", Monto(c, false) is string m && m.Length > 0 ? m : "—") };
            if (!sinPuntaje && puntaje.HasValue) celdas.Add(("Compatibilidad", $"{puntaje} de 100"));
            var tds = string.Join("", celdas.Select(x =>
                $@"<td style=""padding:12px 16px 12px 0;vertical-align:top""><div style=""color:{Secundario};font-size:12px"">{x.Item1}</div><div style=""color:{Texto};font-size:15px;font-weight:600;margin-top:2px"">{x.Item2}</div></td>"));
            return $@"<table role=""presentation"" cellpadding=""0"" cellspacing=""0"" style=""margin-top:16px;border-top:1px solid {Regla};border-bottom:1px solid {Regla};width:100%""><tr>{tds}</tr></table>";
        }

        static string Barra(int puntaje, bool preliminar)
        {
            var ancho = Math.Max(0, Math.Min(100, puntaje)) * 96 / 100;
            return $@"<table role=""presentation"" cellpadding=""0"" cellspacing=""0"" width=""96"" style=""width:96px;background:{Pista};border-radius:3px""><tr>
<td width=""{ancho}"" style=""width:{ancho}px;height:6px;line-height:6px;font-size:0;background:{(preliminar ? VerdeClaro : Verde)};border-radius:3px"">&nbsp;</td>{(ancho < 96 ? $@"<td style=""height:6px;line-height:6px;font-size:0"">&nbsp;</td>" : "")}
</tr></table>";
        }

        static string Seccion(string titulo) =>
            $@"<h3 style=""margin:28px 0 4px;font-size:15px;line-height:22px;color:{Texto};font-weight:600"">{H(titulo)}</h3>";

        static string Parrafo(string texto, int tamano, string color) =>
            $@"<p style=""margin:12px 0 0;font-size:{tamano}px;line-height:{tamano + 7}px;color:{color}"">{H(texto)}</p>";

        static string Lista(string[] elementos, string color) =>
            "<ul style=\"margin:8px 0 0;padding-left:20px\">" +
            string.Join("", elementos.Select(e => $@"<li style=""margin:4px 0;font-size:14px;line-height:20px;color:{color}"">{H(e)}</li>")) + "</ul>";

        static string Boton(string texto, string url) =>
            $@"<table role=""presentation"" cellpadding=""0"" cellspacing=""0"" style=""margin-top:28px""><tr><td style=""background:{Primario};border-radius:6px"">
<a href=""{Attr(url)}"" style=""display:inline-block;padding:10px 18px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none"">{H(texto)}</a></td></tr></table>";

        static string Documento(string titulo, string empresa, string cuerpo) => $@"<!DOCTYPE html>
<html lang=""es""><head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1""><title>{H(titulo)}</title></head>
<body style=""margin:0;padding:0;background:{Fondo};font-family:{Fuente}"">
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:{Fondo}""><tr><td align=""center"" style=""padding:24px 12px"">
<table role=""presentation"" width=""600"" cellpadding=""0"" cellspacing=""0"" style=""width:100%;max-width:600px"">
<tr><td style=""padding:0 4px 12px;font-size:14px;font-weight:600;color:{Texto}""><span style=""display:inline-block;width:18px;height:18px;border-radius:4px;background:{Verde};vertical-align:-4px;margin-right:8px""></span>Vigía de Contrataciones</td></tr>
<tr><td style=""background:{Tarjeta};border:1px solid {Borde};border-radius:8px;padding:28px"">
<p style=""margin:0;color:{Secundario};font-size:13px"">{H(empresa)}</p>
<h1 style=""margin:2px 0 0;font-size:22px;line-height:30px;color:{Texto};font-weight:600"">{H(titulo)}</h1>
{cuerpo}
</td></tr>
<tr><td style=""padding:16px 4px;color:{Terciario};font-size:12px;line-height:18px"">Recibes este correo porque administras el perfil de {H(empresa)} en Vigía de Contrataciones. Los datos provienen de Guatecompras; confírmalos en el portal antes de ofertar.</td></tr>
</table></td></tr></table></body></html>";

        // ---------- Formato ----------

        static string Cierre(JsonElement o)
        {
            var fecha = Cadena(o, "fechaCierre");
            if (fecha == null) return "Sin fecha de cierre";
            var dias = Entero(o, "diasParaCierre");
            var cuando = dias switch { 0 => "cierra hoy", 1 => "cierra mañana", int d when d > 1 => $"cierra en {d} días", _ => "cerrado" };
            var color = dias is int x && x <= 1 ? Rojo : Texto;
            return $@"<span style=""color:{color}"">{H(char.ToUpper(cuando[0]) + cuando[1..])}</span> <span style=""color:{Terciario}"">({Fecha(fecha)})</span>";
        }

        static string Monto(JsonElement o, bool conSeparador = true)
        {
            if (!o.TryGetProperty("monto", out var m) || m.ValueKind != JsonValueKind.Number) return "";
            var texto = "Q " + m.GetDecimal().ToString("#,##0.00", CultureInfo.InvariantCulture);
            return conSeparador ? " · " + texto : texto;
        }

        static string Fecha(string iso) =>
            DateTime.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var f) ? f.ToString("d MMM", Es).Replace(".", "") : H(iso);

        /// <summary>Modalidad sin el artículo de ley: "Cotización (Art. 38 LCE)" → "Cotización".</summary>
        public static string Modalidad(string m) =>
            m == null ? "" : System.Text.RegularExpressions.Regex.Replace(m, @"\s*\(.*\)\s*$", "").Replace(" con Oferta Electrónica", "");

        /// <summary>
        /// El portal publica títulos y entidades en MAYÚSCULAS: títulos en tipo oración, entidades en tipo título.
        /// Las siglas entre guiones o paréntesis (-IGSS-) se conservan. Igual que el pipe legible del dashboard.
        /// </summary>
        public static string Legible(string texto, bool entidad = false)
        {
            if (string.IsNullOrEmpty(texto)) return "";
            var letras = texto.Where(char.IsLetter).ToArray();
            if (letras.Length == 0 || letras.Count(char.IsLower) / (double)letras.Length > 0.3) return texto;
            var menores = new HashSet<string> { "de", "del", "la", "las", "los", "el", "y", "e", "o", "u", "en", "para", "por", "a", "al", "con", "sin" };
            var primera = true;
            return string.Join(" ", texto.Split(' ').Select(p =>
            {
                if (p.Length == 0) return p;
                if (System.Text.RegularExpressions.Regex.IsMatch(p, @"^[-(].*[-)][,.]?$")) { primera = false; return p; }
                var m = p.ToLower(Es);
                var esPrimera = primera;
                primera = p.EndsWith(".") || p.EndsWith(":") || p.EndsWith(";");
                return esPrimera || (entidad && !menores.Contains(m)) ? char.ToUpper(m[0], Es) + m[1..] : m;
            }));
        }

        static string Corto(string t) => Recortar(Legible(t), 70);

        static string Recortar(string t, int maximo) => t.Length <= maximo ? t : t[..(maximo - 1)].TrimEnd(' ', ',', ';', '.') + "…";

        /// <summary>Las filas van dentro de su propia tabla: sueltas, el cliente de correo las saca de la tarjeta.</summary>
        static string Tabla(IEnumerable<string> filas) =>
            $@"<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""width:100%;margin-top:4px"">{string.Concat(filas)}</table>";

        static string NombreCambio(string tipo) => tipo switch
        {
            "DOCUMENTO" => "Se publicaron o modificaron documentos.",
            "FECHA" => "Cambió la fecha de cierre.",
            "ESTADO" => "Cambió el estado en Guatecompras.",
            "ACLARACION" => "Se publicó una aclaración.",
            _ => tipo,
        };

        static string[] Destinatarios(JsonElement p) =>
            p.GetProperty("destinatarios").EnumerateArray().Select(d => Cadena(d, "correo")).Where(c => !string.IsNullOrWhiteSpace(c)).ToArray()!;

        static string[] Lista(JsonElement e, string propiedad) =>
            e.TryGetProperty(propiedad, out var a) && a.ValueKind == JsonValueKind.Array ? a.EnumerateArray().Select(x => x.GetString() ?? "").ToArray() : Array.Empty<string>();

        static string Cadena(JsonElement e, string propiedad) =>
            e.TryGetProperty(propiedad, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        static int? Entero(JsonElement e, string propiedad) =>
            e.TryGetProperty(propiedad, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;

        /// <summary>Escapa solo lo que rompe el HTML; las tildes quedan tal cual (el correo va en UTF-8).</summary>
        static string H(string s) => (s ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
        static string Attr(string s) => H(s);
    }
}
