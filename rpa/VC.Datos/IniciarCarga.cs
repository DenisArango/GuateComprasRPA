using System;
using System.Linq;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Datos
{
    /// <summary>
    /// Pide a la API que inicie la carga del histórico OCDS (POST /robot/ocds/cargas, CU-11).
    /// La API descarga y carga en segundo plano; el robot solo coordina y vigila (ADR-0001: los datos
    /// históricos vienen de OCDS, nunca del portal con el robot).
    /// </summary>
    public class IniciarCarga : CodedWorkflow
    {
        [Workflow]
        public (int idCarga, string detalle) Execute(string apiUrl, string anios)
        {
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);

            var lista = (anios ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(int.Parse).ToArray();
            var r = lista.Length > 0 ? api.Post("robot/ocds/cargas", new { anios = lista }) : api.Post("robot/ocds/cargas", "{}");
            var id = r.GetProperty("id").GetInt32();
            var nueva = r.GetProperty("nueva").GetBoolean();
            var aniosCarga = string.Join(", ", r.GetProperty("anios").EnumerateArray().Select(a => a.GetInt32()));
            return (id, nueva ? $"Carga OCDS {id} iniciada (años {aniosCarga})" : $"Ya había una carga en curso: {id} (años {aniosCarga})");
        }
    }
}
