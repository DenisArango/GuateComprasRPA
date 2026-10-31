using System;
using System.Data;
using System.IO;
using System.Linq;
using UiPath.CodedWorkflows;

namespace VC.Concurso
{
    /// <summary>
    /// Mueve el archivo que el navegador acaba de descargar a la carpeta del concurso, con el nombre del documento
    /// en el portal, y lo registra en la tabla de descargados (Nombre, PublicadoEn, RutaArchivo) que usa SubirDocumentos.
    /// </summary>
    public class GuardarDescarga : CodedWorkflow
    {
        [Workflow]
        public DataTable Execute(string archivoDescargado, string carpeta, string nombre, string publicadoEn, DataTable dt_Descargados)
        {
            var tabla = dt_Descargados ?? NuevaTabla();
            Directory.CreateDirectory(carpeta);
            var invalidos = Path.GetInvalidFileNameChars();
            var limpio = new string(nombre.Select(c => invalidos.Contains(c) ? '_' : c).ToArray());
            var destino = Path.Combine(carpeta, limpio);
            if (File.Exists(destino)) File.Delete(destino);
            File.Move(archivoDescargado, destino);
            tabla.Rows.Add(nombre, publicadoEn, destino);
            return tabla;
        }

        public static DataTable NuevaTabla()
        {
            var t = new DataTable("Descargados");
            t.Columns.Add("Nombre", typeof(string));
            t.Columns.Add("PublicadoEn", typeof(string));
            t.Columns.Add("RutaArchivo", typeof(string));
            return t;
        }
    }
}
