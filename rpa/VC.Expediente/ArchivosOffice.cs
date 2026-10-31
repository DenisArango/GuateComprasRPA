using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security;
using System.Text;

namespace VC.Expediente
{
    /// <summary>Una hoja del libro: encabezados (en negrita) y filas de texto.</summary>
    public sealed record Hoja(string Nombre, IReadOnlyList<string> Encabezados, IReadOnlyList<IReadOnlyList<string>> Filas, IReadOnlyList<double> Anchos);

    /// <summary>Un párrafo del documento Word. Estilo: "Titulo", "Subtitulo", "Negrita" o "" (normal).</summary>
    public sealed record Parrafo(string Texto, string Estilo = "");

    /// <summary>
    /// Escribe .xlsx y .docx mínimos (Office Open XML) sin Excel ni Word instalados y sin paquetes externos.
    /// Suficiente para el checklist y los borradores del expediente (RF-EXP-02, RF-EXP-03).
    /// </summary>
    public static class ArchivosOffice
    {
        public static void Excel(string ruta, IReadOnlyList<Hoja> hojas)
        {
            using var zip = Crear(ruta);
            Entrada(zip, "[Content_Types].xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
                string.Concat(hojas.Select((_, i) => $"<Override PartName=\"/xl/worksheets/sheet{i + 1}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>")) +
                "</Types>");
            Entrada(zip, "_rels/.rels", Relaciones(("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "xl/workbook.xml")));
            Entrada(zip, "xl/workbook.xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>" +
                string.Concat(hojas.Select((h, i) => $"<sheet name=\"{X(NombreHoja(h.Nombre))}\" sheetId=\"{i + 1}\" r:id=\"rId{i + 1}\"/>")) + "</sheets></workbook>");
            Entrada(zip, "xl/_rels/workbook.xml.rels", Relaciones(hojas.Select((_, i) => ($"rId{i + 1}", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet", $"worksheets/sheet{i + 1}.xml"))
                .Append(($"rId{hojas.Count + 1}", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", "styles.xml")).ToArray()));
            // Estilo 1: encabezado en negrita con fondo gris; estilo 2: texto ajustado arriba
            Entrada(zip, "xl/styles.xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">" +
                "<fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>" +
                "<fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFE7E6E6\"/></patternFill></fill></fills>" +
                "<borders count=\"1\"><border/></borders><cellStyleXfs count=\"1\"><xf/></cellStyleXfs>" +
                "<cellXfs count=\"3\"><xf/><xf fontId=\"1\" fillId=\"2\" applyFont=\"1\" applyFill=\"1\"/><xf applyAlignment=\"1\"><alignment wrapText=\"1\" vertical=\"top\"/></xf></cellXfs></styleSheet>");
            for (var i = 0; i < hojas.Count; i++) Entrada(zip, $"xl/worksheets/sheet{i + 1}.xml", HojaXml(hojas[i]));
        }

        public static void Word(string ruta, IReadOnlyList<Parrafo> parrafos)
        {
            using var zip = Crear(ruta);
            Entrada(zip, "[Content_Types].xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>");
            Entrada(zip, "_rels/.rels", Relaciones(("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument", "word/document.xml")));
            var cuerpo = new StringBuilder();
            foreach (var p in parrafos)
            {
                var (tamano, negrita, centrado) = p.Estilo switch { "Titulo" => (32, true, true), "Subtitulo" => (26, true, false), "Negrita" => (22, true, false), _ => (22, false, false) };
                cuerpo.Append("<w:p><w:pPr>").Append(centrado ? "<w:jc w:val=\"center\"/>" : "").Append("<w:spacing w:after=\"160\"/></w:pPr>");
                var lineas = (p.Texto ?? "").Split('\n');
                cuerpo.Append("<w:r><w:rPr><w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\"/>").Append(negrita ? "<w:b/>" : "").Append($"<w:sz w:val=\"{tamano}\"/></w:rPr>");
                for (var i = 0; i < lineas.Length; i++)
                {
                    if (i > 0) cuerpo.Append("<w:br/>");
                    cuerpo.Append("<w:t xml:space=\"preserve\">").Append(X(lineas[i])).Append("</w:t>");
                }
                cuerpo.Append("</w:r></w:p>");
            }
            Entrada(zip, "word/document.xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>" +
                cuerpo + "<w:sectPr><w:pgSz w:w=\"12240\" w:h=\"15840\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr></w:body></w:document>");
        }

        static string HojaXml(Hoja h)
        {
            var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
            sb.Append("<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>");
            if (h.Anchos.Count > 0)
                sb.Append("<cols>").Append(string.Concat(h.Anchos.Select((a, i) => $"<col min=\"{i + 1}\" max=\"{i + 1}\" width=\"{a.ToString(System.Globalization.CultureInfo.InvariantCulture)}\" customWidth=\"1\"/>"))).Append("</cols>");
            sb.Append("<sheetData>");
            Fila(sb, 1, h.Encabezados, 1);
            for (var i = 0; i < h.Filas.Count; i++) Fila(sb, i + 2, h.Filas[i], 2);
            sb.Append("</sheetData>");
            if (h.Filas.Count > 0) sb.Append($"<autoFilter ref=\"A1:{Columna(h.Encabezados.Count - 1)}{h.Filas.Count + 1}\"/>");
            return sb.Append("</worksheet>").ToString();
        }

        static void Fila(StringBuilder sb, int numero, IReadOnlyList<string> celdas, int estilo)
        {
            sb.Append($"<row r=\"{numero}\">");
            for (var c = 0; c < celdas.Count; c++)
                sb.Append($"<c r=\"{Columna(c)}{numero}\" t=\"inlineStr\" s=\"{estilo}\"><is><t xml:space=\"preserve\">{X(celdas[c])}</t></is></c>");
            sb.Append("</row>");
        }

        /// <summary>0 → A, 25 → Z, 26 → AA.</summary>
        public static string Columna(int indice)
        {
            var s = "";
            for (var n = indice + 1; n > 0; n = (n - 1) / 26) s = (char)('A' + (n - 1) % 26) + s;
            return s;
        }

        static string NombreHoja(string nombre)
        {
            var limpio = new string((nombre ?? "Hoja").Where(c => !"[]:*?/\\".Contains(c)).ToArray());
            return limpio.Length > 31 ? limpio[..31] : limpio;
        }

        static string Relaciones(params (string id, string tipo, string destino)[] rels) =>
            "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
            string.Concat(rels.Select(r => $"<Relationship Id=\"{r.id}\" Type=\"{r.tipo}\" Target=\"{r.destino}\"/>")) + "</Relationships>";

        /// <summary>Escapa para XML y quita caracteres de control que Office no acepta.</summary>
        static string X(string texto) =>
            SecurityElement.Escape(new string((texto ?? "").Where(c => c == '\t' || c == '\n' || c == '\r' || c >= ' ').ToArray()));

        static ZipArchive Crear(string ruta)
        {
            if (File.Exists(ruta)) File.Delete(ruta);
            return ZipFile.Open(ruta, ZipArchiveMode.Create);
        }

        static void Entrada(ZipArchive zip, string nombre, string contenido)
        {
            using var w = new StreamWriter(zip.CreateEntry(nombre, CompressionLevel.Optimal).Open(), new UTF8Encoding(false));
            w.Write(contenido);
        }
    }
}
