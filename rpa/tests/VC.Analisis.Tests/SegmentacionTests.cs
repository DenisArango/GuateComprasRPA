using System.Text.RegularExpressions;
using VC.Analisis;

public class SegmentacionTests
{
    /// <summary>Lee un archivo con separadores "=== Página N ===" (formato de los fixtures de texto).</summary>
    public static List<PaginaTexto> LeerPaginas(string archivo, string documento = "Bases.pdf") =>
        Regex.Split(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", archivo)), @"=== Página (\d+) ===")
            .Skip(1).Chunk(2)
            .Select(par => new PaginaTexto { Documento = documento, Numero = int.Parse(par[0]), Texto = par[1].Trim() })
            .ToList();

    [Fact]
    public void Quita_encabezados_repetidos_y_numeracion()
    {
        var limpias = Segmentacion.Limpiar(LeerPaginas("bases-sinteticas.txt"));

        Assert.All(limpias, p => Assert.DoesNotContain("DOCUMENTO SINTÉTICO", p.Texto));
        Assert.All(limpias, p => Assert.DoesNotContain("de 4", p.Texto));
        Assert.Contains("Q180,000.00", limpias[1].Texto);
    }

    [Fact]
    public void Marca_cada_pagina_y_el_documento()
    {
        var contexto = Segmentacion.ArmarContexto(LeerPaginas("bases-sinteticas.txt"), 100_000);

        Assert.StartsWith("### Documento: Bases.pdf", contexto);
        Assert.Contains("[p. 3] 5. REQUISITOS FUNDAMENTALES", contexto);
    }

    [Fact]
    public void Con_poco_espacio_conserva_las_primeras_paginas_y_las_de_requisitos()
    {
        var paginas = LeerPaginas("bases-sinteticas.txt");
        paginas.Add(new PaginaTexto { Documento = "Bases.pdf", Numero = 5, Texto = new string('x', 2000) });

        var contexto = Segmentacion.ArmarContexto(paginas, 2000);

        Assert.Contains("[p. 1]", contexto);
        Assert.Contains("[p. 3]", contexto);
        Assert.DoesNotContain("[p. 5]", contexto);
        Assert.True(contexto.IndexOf("[p. 1]") < contexto.IndexOf("[p. 3]"), "conserva el orden de las páginas");
    }
}
