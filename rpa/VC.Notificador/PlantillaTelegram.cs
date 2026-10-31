using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace VC.Notificador
{
    /// <summary>Un mensaje de Telegram para los chats vinculados a un perfil.</summary>
    public sealed record MensajeTelegram(int? PerfilId, string Tipo, string[] Chats, string Asunto, string Texto, string[] Nogs);

    /// <summary>
    /// Versión corta de los avisos para Telegram (RF-NOT-02), con los mismos datos que los correos de PlantillaCorreo.
    /// Formato HTML de Telegram (solo b, i, a); máximo 4096 caracteres por mensaje. Sin dependencias de UiPath.
    /// </summary>
    public static class PlantillaTelegram
    {
        const int MaxOportunidades = 8;
        const int MaxCaracteres = 4000;
        static readonly CultureInfo Es = new CultureInfo("es-GT");

        public static List<MensajeTelegram> Resumenes(JsonElement respuesta, DateTime hoy)
        {
            var webUrl = Cadena(respuesta, "webUrl");
            var lista = new List<MensajeTelegram>();
            foreach (var p in respuesta.GetProperty("perfiles").EnumerateArray())
            {
                var chats = Chats(p);
                if (chats.Length == 0) continue;
                var oportunidades = p.GetProperty("oportunidades").EnumerateArray().ToList();
                var total = p.TryGetProperty("oportunidadesTotal", out var t) ? t.GetInt32() : oportunidades.Count;
                var recordatorios = p.GetProperty("recordatorios").EnumerateArray().ToList();
                var documentos = p.GetProperty("documentosPorVencer").EnumerateArray().ToList();

                var sb = new StringBuilder();
                sb.Append($"<b>Vigía de Contrataciones · {H(hoy.ToString("d 'de' MMMM", Es))}</b>\n{H(Cadena(p, "empresa"))}\n");
                if (oportunidades.Count > 0)
                {
                    sb.Append($"\n<b>{(total == 1 ? "1 oportunidad nueva" : $"{total} oportunidades nuevas")}</b>\n");
                    foreach (var o in oportunidades.Take(MaxOportunidades)) sb.Append(Linea(o, true));
                    if (total > MaxOportunidades) sb.Append($"…y {total - MaxOportunidades} más en el dashboard.\n");
                }
                if (recordatorios.Count > 0)
                {
                    sb.Append("\n<b>Por cerrar</b>\n");
                    foreach (var r in recordatorios) sb.Append(Linea(r, false));
                }
                if (documentos.Count > 0)
                {
                    sb.Append("\n<b>Documentos por vencer</b>\n");
                    foreach (var d in documentos)
                        sb.Append($"• {H(Cadena(d, "documento"))}: {(Entero(d, "dias") is 0 ? "vence hoy" : $"vence en {Entero(d, "dias")} días")}\n");
                }
                if (!string.IsNullOrEmpty(webUrl)) sb.Append($"\n<a href=\"{A(webUrl)}\">Abrir el dashboard</a>");

                lista.Add(new MensajeTelegram(Entero(p, "perfilId"), "RESUMEN", chats, $"Resumen diario · {Cadena(p, "empresa")}",
                    Limitar(sb.ToString()), oportunidades.Select(o => Cadena(o, "nog")).Where(n => n.Length > 0).ToArray()));
            }
            return lista;
        }

        public static List<MensajeTelegram> Avisos(JsonElement respuesta, string resumenCola)
        {
            var tipo = Cadena(respuesta, "tipo");
            var c = respuesta.GetProperty("concurso");
            var lista = new List<MensajeTelegram>();
            foreach (var p in respuesta.GetProperty("perfiles").EnumerateArray())
            {
                var chats = Chats(p);
                if (chats.Length == 0) continue;
                var sb = new StringBuilder();
                string asunto;
                if (tipo == "FICHA")
                {
                    asunto = $"Ficha lista: {Corto(Cadena(c, "titulo"))}";
                    sb.Append($"<b>Ficha lista</b> · compatibilidad {Entero(p, "puntaje")}\n");
                    sb.Append(Concurso(c));
                    if (Cadena(c, "resumen").Length > 0) sb.Append($"\n{H(Cadena(c, "resumen"))}\n");
                    var faltantes = Lista(p, "faltantes");
                    sb.Append(faltantes.Length == 0 ? "\nTienes todos los documentos que piden las bases.\n" : $"\n<b>Te falta:</b> {H(string.Join(", ", faltantes))}\n");
                }
                else
                {
                    asunto = $"Cambió un concurso que sigues: {Corto(Cadena(c, "titulo"))}";
                    sb.Append("<b>Cambió un concurso que sigues</b>\n");
                    sb.Append(Concurso(c));
                    var cambios = c.TryGetProperty("cambios", out var cs)
                        ? cs.EnumerateArray().Select(x => Cadena(x, "resumen")).Where(x => x.Length > 0).ToList() : new List<string>();
                    if (cambios.Count == 0 && !string.IsNullOrWhiteSpace(resumenCola)) cambios.Add(resumenCola);
                    sb.Append('\n').Append(cambios.Count == 0 ? "Hubo un cambio en la publicación del concurso.\n" : string.Concat(cambios.Select(x => $"• {H(x)}\n")));
                }
                if (Cadena(c, "enlace").Length > 0) sb.Append($"\n<a href=\"{A(Cadena(c, "enlace"))}\">Ver el concurso</a>");
                lista.Add(new MensajeTelegram(Entero(p, "perfilId"), tipo, chats, asunto, Limitar(sb.ToString()), new[] { Cadena(c, "nog") }));
            }
            return lista;
        }

        static string Linea(JsonElement o, bool conPuntaje)
        {
            var titulo = PlantillaCorreo.Legible(Cadena(o, "titulo"));
            var enlace = Cadena(o, "enlace");
            var nombre = enlace.Length > 0 ? $"<a href=\"{A(enlace)}\">{H(Recortar(titulo, 90))}</a>" : H(Recortar(titulo, 90));
            var datos = new List<string> { PlantillaCorreo.Legible(Cadena(o, "entidad"), true) };
            if (o.TryGetProperty("monto", out var m) && m.ValueKind == JsonValueKind.Number) datos.Add("Q " + m.GetDecimal().ToString("#,##0", CultureInfo.InvariantCulture));
            datos.Add(Cierre(o));
            if (conPuntaje && Entero(o, "puntaje") is int puntaje) datos.Add($"compatibilidad {puntaje}");
            return $"• {nombre}\n  {H(string.Join(" · ", datos.Where(d => d.Length > 0)))}\n";
        }

        static string Concurso(JsonElement c) =>
            $"{H(PlantillaCorreo.Legible(Cadena(c, "titulo")))}\n{H(PlantillaCorreo.Legible(Cadena(c, "entidad"), true))} · NOG {H(Cadena(c, "nog"))} · {H(Cierre(c))}\n";

        static string Cierre(JsonElement o) => Entero(o, "diasParaCierre") switch
        {
            0 => "cierra hoy",
            1 => "cierra mañana",
            int d when d > 1 => $"cierra en {d} días",
            int => "cerrado",
            _ => "",
        };

        static string[] Chats(JsonElement p) =>
            p.TryGetProperty("telegram", out var t) && t.ValueKind == JsonValueKind.Array
                ? t.EnumerateArray().Select(x => x.ToString()).Where(x => x.Length > 0).ToArray() : Array.Empty<string>();

        static string Limitar(string texto) => texto.Length <= MaxCaracteres ? texto : texto[..MaxCaracteres].TrimEnd() + "\n…";

        static string Corto(string t) { var l = PlantillaCorreo.Legible(t); return Recortar(l, 70); }

        static string Recortar(string t, int maximo) => t.Length <= maximo ? t : t[..(maximo - 1)].TrimEnd(' ', ',', ';', '.') + "…";

        /// <summary>Escape del modo HTML de Telegram: solo &amp;, &lt; y &gt;.</summary>
        static string H(string s) => (s ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

        static string A(string s) => H(s).Replace("\"", "&quot;");

        static string[] Lista(JsonElement e, string propiedad) =>
            e.TryGetProperty(propiedad, out var a) && a.ValueKind == JsonValueKind.Array ? a.EnumerateArray().Select(x => x.GetString() ?? "").ToArray() : Array.Empty<string>();

        static string Cadena(JsonElement e, string propiedad) =>
            e.TryGetProperty(propiedad, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";

        static int? Entero(JsonElement e, string propiedad) =>
            e.TryGetProperty(propiedad, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;
    }
}
