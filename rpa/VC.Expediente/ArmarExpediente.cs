using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using UiPath.CodedWorkflows;

namespace VC.Expediente
{
    /// <summary>
    /// Arma la carpeta del expediente de oferta (CU-16): pide a la API la ficha, el checklist y los documentos del
    /// concurso; descarga las bases; copia los documentos vigentes de la empresa (los vencidos no, CP-17); genera
    /// Checklist.xlsx y los borradores Word; registra el expediente con su duración (métrica de OE7).
    /// </summary>
    public class ArmarExpediente : CodedWorkflow
    {
        [Workflow]
        public (string carpeta, string resumen) Execute(string nog, int perfilId, string apiUrl, string carpetaBase, string modo, DateTime inicio, bool abrirCarpeta)
        {
            nog = (nog ?? "").Trim();
            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);

            var (codigo, datos) = api.GetConCodigo($"robot/expedientes/{nog}" + (perfilId > 0 ? $"?perfilId={perfilId}" : ""));
            if (codigo != 200)
            {
                var error = Expediente.Texto(datos, "error");
                if (datos.TryGetProperty("perfiles", out var perfiles))
                    error += ": " + string.Join(", ", perfiles.EnumerateArray().Select(p => $"{Expediente.Texto(p, "id")} = {Expediente.Texto(p, "nombre")}"));
                throw new UiPath.Core.BusinessRuleException(error.Length > 0 ? error : $"La API respondió {codigo}");
            }

            var carpeta = Expediente.Carpeta(carpetaBase, nog, modo, Directory.Exists);
            var bases = Path.Combine(carpeta, Expediente.CarpetaBases);
            var empresa = Path.Combine(carpeta, Expediente.CarpetaEmpresa);
            var borradores = Path.Combine(carpeta, Expediente.CarpetaBorradores);
            // Al actualizar se rehacen los documentos de la empresa y los borradores: un documento que venció ya no debe quedar
            foreach (var d in new[] { empresa, borradores }) if (Directory.Exists(d)) Directory.Delete(d, true);
            foreach (var d in new[] { bases, empresa, borradores }) Directory.CreateDirectory(d);

            // 1. Bases y demás documentos del concurso, desde el almacén de la API (no se vuelve a Guatecompras)
            var totalBases = 0;
            foreach (var doc in datos.GetProperty("documentosConcurso").EnumerateArray())
            {
                var nombre = Expediente.Texto(doc, "nombre");
                if (nombre.StartsWith(nog + "@")) nombre = nombre[(nog.Length + 1)..];
                File.WriteAllBytes(Path.Combine(bases, Expediente.NombreSeguro(nombre)), api.Descargar($"robot/documentos/{doc.GetProperty("id").GetInt32()}/archivo"));
                totalBases++;
            }
            Log($"NOG {nog}: {totalBases} documentos del concurso guardados");

            // 2. Documentos vigentes de la empresa, desde su carpeta local (nombrados por código: RTU.pdf, RGAE 2026.pdf…)
            var origen = Path.Combine(carpetaBase, Expediente.DocumentosEmpresa);
            Directory.CreateDirectory(origen);
            var archivos = Directory.GetFiles(origen);
            var copiados = new Dictionary<string, string>();
            var sinArchivo = new List<string>();
            foreach (var doc in datos.GetProperty("documentosACopiar").EnumerateArray())
            {
                var cod = Expediente.Texto(doc, "codigo");
                var archivo = Expediente.ArchivoDeEmpresa(cod, archivos);
                if (archivo == null) { sinArchivo.Add(cod); continue; }
                File.Copy(archivo, Path.Combine(empresa, Path.GetFileName(archivo)), true);
                copiados[cod] = Path.GetFileName(archivo);
            }
            Log($"NOG {nog}: {copiados.Count} documentos de la empresa copiados; sin archivo: {string.Join(", ", sinArchivo)}");

            // 3. Checklist y borradores
            ArchivosOffice.Excel(Path.Combine(carpeta, Expediente.Checklist), Expediente.HojasChecklist(datos, copiados));
            foreach (var (archivo, parrafos) in Expediente.Borradores(datos, DateTime.Now))
                ArchivosOffice.Word(Path.Combine(borradores, archivo), parrafos);

            // 4. Registro en la API con lo que falta y la duración
            var faltantes = datos.GetProperty("faltantes").EnumerateArray().Select(f => f.GetString()).ToArray();
            api.Post("robot/expedientes", new
            {
                nog,
                perfilId = datos.GetProperty("perfil").GetProperty("id").GetInt32(),
                ruta = carpeta,
                faltantes,
                duracionSeg = (int)Math.Max(0, (DateTime.Now - inicio).TotalSeconds),
            });

            // Atendido: se abre la carpeta para que la persona revise el expediente (desatendido, no)
            if (abrirCarpeta)
                try { System.Diagnostics.Process.Start("explorer.exe", $"\"{carpeta}\""); } catch (Exception ex) { Log($"No se pudo abrir la carpeta: {ex.Message}"); }

            return (carpeta, Expediente.Resumen(datos, carpeta, totalBases, copiados.Count, sinArchivo));
        }
    }
}
