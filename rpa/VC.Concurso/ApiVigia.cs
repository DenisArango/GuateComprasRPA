using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace VC.Concurso
{
    /// <summary>Cliente mínimo de las rutas /robot/* de la API (ver api/README.md).</summary>
    public sealed class ApiVigia : IDisposable
    {
        public static readonly JsonSerializerOptions Json = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        readonly HttpClient http;

        public ApiVigia(string apiUrl, string claveRobot)
        {
            if (string.IsNullOrWhiteSpace(apiUrl)) throw new ArgumentException("Falta la URL de la API (asset VC_ApiUrl).");
            http = new HttpClient { BaseAddress = new Uri(apiUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromMinutes(2) };
            http.DefaultRequestHeaders.Add("X-Robot-Clave", claveRobot);
        }

        public JsonElement Put(string ruta, object cuerpo) =>
            Leer(http.PutAsync(ruta, new StringContent(JsonSerializer.Serialize(cuerpo, Json), Encoding.UTF8, "application/json")).GetAwaiter().GetResult());

        public JsonElement SubirArchivo(string ruta, string rutaArchivo, string nombre, string publicadoEn)
        {
            using var formulario = new MultipartFormDataContent();
            formulario.Add(new StringContent(nombre), "nombre");
            if (!string.IsNullOrWhiteSpace(publicadoEn)) formulario.Add(new StringContent(publicadoEn), "publicadoEn");
            var archivo = new ByteArrayContent(File.ReadAllBytes(rutaArchivo));
            formulario.Add(archivo, "archivo", Path.GetFileName(rutaArchivo));
            return Leer(http.PostAsync(ruta, formulario).GetAwaiter().GetResult());
        }

        static JsonElement Leer(HttpResponseMessage respuesta)
        {
            using (respuesta)
            {
                var texto = respuesta.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (!respuesta.IsSuccessStatusCode)
                    throw new HttpRequestException($"API {(int)respuesta.StatusCode} en {respuesta.RequestMessage?.RequestUri}: {texto}");
                return JsonDocument.Parse(texto).RootElement.Clone();
            }
        }

        public void Dispose() => http.Dispose();
    }
}
