using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace VC.Expediente
{
    /// <summary>
    /// Reglas del expediente de oferta (CU-16) sin dependencias de UiPath, para probarlas con dotnet test.
    /// Los datos vienen de GET /robot/expedientes/:nog (la API decide el estado de cada requisito).
    /// </summary>
    public static class Expediente
    {
        public const string CarpetaBases = "01 Bases del concurso";
        public const string CarpetaEmpresa = "02 Documentos de la empresa";
        public const string CarpetaBorradores = "03 Borradores";
        public const string Checklist = "Checklist.xlsx";
        /// <summary>Subcarpeta de VC_CarpetaExpedientes donde la empresa guarda sus documentos, nombrados por código (RTU.pdf…).</summary>
        public const string DocumentosEmpresa = "_DocumentosEmpresa";

        static readonly CultureInfo Es = new CultureInfo("es-GT");

        /// <summary>
        /// Carpeta del expediente. ACTUALIZAR reutiliza Expediente_{NOG}; NUEVA crea la siguiente versión libre
        /// (Expediente_{NOG}, _v2, _v3…) (CU-16 FA-2).
        /// </summary>
        public static string Carpeta(string carpetaBase, string nog, string modo, Func<string, bool> existe)
        {
            var principal = Path.Combine(carpetaBase, $"Expediente_{nog}");
            if (string.Equals(modo, "ACTUALIZAR", StringComparison.OrdinalIgnoreCase) || !existe(principal)) return principal;
            for (var v = 2; ; v++)
            {
                var candidata = $"{principal}_v{v}";
                if (!existe(candidata)) return candidata;
            }
        }

        /// <summary>
        /// Archivo de la empresa para un código del catálogo: su nombre empieza con el código seguido de un separador
        /// o del final ("RTU.pdf", "RTU 2026.pdf", "SOLVENCIA_FISCAL-oct.pdf"). Si hay varios, el de nombre mayor (más reciente por convención).
        /// </summary>
        public static string ArchivoDeEmpresa(string codigo, IEnumerable<string> archivos)
        {
            var patron = new Regex("^" + Regex.Escape(codigo) + @"($|[\s_\-.(])", RegexOptions.IgnoreCase);
            return archivos
                .Where(a => patron.IsMatch(Path.GetFileNameWithoutExtension(a)))
                // Con "_" como separador, un código no debe tomar el archivo de otro código más largo que empiece igual
                .Where(a => !OtroCodigoMasLargo(codigo, Path.GetFileNameWithoutExtension(a)))
                .OrderByDescending(a => Path.GetFileName(a), StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();
        }

        static readonly string[] Codigos =
        {
            "RTU", "RGAE", "PATENTE_EMPRESA", "PATENTE_SOCIEDAD", "SOLVENCIA_FISCAL", "DPI_REPRESENTANTE", "NOMBRAMIENTO",
            "FIANZA_SOSTENIMIENTO", "FIANZA_CUMPLIMIENTO", "DECLARACION_JURADA", "CARTA_DISTRIBUIDOR", "REGISTRO_SANITARIO",
            "EXPERIENCIA", "ESTADOS_FINANCIEROS",
        };

        static bool OtroCodigoMasLargo(string codigo, string nombre) =>
            Codigos.Any(c => c.Length > codigo.Length && c.StartsWith(codigo, StringComparison.OrdinalIgnoreCase) && nombre.StartsWith(c, StringComparison.OrdinalIgnoreCase));

        /// <summary>Nombre de archivo válido en Windows.</summary>
        public static string NombreSeguro(string nombre)
        {
            var invalidos = Path.GetInvalidFileNameChars();
            var limpio = new string((nombre ?? "documento").Select(c => invalidos.Contains(c) ? '_' : c).ToArray()).Trim();
            return limpio.Length == 0 ? "documento" : limpio;
        }

        /// <summary>Hojas de Checklist.xlsx: requisitos con su estado (RF-EXP-02) y los datos del concurso.</summary>
        public static IReadOnlyList<Hoja> HojasChecklist(JsonElement datos, IReadOnlyDictionary<string, string> copiados)
        {
            var filas = new List<IReadOnlyList<string>>();
            foreach (var f in datos.GetProperty("checklist").EnumerateArray())
            {
                var codigo = Texto(f, "documento");
                var estado = Texto(f, "estado");
                var archivo = codigo.Length == 0 ? ""
                    : copiados.TryGetValue(codigo, out var nombre) ? $"{CarpetaEmpresa}\\{nombre}"
                    : estado == "LISTO" ? $"No se encontró en {DocumentosEmpresa}" : "";
                filas.Add(new[]
                {
                    Texto(f, "requisito"), Capital(Texto(f, "tipo")), f.GetProperty("obligatorio").GetBoolean() ? "Sí" : "No",
                    Texto(f, "nombreDocumento"), EstadoLegible(estado), Fecha(Texto(f, "venceEn")), Texto(f, "referencia"), archivo,
                });
            }

            var c = datos.GetProperty("concurso");
            var fi = datos.GetProperty("ficha");
            var p = datos.GetProperty("perfil");
            var garantias = fi.TryGetProperty("garantias", out var g) && g.ValueKind == JsonValueKind.Array
                ? string.Join("\n", g.EnumerateArray().Select(Garantia)) : "";
            var criterios = string.Join("\n", fi.GetProperty("criterios").EnumerateArray()
                .Select(x => Texto(x, "criterio") + (x.TryGetProperty("ponderacion", out var pd) && pd.ValueKind == JsonValueKind.Number ? $" ({pd.GetDecimal().ToString("0.##", Es)} pts)" : "")));
            var concurso = new List<IReadOnlyList<string>>
            {
                new[] { "NOG", Texto(c, "nog") },
                new[] { "Concurso", Texto(c, "titulo") },
                new[] { "Entidad", Texto(c, "entidad") },
                new[] { "Unidad compradora", Texto(c, "unidadCompradora") },
                new[] { "Modalidad", Texto(c, "modalidad") },
                new[] { "Cierre de ofertas", Fecha(Texto(c, "fechaCierre")) },
                new[] { "Monto estimado", fi.TryGetProperty("montoEstimado", out var m) && m.ValueKind == JsonValueKind.Number ? "Q " + m.GetDecimal().ToString("#,##0.00", Es) : "No publicado" },
                new[] { "Objeto", Texto(fi, "objeto") },
                new[] { "Resumen", Texto(fi, "resumen") },
                new[] { "Plazo de entrega", Texto(fi, "plazoEntrega") },
                new[] { "Lugar de entrega", Texto(fi, "lugarEntrega") },
                new[] { "Garantías", garantias },
                new[] { "Criterios de calificación", criterios },
                new[] { "Empresa", Texto(p, "nombre") + (Texto(p, "nit").Length > 0 ? $" (NIT {Texto(p, "nit")})" : "") },
                new[] { "Documentos vigentes al", Fecha(Texto(datos, "fechaReferencia")) },
                new[] { "Concurso en Guatecompras", Texto(c, "url") },
            };

            return new[]
            {
                new Hoja("Checklist", new[] { "Requisito", "Tipo", "Obligatorio", "Documento", "Estado", "Vence", "Página", "Archivo en el expediente" }, filas,
                    new double[] { 60, 13, 12, 34, 14, 12, 9, 42 }),
                new Hoja("Concurso", new[] { "Dato", "Valor" }, concurso, new double[] { 26, 100 }),
            };
        }

        /// <summary>Borradores Word con los datos de la empresa y del concurso (RF-EXP-03). Lo que falta va entre corchetes.</summary>
        public static IReadOnlyList<(string archivo, IReadOnlyList<Parrafo> parrafos)> Borradores(JsonElement datos, DateTime hoy)
        {
            var c = datos.GetProperty("concurso");
            var fi = datos.GetProperty("ficha");
            var p = datos.GetProperty("perfil");
            var empresa = Texto(p, "nombre");
            var nit = Texto(p, "nit").Length > 0 ? Texto(p, "nit") : "[NIT]";
            var nog = Texto(c, "nog");
            var fecha = $"Guatemala, {hoy.ToString("d 'de' MMMM 'de' yyyy", Es)}";
            var destinatario = Texto(c, "unidadCompradora").Length > 0 ? Texto(c, "unidadCompradora") : Texto(c, "entidad");

            var carta = new List<Parrafo>
            {
                new Parrafo(fecha),
                new Parrafo($"Señores\n{destinatario}\n{Texto(c, "entidad")}\nPresente"),
                new Parrafo($"Referencia: NOG {nog} · {Texto(c, "titulo")}", "Negrita"),
                new Parrafo("Estimados señores:"),
                new Parrafo($"{empresa}, con NIT {nit}, presenta su oferta para el concurso identificado con el NOG {nog}, " +
                            $"cuyo objeto es: {Texto(fi, "objeto")}. Nos sometemos a lo establecido en las bases del concurso, " +
                            "en la Ley de Contrataciones del Estado y en su reglamento."),
                new Parrafo("Monto total de la oferta: Q [monto en números] ([monto en letras]), con impuestos incluidos."),
                new Parrafo($"Plazo de entrega: {Valor(fi, "plazoEntrega", "[plazo de entrega]")}. Lugar de entrega: {Valor(fi, "lugarEntrega", "[lugar de entrega]")}."),
                new Parrafo("Adjuntamos los documentos requeridos en las bases, detallados en el checklist del expediente."),
                new Parrafo("Atentamente,"),
                new Parrafo($"\n\n[Nombre del representante legal]\nRepresentante legal\n{empresa}"),
            };

            var declaracion = new List<Parrafo>
            {
                new Parrafo("DECLARACIÓN JURADA", "Titulo"),
                new Parrafo("Borrador para formalizar ante notario en el papel y con los timbres que correspondan.", "Negrita"),
                new Parrafo($"En la ciudad de Guatemala, el [día] de [mes] de {hoy.Year}, yo, [nombre del representante legal], " +
                            $"actuando como representante legal de {empresa}, con NIT {nit}, para efectos del concurso NOG {nog} " +
                            $"de {Texto(c, "entidad")}, DECLARO BAJO JURAMENTO:"),
                new Parrafo("a) Que mi representada no está comprendida en ninguna de las prohibiciones del artículo 80 de la Ley de Contrataciones del Estado."),
                new Parrafo("b) Que mi representada no es deudora morosa del Estado ni de las entidades a que se refiere el artículo 1 de dicha ley."),
                new Parrafo("c) [Otras declaraciones que pidan las bases del concurso; revisar el checklist y las bases.]"),
                new Parrafo("\n\n[Firma del representante legal]\n[Auténtica del notario]"),
            };

            return new (string, IReadOnlyList<Parrafo>)[]
            {
                ("Carta de presentación de la oferta (borrador).docx", carta),
                ("Declaración jurada (borrador).docx", declaracion),
            };
        }

        /// <summary>Texto para el cuadro final del robot.</summary>
        public static string Resumen(JsonElement datos, string carpeta, int bases, int copiados, IReadOnlyCollection<string> sinArchivo)
        {
            var filas = datos.GetProperty("checklist").EnumerateArray().ToList();
            int Contar(string estado) => filas.Count(f => Texto(f, "estado") == estado);
            var lineas = new List<string>
            {
                $"Expediente del NOG {Texto(datos.GetProperty("concurso"), "nog")} listo en:",
                carpeta,
                "",
                $"Bases y documentos del concurso: {bases}",
                $"Documentos de la empresa copiados: {copiados}",
                $"Requisitos: {Contar("LISTO")} listos, {Contar("FALTANTE")} faltantes, {Contar("VENCIDO")} vencidos, {Contar("REVISAR")} por revisar",
            };
            var faltantes = datos.GetProperty("faltantes").EnumerateArray().Select(f => f.GetString()).ToList();
            if (faltantes.Count > 0) lineas.Add("Falta conseguir: " + string.Join(", ", NombresDe(datos, faltantes)));
            if (sinArchivo.Count > 0) lineas.Add($"Registrados en el perfil pero sin archivo en {DocumentosEmpresa}: " + string.Join(", ", NombresDe(datos, sinArchivo)));
            lineas.Add("");
            lineas.Add("Revise Checklist.xlsx y complete los borradores antes de presentar la oferta.");
            return string.Join(Environment.NewLine, lineas);
        }

        static IEnumerable<string> NombresDe(JsonElement datos, IEnumerable<string> codigos)
        {
            var nombres = datos.GetProperty("checklist").EnumerateArray()
                .Where(f => Texto(f, "documento").Length > 0)
                .GroupBy(f => Texto(f, "documento")).ToDictionary(g => g.Key, g => Texto(g.First(), "nombreDocumento"));
            return codigos.Select(c => nombres.TryGetValue(c, out var n) && n.Length > 0 ? n : c);
        }

        static string Garantia(JsonElement g)
        {
            if (g.ValueKind == JsonValueKind.String) return g.GetString();
            if (g.ValueKind != JsonValueKind.Object) return g.ToString();
            var partes = new List<string> { Texto(g, "tipo") };
            foreach (var campo in new[] { "porcentaje", "vigencia", "descripcion" })
                if (g.TryGetProperty(campo, out var v) && v.ValueKind != JsonValueKind.Null)
                    partes.Add(campo == "porcentaje" && v.ValueKind == JsonValueKind.Number ? $"{v.GetDecimal().ToString("0.##", Es)} %" : v.ToString());
            return string.Join(" · ", partes.Where(x => x.Length > 0));
        }

        static string EstadoLegible(string estado) => estado switch
        {
            "LISTO" => "Listo", "FALTANTE" => "Faltante", "VENCIDO" => "Vencido", "REVISAR" => "Revisar", _ => estado,
        };

        static string Capital(string s) => s.Length == 0 ? s : char.ToUpper(s[0], Es) + s[1..];

        static string Fecha(string iso) =>
            DateTime.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d) ? d.ToString("dd/MM/yyyy", Es) : iso;

        static string Valor(JsonElement e, string propiedad, string siFalta) { var v = Texto(e, propiedad); return v.Length > 0 ? v : siFalta; }

        public static string Texto(JsonElement e, string propiedad) =>
            e.TryGetProperty(propiedad, out var v) && v.ValueKind != JsonValueKind.Null ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString()) : "";
    }
}
