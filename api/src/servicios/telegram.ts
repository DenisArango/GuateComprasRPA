import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../db.js';

/**
 * Vinculación de chats de Telegram a perfiles (RF-NOT-02). Los envíos los hace VC.Notificador;
 * la API solo vincula: genera un código, la persona abre t.me/<bot>?start=<código> y la API lee
 * los mensajes pendientes del bot (getUpdates) para guardar el chat. Sin webhook: la API corre local.
 */

const VIGENCIA_CODIGO_MIN = 15;

async function llamar<T>(metodo: string, cuerpo: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(10_000),
  });
  const datos = (await r.json()) as { ok: boolean; result: T; description?: string };
  if (!datos.ok) throw new Error(`Telegram ${metodo}: ${datos.description ?? r.status}`);
  return datos.result;
}

export const telegramActivo = () => config.TELEGRAM_BOT_TOKEN.length > 0;

let usuarioBot: string | null = null;
export async function nombreDelBot(): Promise<string> {
  usuarioBot ??= (await llamar<{ username: string }>('getMe')).username;
  return usuarioBot;
}

/** Código de un solo uso (15 min) y enlace que abre el bot con /start <código>. */
export async function crearVinculo(perfilId: number) {
  const codigo = randomBytes(12).toString('base64url');
  await prisma.vinculoTelegram.deleteMany({ where: { OR: [{ perfilId }, { venceEn: { lt: new Date() } }] } });
  await prisma.vinculoTelegram.create({ data: { codigo, perfilId, venceEn: new Date(Date.now() + VIGENCIA_CODIGO_MIN * 60_000) } });
  const bot = await nombreDelBot();
  return { bot, enlace: `https://t.me/${bot}?start=${codigo}`, venceEn: VIGENCIA_CODIGO_MIN };
}

type Update = { update_id: number; message?: { text?: string; chat: { id: number; first_name?: string; title?: string } } };
let siguienteUpdate = 0;

/**
 * Lee los mensajes nuevos del bot y vincula los que traen un código válido. Al pedir con offset,
 * Telegram descarta los ya leídos. Se llama cuando el dashboard consulta el estado de la vinculación.
 */
export async function sincronizarVinculos(): Promise<number> {
  const updates = await llamar<Update[]>('getUpdates', { offset: siguienteUpdate, timeout: 0, allowed_updates: ['message'] });
  let vinculados = 0;
  for (const u of updates) {
    siguienteUpdate = u.update_id + 1;
    const codigo = u.message?.text?.match(/^\/start\s+([\w-]+)/)?.[1];
    if (!u.message || !codigo) continue;
    const chat = String(u.message.chat.id);
    const vinculo = await prisma.vinculoTelegram.findUnique({ where: { codigo }, include: { perfil: { select: { nombre: true, telegramChats: true } } } });
    if (!vinculo || vinculo.venceEn < new Date()) {
      await llamar('sendMessage', { chat_id: chat, text: 'El enlace venció o ya se usó. Genere uno nuevo desde su perfil en Vigía de Contrataciones.' });
      continue;
    }
    await prisma.$transaction([
      prisma.perfilEmpresa.update({
        where: { id: vinculo.perfilId },
        data: { telegramChats: [...new Set([...vinculo.perfil.telegramChats, chat])] },
      }),
      prisma.vinculoTelegram.delete({ where: { codigo } }),
    ]);
    await llamar('sendMessage', {
      chat_id: chat,
      text: `Listo: este chat recibirá los avisos de ${vinculo.perfil.nombre} (oportunidades nuevas, cambios y cierres).`,
    });
    vinculados++;
  }
  return vinculados;
}
