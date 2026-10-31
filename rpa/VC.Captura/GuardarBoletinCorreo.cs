using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Mail;
using System.Text;
using UiPath.CodedWorkflows;

namespace VC.Captura
{
    /// <summary>
    /// Entre los correos que trajo Get IMAP Mail Messages, elige el boletín diario de concursos recibido
    /// hoy y guarda su HTML en la carpeta de trabajo (ver BoletinCorreo).
    /// Devuelve una ruta vacía si el boletín de hoy todavía no llegó: el robot termina sin error y
    /// el siguiente disparador vuelve a revisar.
    /// </summary>
    public class GuardarBoletinCorreo : CodedWorkflow
    {
        [Workflow]
        public (string rutaBoletin, string detalle) Execute(List<MailMessage> correos, string carpetaTrabajo, string remitente)
        {
            var hoy = DateTime.Now.Date;
            var boletin = BoletinCorreo.Elegir(correos, hoy, remitente);
            if (boletin is null)
                return ("", $"No hay boletín de hoy en el buzón ({correos?.Count ?? 0} correos revisados).");

            var html = BoletinCorreo.Html(boletin)
                ?? throw new InvalidDataException("CAMBIO_ESTRUCTURA: el correo del boletín no trae HTML ni adjunto .html.");

            Directory.CreateDirectory(carpetaTrabajo);
            var ruta = Path.Combine(carpetaTrabajo, $"BoletinDiario{hoy:dd-MM-yyyy}.html");
            File.WriteAllText(ruta, html, Encoding.UTF8);
            return (ruta, $"Boletín guardado: \"{boletin.Subject}\" → {ruta}");
        }
    }
}
