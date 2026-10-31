using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using UiPath.CodedWorkflows;

namespace VC.Notificador
{
    /// <summary>
    /// Envía por Telegram (RF-NOT-02) el resumen o el aviso a los chats vinculados a cada perfil desde el dashboard,
    /// y registra cada envío en la API (canal "telegram"). Se invoca antes de los correos: lee el mismo contenido
    /// de la API antes de que el registro de los correos marque las oportunidades como notificadas.
    /// Sin token (asset VC_TelegramToken vacío o inexistente) no envía nada. Un chat que falla no detiene a los demás.
    /// </summary>
    public class EnviarTelegram : CodedWorkflow
    {
        [Workflow]
        public (int enviados, int fallidos) Execute(string apiUrl, string modo, string nog, string resumenCola)
        {
            string token;
            try
            {
                var (_, secreto) = system.GetCredential("VC_TelegramToken", null, 30000, default);
                token = new NetworkCredential(string.Empty, secreto).Password;
            }
            catch (Exception ex) { Log($"Telegram desactivado: {ex.Message}"); return (0, 0); }
            if (string.IsNullOrWhiteSpace(token)) return (0, 0);

            var (_, clave) = system.GetCredential("VC_ApiClave", null, 30000, default);
            using var api = new ApiVigia(apiUrl, new NetworkCredential(string.Empty, clave).Password);

            List<MensajeTelegram> mensajes;
            if (modo == "RESUMEN") mensajes = PlantillaTelegram.Resumenes(api.Get("robot/notificaciones/resumen"), DateTime.Now);
            else
            {
                var aviso = api.GetOpcional($"robot/notificaciones/aviso?nog={Uri.EscapeDataString(nog)}&tipo={modo}");
                if (aviso == null) return (0, 0);
                mensajes = PlantillaTelegram.Avisos(aviso.Value, resumenCola);
            }

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            int enviados = 0, fallidos = 0;
            foreach (var m in mensajes)
            {
                var ok = new List<string>();
                string error = null;
                foreach (var chat in m.Chats)
                {
                    try
                    {
                        var cuerpo = JsonSerializer.Serialize(new { chat_id = chat, text = m.Texto, parse_mode = "HTML", disable_web_page_preview = true });
                        using var r = http.PostAsync($"https://api.telegram.org/bot{token}/sendMessage", new StringContent(cuerpo, Encoding.UTF8, "application/json")).GetAwaiter().GetResult();
                        var texto = r.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                        if (!r.IsSuccessStatusCode) throw new HttpRequestException($"{(int)r.StatusCode}: {texto}");
                        ok.Add(chat);
                    }
                    // El mensaje de la excepción nunca lleva el token: la URL no se incluye
                    catch (Exception ex) { error = ex.Message; Log($"Telegram al chat {chat} falló: {ex.Message}", LogLevel.Warn); }
                }
                var enviado = ok.Count > 0;
                if (enviado) enviados++; else fallidos++;
                api.Post("robot/notificaciones", new
                {
                    perfilId = m.PerfilId,
                    tipo = m.Tipo,
                    canal = "telegram",
                    estado = enviado ? "ENVIADO" : "FALLIDO",
                    destinatarios = enviado ? ok.ToArray() : m.Chats,
                    asunto = m.Asunto,
                    nogs = m.Nogs,
                    error = error == null ? null : error.Length > 500 ? error[..500] : error,
                });
            }
            Log($"Telegram ({modo}): {enviados} enviados, {fallidos} fallidos");
            return (enviados, fallidos);
        }
    }
}
