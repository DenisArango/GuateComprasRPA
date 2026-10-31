using System;
using System.Collections.Generic;
using System.Data;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Notificador
{
    /// <summary>
    /// Pide a la API el contenido de los avisos y arma los correos con PlantillaCorreo.
    /// modo RESUMEN: resumen diario por perfil. modo FICHA o CAMBIO: aviso inmediato de un elemento de VC_Notificaciones.
    /// Devuelve una fila por correo (columnas PerfilId, Tipo, Para, Asunto, Html, Nogs) para Send SMTP Mail Message.
    /// La clave de la API se lee aquí (asset VC_ApiClave): el Workflow Analyzer no permite convertir SecureString a texto en XAML.
    /// </summary>
    public class PrepararCorreos : CodedWorkflow
    {
        [Workflow]
        public (DataTable dt_Correos, string detalle) Execute(string apiUrl, string modo, string nog, string resumenCola)
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);

            List<Mensaje> mensajes;
            if (modo == "RESUMEN")
            {
                mensajes = PlantillaCorreo.Resumenes(api.Get("robot/notificaciones/resumen"), DateTime.Now);
            }
            else if (modo == "FICHA" || modo == "CAMBIO")
            {
                var aviso = api.GetOpcional($"robot/notificaciones/aviso?nog={Uri.EscapeDataString(nog)}&tipo={modo}")
                    ?? throw new UiPath.Core.BusinessRuleException($"El concurso {nog} no existe en la API.");
                mensajes = PlantillaCorreo.Avisos(aviso, resumenCola);
            }
            else throw new ArgumentException($"Modo desconocido: {modo}. Use RESUMEN, FICHA o CAMBIO.");

            var tabla = new DataTable("Correos");
            tabla.Columns.Add("PerfilId", typeof(int));
            tabla.Columns.Add("Tipo", typeof(string));
            tabla.Columns.Add("Para", typeof(string));
            tabla.Columns.Add("Asunto", typeof(string));
            tabla.Columns.Add("Html", typeof(string));
            tabla.Columns.Add("Nogs", typeof(string));
            foreach (var m in mensajes)
            {
                if (m.Para.Length == 0) continue;
                tabla.Rows.Add(m.PerfilId ?? 0, m.Tipo, string.Join(",", m.Para), m.Asunto, m.Html, string.Join(",", m.Nogs));
            }
            var detalle = modo == "RESUMEN" ? $"Resúmenes por enviar: {tabla.Rows.Count}" : $"Avisos {modo} del NOG {nog}: {tabla.Rows.Count}";
            return (tabla, detalle);
        }
    }
}
