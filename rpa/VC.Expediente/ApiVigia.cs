using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace VC.Expediente
{
    /// <summary>
    /// Cliente mínimo de las rutas /robot/* de la API (ver api/README.md).
    /// Pendiente: mover a la biblioteca VC.Comun junto con los de los demás procesos.
    /// </summary>
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

        public JsonElement Get(string ruta) => Leer(http.GetAsync(ruta).GetAwaiter().GetResult());

        /// <summary>GET que devuelve null si la API responde 404.</summary>
        public JsonElement? GetOpcional(string ruta)
        {
            var respuesta = http.GetAsync(ruta).GetAwaiter().GetResult();
            if (respuesta.StatusCode == HttpStatusCode.NotFound) { respuesta.Dispose(); return null; }
            return Leer(respuesta);
        }

        /// <summary>GET que devuelve el código y el cuerpo sin lanzar excepción (409, 404 y 400 llevan un mensaje para el usuario).</summary>
        public (int codigo, JsonElement cuerpo) GetConCodigo(string ruta)
        {
            using var respuesta = http.GetAsync(ruta).GetAwaiter().GetResult();
            var texto = respuesta.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            return ((int)respuesta.StatusCode, JsonDocument.Parse(texto).RootElement.Clone());
        }

        public JsonElement Put(string ruta, object cuerpo) => Leer(http.PutAsync(ruta, Contenido(cuerpo)).GetAwaiter().GetResult());

        public JsonElement Post(string ruta, object cuerpo) => Leer(http.PostAsync(ruta, Contenido(cuerpo)).GetAwaiter().GetResult());

        /// <summary>POST que devuelve el código y el cuerpo sin lanzar excepción (para 422 de validación).</summary>
        public (int codigo, JsonElement cuerpo) PostConCodigo(string ruta, object cuerpo)
        {
            using var respuesta = http.PostAsync(ruta, Contenido(cuerpo)).GetAwaiter().GetResult();
            var texto = respuesta.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            return ((int)respuesta.StatusCode, JsonDocument.Parse(texto).RootElement.Clone());
        }

        public byte[] Descargar(string ruta)
        {
            using var respuesta = http.GetAsync(ruta).GetAwaiter().GetResult();
            respuesta.EnsureSuccessStatusCode();
            return respuesta.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult();
        }

        static StringContent Contenido(object cuerpo) =>
            new StringContent(cuerpo is string s ? s : JsonSerializer.Serialize(cuerpo, Json), Encoding.UTF8, "application/json");

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
