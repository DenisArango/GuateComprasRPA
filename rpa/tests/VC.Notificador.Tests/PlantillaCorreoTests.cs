using System.Text.Json;
using VC.Notificador;

public class PlantillaCorreoTests
{
    private static readonly DateTime Hoy = new(2026, 10, 31);

    private const string Resumen = """
    {
      "fecha": "2026-10-31", "webUrl": "http://localhost:4200",
      "perfiles": [{
        "perfilId": 2, "empresa": "Insumos <Prueba>",
        "destinatarios": [{ "correo": "ana@empresa.gt", "nombre": "Ana" }, { "correo": "luis@empresa.gt", "nombre": "Luis" }],
        "oportunidades": [
          { "nog": "32533209", "titulo": "ADQUISICIÓN DE GUANTES DE NITRILO", "entidad": "INSTITUTO GUATEMALTECO DE SEGURIDAD SOCIAL -IGSS-",
            "modalidad": "Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)", "fechaCierre": "2026-11-03", "diasParaCierre": 3,
            "monto": 180000, "enlace": "http://localhost:4200/concursos/32533209", "puntaje": 75, "etapa": "COMPLETA",
            "faltantes": ["Carta de distribuidor autorizado"] },
          { "nog": "32547072", "titulo": "Compra de computadoras", "entidad": "Universidad de San Carlos", "modalidad": "Cotización",
            "fechaCierre": "2026-11-20", "diasParaCierre": 20, "monto": null, "enlace": "http://localhost:4200/concursos/32547072",
            "puntaje": 90, "etapa": "PRELIMINAR", "faltantes": null }
        ],
        "oportunidadesTotal": 5,
        "recordatorios": [{ "nog": "99300001", "titulo": "Guantes", "entidad": "Hospital", "modalidad": "Cotización", "fechaCierre": "2026-11-01",
          "diasParaCierre": 1, "monto": null, "enlace": "http://localhost:4200/concursos/99300001", "seguimiento": "PARTICIPARE" }],
        "documentosPorVencer": [{ "documento": "Solvencia fiscal", "venceEn": "2026-11-05", "dias": 5 }]
      }]
    }
    """;

    [Fact]
    public void Resumen_con_asunto_destinatarios_y_nogs()
    {
        var m = Assert.Single(PlantillaCorreo.Resumenes(JsonDocument.Parse(Resumen).RootElement, Hoy));
        Assert.Equal(2, m.PerfilId);
        Assert.Equal("RESUMEN", m.Tipo);
        Assert.Equal(new[] { "ana@empresa.gt", "luis@empresa.gt" }, m.Para);
        Assert.Equal("5 oportunidades nuevas para Insumos <Prueba>", m.Asunto);
        Assert.Equal(new[] { "32533209", "32547072" }, m.Nogs);
    }

    [Fact]
    public void Resumen_legible_y_sin_html_inyectado()
    {
        var html = PlantillaCorreo.Resumenes(JsonDocument.Parse(Resumen).RootElement, Hoy)[0].Html;
        Assert.Contains("Insumos &lt;Prueba&gt;", html);
        Assert.DoesNotContain("<Prueba>", html);
        Assert.Contains("Adquisición de guantes de nitrilo", html);
        Assert.Contains("Instituto Guatemalteco de Seguridad Social -IGSS-", html);
        Assert.Contains("Compra Directa ·", html);
        Assert.Contains("Q 180,000.00", html);
        Assert.Contains("Cierra en 3 días", html);
        Assert.Contains("Te falta: Carta de distribuidor autorizado", html);
        Assert.Contains(">preliminar</td>", html);
        // Las filas van dentro de su propia tabla (sueltas, el cliente de correo las saca de la tarjeta)
        Assert.DoesNotContain("</h3><tr", html.Replace("\r", "").Replace("\n", ""));
        var vista = Environment.GetEnvironmentVariable("VIGIA_VISTA_CORREO");
        if (!string.IsNullOrEmpty(vista)) File.WriteAllText(vista, html);
        Assert.Contains("Y 3 más en el panel.", html);
        Assert.Contains("Cierra mañana", html);
        Assert.Contains("marcaste que participarás", html);
        Assert.Contains("Solvencia fiscal", html);
        Assert.Contains("Resumen del sábado 31 de octubre", html);
    }

    [Fact]
    public void Aviso_de_ficha_con_faltantes_y_restrictivos_como_senal()
    {
        const string aviso = """
        { "tipo": "FICHA",
          "concurso": { "nog": "99300001", "titulo": "Guantes de nitrilo", "entidad": "Hospital de Prueba", "modalidad": "Cotización",
            "fechaCierre": "2026-11-05", "diasParaCierre": 5, "monto": 180000, "enlace": "http://x/concursos/99300001",
            "resumen": "Compra de 5,000 cajas de guantes.", "validadaPor": "IA",
            "restrictivos": [{ "descripcion": "Carta de distribuidor GuardaMax", "motivoRestrictivo": "única marca aceptada" }] },
          "perfiles": [{ "perfilId": 2, "empresa": "Empresa", "destinatarios": [{ "correo": "ana@empresa.gt" }], "puntaje": 50,
            "faltantes": ["Registro sanitario"] }] }
        """;
        var m = Assert.Single(PlantillaCorreo.Avisos(JsonDocument.Parse(aviso).RootElement, ""));
        Assert.Equal("FICHA", m.Tipo);
        Assert.Equal("Ficha lista: Guantes de nitrilo", m.Asunto);
        Assert.Contains("Registro sanitario", m.Html);
        Assert.Contains("Carta de distribuidor GuardaMax (única marca aceptada)", m.Html);
        Assert.Contains("no una acusación", m.Html);
        Assert.Contains("La ficha la extrajo la IA", m.Html);
    }

    [Fact]
    public void Aviso_de_cambio_usa_el_resumen_de_la_cola_si_la_api_no_trae_cambios()
    {
        const string aviso = """
        { "tipo": "CAMBIO",
          "concurso": { "nog": "99300001", "titulo": "Guantes", "entidad": "Hospital", "modalidad": "Cotización", "fechaCierre": null,
            "diasParaCierre": null, "monto": null, "enlace": "http://x", "cambios": [] },
          "perfiles": [{ "perfilId": 2, "empresa": "Empresa", "destinatarios": [{ "correo": "ana@empresa.gt" }], "seguimiento": "SIGUIENDO" }] }
        """;
        var m = Assert.Single(PlantillaCorreo.Avisos(JsonDocument.Parse(aviso).RootElement, "Se publicó la adenda 1"));
        Assert.Equal("CAMBIO", m.Tipo);
        Assert.StartsWith("Cambió un concurso que sigues", m.Asunto);
        Assert.Contains("Se publicó la adenda 1", m.Html);
        Assert.Contains("Sin fecha de cierre", m.Html);
    }

    [Theory]
    [InlineData("MINISTERIO DE SALUD PÚBLICA Y ASISTENCIA SOCIAL", true, "Ministerio de Salud Pública y Asistencia Social")]
    [InlineData("COMPRA DE GUANTES. TALLA M", false, "Compra de guantes. Talla m")]
    [InlineData("Texto ya en minúsculas", false, "Texto ya en minúsculas")]
    public void Legible(string entrada, bool entidad, string esperado) =>
        Assert.Equal(esperado, PlantillaCorreo.Legible(entrada, entidad));
}
