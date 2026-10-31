using VC.Concurso;

public class NormalizarPortalTests
{
    [Theory]
    [InlineData("Q 1,234,567.89", 1234567.89)]
    [InlineData("Q180,000.00", 180000)]
    [InlineData("1.234.567,89", 1234567.89)]
    [InlineData("Q 25,000", 25000)]
    [InlineData("900000", 900000)]
    [InlineData("Q 0.5", 0.5)]
    public void Lee_montos(string texto, double esperado) =>
        Assert.Equal((decimal)esperado, NormalizarPortal.Monto(texto));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("No aplica")]
    public void Monto_sin_digitos_es_null(string texto) => Assert.Null(NormalizarPortal.Monto(texto));

    [Theory]
    [InlineData("05.nov..2026 10:00", "2026-11-05T10:00:00")]
    [InlineData("05.noviembre.2026 10:00:00 hrs", "2026-11-05T10:00:00")]
    [InlineData("5 de noviembre de 2026", "2026-11-05T00:00:00")]
    [InlineData("05/11/2026 2:30 p.m.", "2026-11-05T14:30:00")]
    [InlineData("02.nov..2026", "2026-11-02T00:00:00")]
    [InlineData("12/01/2027 12:15 a.m.", "2027-01-12T00:15:00")]
    // Formatos reales del detalle del concurso (NOG 32533209, 31/10/2026)
    [InlineData("03.noviembre.2026 08:00:00 a.m.", "2026-11-03T08:00:00")]
    [InlineData("29.octubre.2026 05:27:13 p.m.", "2026-10-29T17:27:13")]
    public void Lee_fechas(string texto, string esperado) => Assert.Equal(esperado, NormalizarPortal.FechaHora(texto));

    [Theory]
    [InlineData(null)]
    [InlineData("pendiente")]
    [InlineData("31/02/2026")]
    public void Fecha_no_reconocida_es_null(string texto) => Assert.Null(NormalizarPortal.FechaHora(texto));
}
