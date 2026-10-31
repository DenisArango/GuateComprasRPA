using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using VC.Captura;

public class BoletinCorreoTests
{
    private static readonly DateTime Hoy = new(2026, 10, 31);

    private static MailMessage Correo(string de, string asunto, DateTime? fecha = null, string cuerpo = "", bool html = false)
    {
        var m = new MailMessage { From = new MailAddress(de), Subject = asunto, Body = cuerpo, IsBodyHtml = html };
        if (fecha.HasValue) m.Headers["Date"] = new DateTimeOffset(fecha.Value).ToUniversalTime().ToString("r");
        return m;
    }

    [Fact]
    public void Elige_el_boletin_de_hoy_y_descarta_otros_correos()
    {
        var correos = new List<MailMessage>
        {
            Correo("suscripciones@guatecompras.gt", "Confirme su suscripción al boletín", Hoy.AddHours(1)),
            Correo("no-reply@google.com", "Publicaciones de ayer 30.Oct.2026", Hoy.AddHours(2)),
            Correo("boletin@guatecompras.gt", "Publicaciones de ayer 29.Oct.2026", Hoy.AddDays(-1).AddHours(5)),
            Correo("boletin@guatecompras.gt", "Publicaciones de ayer 30.Oct.2026", Hoy.AddHours(6)),
        };

        var elegido = BoletinCorreo.Elegir(correos, Hoy);

        Assert.NotNull(elegido);
        Assert.Equal("Publicaciones de ayer 30.Oct.2026", elegido.Subject);
    }

    [Fact]
    public void Sin_boletin_de_hoy_devuelve_null()
    {
        var correos = new List<MailMessage> { Correo("boletin@guatecompras.gt", "Publicaciones de ayer 29.Oct.2026", Hoy.AddDays(-1)) };
        Assert.Null(BoletinCorreo.Elegir(correos, Hoy));
        Assert.Null(BoletinCorreo.Elegir(null, Hoy));
    }

    [Fact]
    public void Lee_la_fecha_con_comentario_de_zona()
    {
        var m = Correo("a@guatecompras.gt", "x");
        m.Headers["Date"] = "Sat, 31 Oct 2026 06:15:00 -0600 (CST)";
        Assert.Equal(new DateTimeOffset(2026, 10, 31, 6, 15, 0, TimeSpan.FromHours(-6)).LocalDateTime, BoletinCorreo.FechaDe(m));
    }

    [Fact]
    public void Prefiere_el_adjunto_html_sobre_el_cuerpo()
    {
        var m = Correo("a@guatecompras.gt", "Publicaciones de ayer", cuerpo: "<p>cuerpo</p>", html: true);
        m.Attachments.Add(new Attachment(new MemoryStream(Encoding.UTF8.GetBytes("<html>adjunto ñ</html>")), "BoletinDiario.html", MediaTypeNames.Text.Html));
        Assert.Equal("<html>adjunto ñ</html>", BoletinCorreo.Html(m));
    }

    [Fact]
    public void Usa_el_cuerpo_html_o_el_encabezado_HTMLBody()
    {
        Assert.Equal("<p>cuerpo</p>", BoletinCorreo.Html(Correo("a@guatecompras.gt", "x", cuerpo: "<p>cuerpo</p>", html: true)));

        var m = Correo("a@guatecompras.gt", "x", cuerpo: "texto plano");
        m.Headers["HTMLBody"] = "<table>boletín</table>";
        Assert.Equal("<table>boletín</table>", BoletinCorreo.Html(m));

        Assert.Null(BoletinCorreo.Html(Correo("a@guatecompras.gt", "x", cuerpo: "solo texto")));
    }
}
