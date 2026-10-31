using VC.Concurso;

// Páginas reales guardadas desde Edge el 31/10/2026 (NOG 32533209): la inicial y la pestaña "Historial de acciones"
public class DetallePortalTests
{
    static string Fixture(string nombre) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", "detalle", nombre));

    static DetalleLeido Leer() => DetallePortal.Leer(Fixture("32533209.html"), Fixture("32533209-historial.html"));

    [Fact]
    public void Lee_los_datos_generales()
    {
        var d = Leer();
        Assert.Equal("32533209", d.Nog);
        Assert.StartsWith("EVENTO 1092-2026 CÓDIGO IGSS", d.Titulo);
        Assert.Equal("Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)", d.Modalidad);
        Assert.Equal("INSTITUTO GUATEMALTECO DE SEGURIDAD SOCIAL -IGSS-", d.Entidad);
        Assert.Equal("HOSPITAL GENERAL \"DOCTOR JUAN JOSÉ ARÉVALO BERMEJO\"", d.UnidadCompradora);
        Assert.Equal("Vigente (se aceptan ofertas electrónicas)", d.EstadoGc);
        Assert.Equal("03.noviembre.2026 08:00:00 a.m.", d.FechaCierreTexto);
        Assert.Equal("2026-11-03T08:00:00", NormalizarPortal.FechaHora(d.FechaCierreTexto));
        Assert.Equal("", d.MontoTexto);
    }

    [Fact]
    public void Lee_los_documentos_del_historial_con_su_enlace_y_fecha()
    {
        var d = Leer();
        Assert.Equal(3, d.Documentos.Count);
        var bases = d.Documentos.Single(x => x.Tipo.StartsWith("Bases"));
        Assert.Equal("32533209@EVENTO 1092-2026 TONER ORIGINAL.pdf", bases.Nombre);
        Assert.Equal("https://www.guatecompras.gt/concursos/files/6507/32533209%40EVENTO%201092-2026%20TONER%20ORIGINAL.pdf", bases.Url);
        Assert.Equal("2026-10-29T17:27:13", NormalizarPortal.FechaHora(bases.PublicadoEnTexto));
        Assert.Contains(d.Documentos, x => x.Nombre == "32533209@SIAF 6204-2026.pdf");
        Assert.Equal(0, d.AccionesPosteriores);
    }

    [Theory]
    [InlineData("32533209@EVENTO 1092-2026 TONER ORIGINAL.pdf (539KB) (4 Descargas)", "32533209@EVENTO 1092-2026 TONER ORIGINAL.pdf")]
    [InlineData("32533209@SIAF 6204-2026.pdf (686KB)", "32533209@SIAF 6204-2026.pdf")]
    [InlineData("bases.pdf (1.2MB) (1 Descarga)", "bases.pdf")]
    public void Limpia_el_nombre_del_documento(string texto, string esperado) => Assert.Equal(esperado, DetallePortal.NombreDocumento(texto));

    // En vivo los enlaces son relativos (prueba del 31/10/2026: el robot navegó a "concursos/files/…" sin dominio)
    [Theory]
    [InlineData("concursos/files/6511/32554826%40X01.pdf")]
    [InlineData("../concursos/files/6511/32554826%40X01.pdf")]
    [InlineData("/concursos/files/6511/32554826%40X01.pdf")]
    [InlineData("https://www.guatecompras.gt/concursos/files/6511/32554826%40X01.pdf")]
    public void Completa_los_enlaces_relativos(string href) =>
        Assert.Equal("https://www.guatecompras.gt/concursos/files/6511/32554826%40X01.pdf", DetallePortal.UrlAbsoluta(href));

    [Fact]
    public void Sin_las_filas_del_detalle_avisa_cambio_de_estructura()
    {
        var ex = Assert.Throws<FormatException>(() => DetallePortal.Leer("<html>Just a moment...</html>", ""));
        Assert.StartsWith("CAMBIO_ESTRUCTURA", ex.Message);
    }
}
