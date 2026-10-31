using System;
using System.Linq;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Notificador
{
    /// <summary>
    /// Registra en la API cada correo enviado o fallido (POST /robot/notificaciones). Si fue enviado,
    /// la API marca las oportunidades como notificadas para no repetirlas.
    /// </summary>
    public class RegistrarEnvio : CodedWorkflow
    {
        [Workflow]
        public void Execute(string apiUrl, int perfilId, string tipo, string para, string asunto, string nogs, bool enviado, string error)
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);
            static string[] Partir(string s) => (s ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            api.Post("robot/notificaciones", new
            {
                perfilId = perfilId > 0 ? perfilId : (int?)null,
                tipo,
                canal = "correo",
                estado = enviado ? "ENVIADO" : "FALLIDO",
                destinatarios = Partir(para),
                asunto,
                nogs = Partir(nogs),
                error = string.IsNullOrWhiteSpace(error) ? null : error.Length > 500 ? error[..500] : error,
            });
        }
    }
}
