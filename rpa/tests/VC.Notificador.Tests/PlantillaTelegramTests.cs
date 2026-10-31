using System.Text.Json;
using VC.Notificador;

// Misma forma que GET /robot/notificaciones/resumen y /aviso, con los chats vinculados en "telegram"
public class PlantillaTelegramTests
{
    const string Resumen = """
    {
      "fecha": "2026-11-01", "webUrl": "http://localhost:4200",
      "perfiles": [
        { "perfilId": 2, "empresa": "Insumos & Cómputo", "destinatarios": [], "telegram": ["111", "222"],
          "oportunidades": [ { "nog": "32557469", "titulo": "ADQUISICIÓN DE 10 COMPUTADORAS <ESCRITORIO>", "entidad": "COMISIÓN PRESIDENCIAL -COPADEH-",
                               "modalidad": "Compra Directa", "diasParaCierre": 1, "monto": 85000, "enlace": "http://localhost:4200/concursos/32557469", "puntaje": 61, "etapa": "COMPLETA" } ],
          "oportunidadesTotal": 1, "recordatorios": [], "documentosPorVencer": [ { "documento": "Solvencia fiscal", "dias": 10 } ] },
        { "perfilId": 3, "empresa": "Sin Telegram", "destinatarios": [ { "correo": "a@b.c" } ], "telegram": [],
          "oportunidades": [], "oportunidadesTotal": 0, "recordatorios": [], "documentosPorVencer": [] }
      ]
    }
    """;

    [Fact]
    public void Resumen_solo_para_perfiles_con_chats_y_con_html_escapado()
    {
        var m = Assert.Single(PlantillaTelegram.Resumenes(JsonDocument.Parse(Resumen).RootElement, new DateTime(2026, 11, 1)));
        Assert.Equal(new[] { "111", "222" }, m.Chats);
        Assert.Equal(new[] { "32557469" }, m.Nogs);
        Assert.Contains("<b>1 oportunidad nueva</b>", m.Texto);
        Assert.Contains("Insumos &amp; Cómputo", m.Texto);
        Assert.Contains("&lt;escritorio&gt;", m.Texto);
        Assert.Contains("cierra mañana · compatibilidad 61", m.Texto);
        Assert.Contains("Solvencia fiscal: vence en 10 días", m.Texto);
        Assert.Contains("<a href=\"http://localhost:4200/concursos/32557469\">", m.Texto);
    }

    [Fact]
    public void Aviso_de_ficha_con_faltantes()
    {
        const string aviso = """
        { "tipo": "FICHA",
          "concurso": { "nog": "32557469", "titulo": "COMPUTADORAS", "entidad": "COPADEH", "diasParaCierre": 3, "resumen": "Compra de 10 computadoras.", "enlace": "http://x/c/1" },
          "perfiles": [ { "perfilId": 2, "empresa": "E", "destinatarios": [], "telegram": ["111"], "puntaje": 61, "faltantes": ["DPI del representante legal"] } ] }
        """;
        var m = Assert.Single(PlantillaTelegram.Avisos(JsonDocument.Parse(aviso).RootElement, ""));
        Assert.Equal("FICHA", m.Tipo);
        Assert.Contains("compatibilidad 61", m.Texto);
        Assert.Contains("<b>Te falta:</b> DPI del representante legal", m.Texto);
        Assert.Contains("cierra en 3 días", m.Texto);
    }
}
