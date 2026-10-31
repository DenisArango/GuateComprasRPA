using System.IO.Compression;
using System.Text.Json;
using System.Xml.Linq;
using VC.Expediente;

// Respuesta de GET /robot/expedientes/:nog con la forma que devuelve la API (api/src/routes/robot/expedientes.ts)
public class ExpedienteTests
{
    const string Json = """
    {
      "concurso": { "nog": "32557469", "titulo": "ADQUISICIÓN DE 10 COMPUTADORAS DE ESCRITORIO", "entidad": "COPADEH", "unidadCompradora": "Unidad de Compras",
                    "modalidad": "Compra Directa", "fechaCierre": "2026-11-03", "url": "https://www.guatecompras.gt/concursos/consultaConcurso.aspx?nog=32557469" },
      "ficha": { "resumen": "Compra de 10 computadoras.", "objeto": "10 computadoras de escritorio", "montoEstimado": 85000.5, "plazoEntrega": "15 días",
                 "lugarEntrega": null, "fechaLimiteOfertas": null, "garantias": [ { "tipo": "Seguro de caución de cumplimiento", "porcentaje": 10, "pagina": 4 } ],
                 "criterios": [ { "criterio": "Precio", "ponderacion": 100 } ], "validadaPor": "HUMANO" },
      "perfil": { "id": 2, "nombre": "Empresa & Cía. <prueba>", "nit": "1234567-8" },
      "documentosConcurso": [ { "id": 10, "nombre": "32557469@BASES.pdf", "tipo": "BASES" } ],
      "checklist": [
        { "requisito": "RTU actualizado", "tipo": "legal", "obligatorio": true, "documento": "RTU", "nombreDocumento": "Registro Tributario Unificado (RTU)", "estado": "LISTO", "venceEn": null, "referencia": "p. 3" },
        { "requisito": "Solvencia fiscal", "tipo": "legal", "obligatorio": true, "documento": "SOLVENCIA_FISCAL", "nombreDocumento": "Solvencia fiscal", "estado": "VENCIDO", "venceEn": "2026-09-30", "referencia": null },
        { "requisito": "DPI del representante", "tipo": "legal", "obligatorio": true, "documento": "DPI_REPRESENTANTE", "nombreDocumento": "DPI del representante legal", "estado": "FALTANTE", "venceEn": null, "referencia": "p. 5" },
        { "requisito": "Garantía de 1 año", "tipo": "tecnico", "obligatorio": true, "documento": null, "nombreDocumento": null, "estado": "REVISAR", "venceEn": null, "referencia": "p. 2" },
        { "requisito": "RGAE", "tipo": "legal", "obligatorio": true, "documento": "RGAE", "nombreDocumento": "Constancia de inscripción en el RGAE", "estado": "LISTO", "venceEn": "2027-03-31", "referencia": null }
      ],
      "documentosACopiar": [ { "codigo": "RTU", "nombre": "Registro Tributario Unificado (RTU)" }, { "codigo": "RGAE", "nombre": "Constancia de inscripción en el RGAE" } ],
      "faltantes": [ "SOLVENCIA_FISCAL", "DPI_REPRESENTANTE" ],
      "fechaReferencia": "2026-11-03"
    }
    """;

    static JsonElement Datos() => JsonDocument.Parse(Json).RootElement;

    [Fact]
    public void Carpeta_nueva_toma_la_siguiente_version_libre_y_actualizar_reutiliza_la_principal()
    {
        var existentes = new HashSet<string> { Path.Combine("C:\\Exp", "Expediente_1234567"), Path.Combine("C:\\Exp", "Expediente_1234567_v2") };
        Assert.Equal(Path.Combine("C:\\Exp", "Expediente_1234567_v3"), Expediente.Carpeta("C:\\Exp", "1234567", "NUEVA", existentes.Contains));
        Assert.Equal(Path.Combine("C:\\Exp", "Expediente_1234567"), Expediente.Carpeta("C:\\Exp", "1234567", "ACTUALIZAR", existentes.Contains));
        Assert.Equal(Path.Combine("C:\\Exp", "Expediente_7654321"), Expediente.Carpeta("C:\\Exp", "7654321", "NUEVA", existentes.Contains));
    }

    [Theory]
    [InlineData("RTU", "RTU 2026.pdf")]
    [InlineData("SOLVENCIA_FISCAL", "solvencia_fiscal-octubre.pdf")]
    [InlineData("PATENTE_EMPRESA", "PATENTE_EMPRESA.pdf")]
    [InlineData("DPI_REPRESENTANTE", null)]
    public void Encuentra_el_archivo_de_la_empresa_por_codigo(string codigo, string esperado)
    {
        var archivos = new[] { "RTU 2025.pdf", "RTU 2026.pdf", "RTUX.pdf", "solvencia_fiscal-octubre.pdf", "PATENTE_EMPRESA.pdf", "PATENTE_SOCIEDAD.pdf", "notas.txt" }
            .Select(a => Path.Combine("C:\\Docs", a));
        Assert.Equal(esperado, Path.GetFileName(Expediente.ArchivoDeEmpresa(codigo, archivos)) is { Length: > 0 } n ? n : null);
    }

    [Fact]
    public void El_checklist_indica_estado_y_archivo_copiado()
    {
        var hojas = Expediente.HojasChecklist(Datos(), new Dictionary<string, string> { ["RTU"] = "RTU 2026.pdf" });
        var filas = hojas[0].Filas;
        Assert.Equal(new[] { "Listo", "Vencido", "Faltante", "Revisar", "Listo" }, filas.Select(f => f[4]));
        Assert.Equal("02 Documentos de la empresa\\RTU 2026.pdf", filas[0][7]);
        Assert.Equal("No se encontró en _DocumentosEmpresa", filas[4][7]); // RGAE vigente pero sin archivo
        Assert.Equal("30/09/2026", filas[1][5]);
        Assert.Contains(hojas[1].Filas, f => f[0] == "Monto estimado" && f[1] == "Q 85,000.50");
        Assert.Contains(hojas[1].Filas, f => f[0] == "Garantías" && f[1] == "Seguro de caución de cumplimiento · 10 %");
    }

    [Fact]
    public void Genera_un_xlsx_y_un_docx_validos()
    {
        var carpeta = Directory.CreateTempSubdirectory("vc-expediente-").FullName;
        try
        {
            var xlsx = Path.Combine(carpeta, "Checklist.xlsx");
            ArchivosOffice.Excel(xlsx, Expediente.HojasChecklist(Datos(), new Dictionary<string, string>()));
            using (var zip = ZipFile.OpenRead(xlsx))
            {
                foreach (var e in zip.Entries) using (var s = e.Open()) XDocument.Load(s); // XML bien formado
                Assert.Contains(zip.Entries, e => e.FullName == "xl/worksheets/sheet2.xml");
            }

            var borradores = Expediente.Borradores(Datos(), new DateTime(2026, 11, 1));
            Assert.Equal(2, borradores.Count);
            var docx = Path.Combine(carpeta, borradores[0].archivo);
            ArchivosOffice.Word(docx, borradores[0].parrafos);
            using var zipWord = ZipFile.OpenRead(docx);
            using var stream = zipWord.GetEntry("word/document.xml")!.Open();
            var texto = string.Concat(XDocument.Load(stream).Descendants().Where(d => d.Name.LocalName == "t").Select(t => t.Value));
            Assert.Contains("Empresa & Cía. <prueba>, con NIT 1234567-8", texto); // caracteres especiales escapados y legibles
            Assert.Contains("1 de noviembre de 2026", texto);
            Assert.Contains("[lugar de entrega]", texto);
        }
        finally { Directory.Delete(carpeta, true); }
    }

    [Fact]
    public void El_resumen_dice_lo_que_falta_con_nombres_legibles()
    {
        var r = Expediente.Resumen(Datos(), "C:\\Exp\\Expediente_32557469", 1, 1, new[] { "RGAE" });
        Assert.Contains("2 listos, 1 faltantes, 1 vencidos, 1 por revisar", r);
        Assert.Contains("Falta conseguir: Solvencia fiscal, DPI del representante legal", r);
        Assert.Contains("sin archivo en _DocumentosEmpresa: Constancia de inscripción en el RGAE", r);
    }

    [Theory]
    [InlineData(0, "A")]
    [InlineData(7, "H")]
    [InlineData(26, "AA")]
    public void Columnas_de_excel(int i, string esperado) => Assert.Equal(esperado, ArchivosOffice.Columna(i));
}
