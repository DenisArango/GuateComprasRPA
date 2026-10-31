using VC.Captura;

public class BoletinParserTests
{
    static Boletin LeerFixture(string nombre) =>
        BoletinParser.Leer(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", nombre)));

    public static IEnumerable<object[]> Boletines() =>
        Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "fixtures"), "Boletin*.html")
            .Select(f => new object[] { Path.GetFileName(f) });

    [Theory]
    [MemberData(nameof(Boletines))]
    public void Cuenta_los_mismos_concursos_que_declara_el_encabezado(string archivo)
    {
        var boletin = LeerFixture(archivo);

        Assert.NotNull(boletin.TotalDeclarado);
        Assert.Equal(boletin.TotalDeclarado, boletin.Concursos.Count(c => c.Seccion == "CONCURSO"));
    }

    [Theory]
    [MemberData(nameof(Boletines))]
    public void Cada_concurso_tiene_los_datos_minimos(string archivo)
    {
        foreach (var c in LeerFixture(archivo).Concursos)
        {
            Assert.Matches(@"^\d{6,}$", c.Nog);
            Assert.False(string.IsNullOrEmpty(c.Modalidad), c.Nog);
            Assert.False(string.IsNullOrEmpty(c.Entidad), c.Nog);
            Assert.False(string.IsNullOrEmpty(c.Descripcion), c.Nog);
            Assert.NotEmpty(c.Categorias);
            Assert.StartsWith("https://www.guatecompras.gt/concursos/consultaConcurso.aspx?o=5&nog=" + c.Nog, c.Url);
        }
    }

    [Fact]
    public void Lee_una_fila_conocida_del_30_10_2026()
    {
        var c = LeerFixture("BoletinDiario30-10-2026.html").Concursos.Single(x => x.Nog == "32547951");

        Assert.Equal("CONCURSO", c.Seccion);
        Assert.Equal(new DateTime(2026, 11, 2), c.Fecha);
        Assert.Equal("Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)", c.Modalidad);
        Assert.Equal("Público", c.Tipo);
        Assert.Equal("MINISTERIO DE SALUD PÚBLICA", c.Entidad);
        Assert.Equal("HOSPITAL REGIONAL DE OCCIDENTE QUETZALTENANGO", c.UnidadCompradora);
        Assert.StartsWith("Compra de Harina", c.Descripcion);
        Assert.Contains("Alimentos y semillas", c.Categorias);
    }

    [Fact]
    public void Lee_la_fecha_de_las_publicaciones() =>
        Assert.Equal(new DateTime(2026, 10, 29), LeerFixture("BoletinDiario30-10-2026.html").FechaPublicacion);

    [Theory]
    [InlineData("02.nov..2026", 2026, 11, 2)]
    [InlineData("29.oct..2026", 2026, 10, 29)]
    [InlineData("5.ene.2027", 2027, 1, 5)]
    public void Lee_las_fechas_del_boletin(string texto, int anio, int mes, int dia) =>
        Assert.Equal(new DateTime(anio, mes, dia), BoletinParser.LeerFecha(texto));

    [Fact]
    public void Arma_la_url_del_boletin_del_dia() =>
        Assert.Equal("https://www.guatecompras.gt/BoletinDiario/BoletinDiario30-10-2026.html",
            BoletinParser.UrlDelDia(new DateTime(2026, 10, 30)));
}

public class BoletinCorreoParserTests
{
    // Boletín real recibido por correo (boletines@guatecompras.gt, 31/10/2026 01:17): el HTML va en el cuerpo, en ISO-8859-1
    [Fact]
    public void Lee_el_boletin_que_llega_por_correo()
    {
        var b = BoletinParser.Leer(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", "BoletinCorreo30-10-2026.html")));
        Assert.Equal(new DateTime(2026, 10, 30), b.FechaPublicacion);
        Assert.True(b.Concursos.Count(c => c.Seccion == "CONCURSO") > 500);
    }
}
