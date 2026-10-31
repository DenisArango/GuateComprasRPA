import { createReadStream } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { calcularConfianza, paginasDeTexto } from '../../domain/confianza.js';
import { costoUsd, modelosConPrecio } from '../../domain/costos.js';
import type { DetalleConcurso } from '../../domain/detalle.js';
import { esquemaFicha, validarFicha } from '../../domain/ficha.js';
import { recalcularCompatibilidad } from '../../servicios/compatibilidad.js';
import { EstadoSistema, ValidadaPor, type Prisma } from '../../generated/prisma/client.js';

const Nog = z.object({ nog: z.string().regex(/^\d{6,}$/) });
const Id = z.object({ id: z.coerce.number().int().positive() });

const TextoDocumento = z.object({
  paginas: z.array(z.object({ numero: z.number().int().positive(), texto: z.string() })),
  requiereOcr: z.boolean(),
});

const Uso = z.object({
  nog: z.string().nullable(),
  modelo: z.enum(modelosConPrecio as [string, ...string[]]),
  tokensEntrada: z.number().int().nonnegative(),
  tokensSalida: z.number().int().nonnegative(),
});

const GuardarFicha = z.object({
  ficha: z.unknown(),
  modelo: z.string(),
  tokensEntrada: z.number().int().nonnegative(),
  tokensSalida: z.number().int().nonnegative(),
  validadaPor: z.enum(['IA', 'HUMANO']),
  tareaActionCenter: z.string().nullable().optional(),
});

function inicioDeHoy() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}

/** Rutas de VC.Analisis (docs/08-diseno-del-bot.md, 8.5). */
export async function rutasAnalisis(app: FastifyInstance) {
  /** JSON Schema de la ficha: salida estructurada de Claude. */
  app.get('/robot/esquemas/ficha', async () => esquemaFicha());

  /** Documentos de un concurso, con los textos ya extraídos (para no repetir OCR). */
  app.get('/robot/concursos/:nog/documentos', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const concurso = await prisma.concurso.findUnique({
      where: { nog },
      select: { documentos: { select: { id: true, nombreOriginal: true, tipo: true, tamanoBytes: true, textoExtraido: true }, orderBy: { id: 'asc' } } },
    });
    if (!concurso) return reply.code(404).send({ error: `Concurso ${nog} no registrado` });
    return concurso.documentos.map(({ textoExtraido, ...d }) => ({ ...d, tieneTexto: textoExtraido !== null }));
  });

  app.get('/robot/documentos/:id/archivo', async (request, reply) => {
    const { id } = Id.parse(request.params);
    const documento = await prisma.documento.findUnique({ where: { id } });
    if (!documento) return reply.code(404).send({ error: 'Documento no encontrado' });
    return reply
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(documento.nombreOriginal)}"`)
      .type('application/octet-stream')
      .send(createReadStream(path.join(config.STORAGE_DIR, documento.rutaAlmacen)));
  });

  /** Texto extraído (digital u OCR), marcado por página con "[p. N]" (RNF-14). */
  app.put('/robot/documentos/:id/texto', async (request, reply) => {
    const { id } = Id.parse(request.params);
    const datos = TextoDocumento.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Texto inválido', detalle: z.treeifyError(datos.error) });
    const texto = datos.data.paginas.map((p) => `[p. ${p.numero}] ${p.texto}`).join('\n');
    await prisma.documento.update({
      where: { id },
      data: { textoExtraido: texto, paginas: datos.data.paginas.length, requiereOcr: datos.data.requiereOcr },
    });
    return { documentoId: id, paginas: datos.data.paginas.length };
  });

  /** Texto de todos los documentos del concurso, por página, para armar el contexto de la IA. */
  app.get('/robot/concursos/:nog/texto', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const concurso = await prisma.concurso.findUnique({
      where: { nog },
      select: { titulo: true, url: true, documentos: { select: { id: true, nombreOriginal: true, tipo: true, requiereOcr: true, textoExtraido: true }, orderBy: { id: 'asc' } } },
    });
    if (!concurso) return reply.code(404).send({ error: `Concurso ${nog} no registrado` });
    return {
      titulo: concurso.titulo,
      url: concurso.url,
      documentos: concurso.documentos.map((d) => ({
        id: d.id,
        nombre: d.nombreOriginal,
        tipo: d.tipo,
        requiereOcr: d.requiereOcr ?? false,
        paginas: [...paginasDeTexto(d.textoExtraido ?? '')].map(([numero, texto]) => ({ numero, texto: texto.trim() })),
      })),
    };
  });

  /** Estado de la ficha guardada (VC.Analisis lo consulta para no procesar dos veces una revisión). */
  app.get('/robot/concursos/:nog/ficha', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const ficha = await prisma.ficha.findFirst({
      where: { concurso: { nog } },
      select: { id: true, confianza: true, validadaPor: true, tareaActionCenter: true, generadoEn: true },
    });
    if (!ficha) return reply.code(404).send({ error: `El concurso ${nog} no tiene ficha` });
    return { ...ficha, confianza: Number(ficha.confianza) };
  });

  /**
   * VC.Analisis registra el número de la tarea de Action Center que creó para la ficha. RecogerRevisiones
   * consulta después cada tarea por su número (Get Task Data), sin listar tareas como administrador.
   */
  app.put('/robot/concursos/:nog/ficha/tarea', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const { tareaId } = z.object({ tareaId: z.coerce.number().int().positive() }).parse(request.body);
    const { count } = await prisma.ficha.updateMany({ where: { concurso: { nog }, validadaPor: ValidadaPor.IA }, data: { tareaActionCenter: String(tareaId) } });
    if (!count) return reply.code(404).send({ error: `El concurso ${nog} no tiene una ficha de la IA en revisión` });
    return { nog, tareaId };
  });

  /** Fichas que esperan validación humana, con su tarea de Action Center (CU-17). */
  app.get('/robot/fichas/en-revision', async () => {
    const fichas = await prisma.ficha.findMany({
      where: { validadaPor: ValidadaPor.IA, tareaActionCenter: { not: null }, concurso: { estadoSistema: EstadoSistema.REVISION_MANUAL } },
      select: { tareaActionCenter: true, concurso: { select: { nog: true } } },
      orderBy: { generadoEn: 'asc' },
    });
    return fichas.map((f) => ({ nog: f.concurso.nog, tareaId: Number(f.tareaActionCenter) }));
  });

  /** Presupuesto diario de IA (RNF-11, CU-03 FA-3). */
  app.get('/robot/ia/presupuesto', async () => {
    const gastado = await prisma.usoIa.aggregate({ _sum: { costoUsd: true }, where: { creadoEn: { gte: inicioDeHoy() } } });
    const gastadoHoyUsd = Number(gastado._sum.costoUsd ?? 0);
    return {
      limiteUsd: config.IA_PRESUPUESTO_DIARIO_USD,
      gastadoHoyUsd,
      disponibleUsd: Math.max(0, config.IA_PRESUPUESTO_DIARIO_USD - gastadoHoyUsd),
    };
  });

  /** Registra cada llamada a la IA, también las que producen una ficha inválida. */
  app.post('/robot/ia/uso', async (request, reply) => {
    const datos = Uso.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Uso inválido', detalle: z.treeifyError(datos.error) });
    const { nog, modelo, tokensEntrada, tokensSalida } = datos.data;
    const concurso = nog ? await prisma.concurso.findUnique({ where: { nog }, select: { id: true } }) : null;
    const uso = await prisma.usoIa.create({
      data: { concursoId: concurso?.id ?? null, modelo, tokensEntrada, tokensSalida, costoUsd: costoUsd(modelo, tokensEntrada, tokensSalida) },
    });
    return reply.code(201).send({ usoId: uso.id, costoUsd: Number(uso.costoUsd) });
  });

  /** Solo valida (lo usa el robot entre reintentos, sin guardar). */
  app.post('/robot/fichas/validar', async (request) => validarFicha((request.body as { ficha?: unknown })?.ficha));

  /**
   * Guarda la ficha de un concurso: valida, calcula la confianza contra el portal y el texto,
   * y decide si requiere revisión humana. Una ficha corregida por una persona queda ANALIZADO
   * aunque la confianza sea baja.
   */
  app.post('/robot/concursos/:nog/ficha', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const datos = GuardarFicha.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Solicitud inválida', detalle: z.treeifyError(datos.error) });
    const validacion = validarFicha(datos.data.ficha);
    if (!validacion.ok) return reply.code(422).send({ error: 'Ficha inválida', errores: validacion.errores });
    const { ficha } = validacion;

    const concurso = await prisma.concurso.findUnique({
      where: { nog },
      include: { documentos: { select: { textoExtraido: true } } },
    });
    if (!concurso) return reply.code(404).send({ error: `Concurso ${nog} no registrado` });

    const detalle = concurso.instantanea as DetalleConcurso | null;
    const paginas = paginasDeTexto(concurso.documentos.map((d) => d.textoExtraido ?? '').join('\n'));
    const { confianza, componentes } = calcularConfianza(
      ficha,
      {
        fechaCierre: detalle?.fechaCierre ?? concurso.fechaCierre?.toISOString() ?? null,
        montoEstimado: detalle?.montoEstimado ?? (concurso.montoEstimado ? Number(concurso.montoEstimado) : null),
      },
      paginas,
    );
    const validadaPor = datos.data.validadaPor === 'HUMANO' ? ValidadaPor.HUMANO : ValidadaPor.IA;
    const requiereRevision = validadaPor === ValidadaPor.IA && confianza < config.FICHA_UMBRAL_CONFIANZA;

    const campos = {
      resumen: ficha.resumen,
      objeto: ficha.objeto,
      monto: ficha.montoEstimado,
      plazoEntrega: ficha.plazoEntrega,
      lugarEntrega: ficha.lugarEntrega,
      fechaLimiteOfertas: ficha.fechaLimiteOfertas ? new Date(ficha.fechaLimiteOfertas) : null,
      garantias: ficha.garantias as Prisma.InputJsonValue,
      datosCompletos: ficha as Prisma.InputJsonValue,
      confianza,
      componentesConfianza: componentes as Prisma.InputJsonValue,
      validadaPor,
      tareaActionCenter: datos.data.tareaActionCenter ?? null,
      modeloIa: datos.data.modelo,
      tokensEntrada: datos.data.tokensEntrada,
      tokensSalida: datos.data.tokensSalida,
      costoUsd: modelosConPrecio.includes(datos.data.modelo) ? costoUsd(datos.data.modelo, datos.data.tokensEntrada, datos.data.tokensSalida) : 0,
      requisitos: {
        create: ficha.requisitos.map((r) => ({
          tipo: r.tipo, descripcion: r.descripcion, documentoNormalizado: r.documento, obligatorio: r.obligatorio,
          referencia: r.pagina ? `p. ${r.pagina}` : null, posibleRestrictivo: r.posibleRestrictivo, motivoRestrictivo: r.motivoRestrictivo,
        })),
      },
      criterios: { create: ficha.criteriosCalificacion.map((c) => ({ criterio: c.criterio, ponderacion: c.ponderacion })) },
    };

    const guardada = await prisma.$transaction(async (tx) => {
      await tx.ficha.deleteMany({ where: { concursoId: concurso.id } });
      const nueva = await tx.ficha.create({ data: { concursoId: concurso.id, ...campos } });
      await tx.concurso.update({
        where: { id: concurso.id },
        data: { estadoSistema: requiereRevision ? EstadoSistema.REVISION_MANUAL : EstadoSistema.ANALIZADO },
      });
      return nueva;
    });

    // CU-04: con la ficha guardada se calcula la compatibilidad completa y los faltantes de cada perfil
    await recalcularCompatibilidad({ concursoIds: [concurso.id] });

    return reply.code(201).send({ fichaId: guardada.id, confianza, componentes, requiereRevision, umbral: config.FICHA_UMBRAL_CONFIANZA });
  });
}
