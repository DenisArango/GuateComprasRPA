using System.Net.Http.Json;
using System.Text.Json;
using VC.Analisis;

/// <summary>
/// Prueba real contra la API de Claude (cuesta unos centavos). Solo corre con VIGIA_PRUEBA_IA=1.
/// Requiere ANTHROPIC_API_KEY y ROBOT_API_CLAVE en infra/.env y la API corriendo en localhost:3000
/// para validar la respuesta con el esquema Zod.
/// </summary>
public class ClienteClaudeTests
{
    static Dictionary<string, string> LeerEnv()
    {
        var ruta = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "..", "infra", ".env"));
        return File.ReadAllLines(ruta)
            .Where(l => l.Contains('=') && !l.TrimStart().StartsWith('#'))
            .Select(l => l.Split('=', 2))
            .ToDictionary(p => p[0].Trim(), p => p[1].Trim().Trim('"'));
    }

    [Fact]
    public async Task Extrae_una_ficha_valida_de_bases_sinteticas()
    {
        if (Environment.GetEnvironmentVariable("VIGIA_PRUEBA_IA") != "1") return;

        var env = LeerEnv();
        var contexto = Segmentacion.ArmarContexto(SegmentacionTests.LeerPaginas("bases-sinteticas.txt"), 200_000);
        var esquema = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", "esquema-ficha.json"));

        var resultado = await ClienteClaude.ExtraerFichaAsync(env["ANTHROPIC_API_KEY"], "claude-opus-5-5", "high", esquema, contexto);

        Assert.Equal("end_turn", resultado.StopReason);
        Assert.NotNull(resultado.Json);
        var ficha = JsonDocument.Parse(resultado.Json).RootElement;
        Assert.Equal(180000, ficha.GetProperty("montoEstimado").GetDecimal());
        Assert.StartsWith("2026-11-05", ficha.GetProperty("fechaLimiteOfertas").GetString());
        Assert.Contains(ficha.GetProperty("requisitos").EnumerateArray(), r => r.GetProperty("documento").GetString() == "RGAE");
        Assert.Contains(ficha.GetProperty("requisitos").EnumerateArray(), r => r.GetProperty("posibleRestrictivo").GetBoolean());

        using var http = new HttpClient { BaseAddress = new Uri("http://localhost:3000/") };
        http.DefaultRequestHeaders.Add("X-Robot-Clave", env["ROBOT_API_CLAVE"]);
        var validacion = await http.PostAsJsonAsync("robot/fichas/validar", new { ficha });
        var cuerpo = await validacion.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(cuerpo.GetProperty("ok").GetBoolean(), cuerpo.ToString());

        File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "ultima-ficha.json"),
            $"// tokens: {resultado.TokensEntrada} entrada, {resultado.TokensSalida} salida · modelo {resultado.Modelo}\n{resultado.Json}");
    }
}
