import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { clasificarDocumento, detectarCambios, type DetalleConcurso } from '../../domain/detalle.js';
import { EstadoSistema, type Prisma } from '../../generated/prisma/client.js';

const Nog = z.object({ nog: z.string().regex(/^\d{6,}$/) });

/** Lo que VC.Concurso lee del detalle (ver domain/detalle.ts). */
const Detalle = z.object({
  titulo: z.string().nullable(),
  entidad: z.string().nullable(),
  unidadCompradora: z.string().nullable(),
  modalidad: z.string().nullable(),
  estadoGc: z.string().nullable(),
  montoEstimado: z.number().nonnegative().nullable(),
  fechaCierre: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable(),
  documentos: z.array(z.object({ nombre: z.string().min(1), publicadoEn: z.string().nullable() })),
  aclaraciones: z.number().int().nonnegative(),
  url: z.url().optional(),
});

/** Estados desde los que una captura lleva el concurso a CAPTURADO. */
const ANTES_DE_CAPTURA: (EstadoSistema | null)[] = [null, EstadoSistema.PRESELECCIONADO, EstadoSistema.ERROR_CAPTURA];

export async function rutasConcursos(app: FastifyInstance) {
  /**
   * PUT /robot/concursos/:nog/detalle · VC.Concurso envía lo que leyó del detalle.
   * La API guarda la instantánea, registra los cambios respecto a la anterior y devuelve
   * los hashes ya conocidos para que el robot suba solo los documentos nuevos (RN-02).
   */
  app.put('/robot/concursos/:nog/detalle', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const datos = Detalle.safeParse(request.body);
    if (!datos.success) return reply.code(400).send({ error: 'Detalle inválido', detalle: z.treeifyError(datos.error) });
    const { url, ...detalle } = datos.data;

    let concurso = await prisma.concurso.findUnique({ where: { nog } });
    if (!concurso) {
      // Captura manual (CU-13) de un NOG que no vino en el boletín
      if (!detalle.entidad || !detalle.titulo || !detalle.modalidad) {
        return reply.code(400).send({ error: 'Para un NOG nuevo se requieren titulo, entidad y modalidad' });
      }
      const entidad = await prisma.entidad.upsert({ where: { nombre: detalle.entidad }, create: { nombre: detalle.entidad }, update: {} });
      concurso = await prisma.concurso.create({
        data: {
          nog, entidadId: entidad.id, titulo: detalle.titulo, modalidad: detalle.modalidad, categorias: [],
          url: url ?? `https://www.guatecompras.gt/concursos/consultaConcurso.aspx?o=5&nog=${nog}`,
        },
      });
    }

    const primeraCaptura = concurso.instantanea === null;
    const cambios = detectarCambios(concurso.instantanea as DetalleConcurso | null, detalle);
    const registrados = await prisma.$transaction(async (tx) => {
      await tx.concurso.update({
        where: { id: concurso.id },
        data: {
          instantanea: detalle as Prisma.InputJsonValue,
          revisadoEn: new Date(),
          ...(detalle.titulo && { titulo: detalle.titulo }),
          ...(detalle.unidadCompradora && { unidadCompradora: detalle.unidadCompradora }),
          ...(detalle.estadoGc && { estadoGc: detalle.estadoGc }),
          ...(detalle.montoEstimado !== null && { montoEstimado: detalle.montoEstimado }),
          ...(detalle.fechaCierre && { fechaCierre: new Date(`${detalle.fechaCierre.slice(0, 10)}T00:00:00Z`) }),
          ...(ANTES_DE_CAPTURA.includes(concurso.estadoSistema) && { estadoSistema: EstadoSistema.CAPTURADO }),
        },
      });
      return Promise.all(
        cambios.map((c) =>
          tx.cambioConcurso.create({
            data: { concursoId: concurso.id, tipo: c.tipo, antes: c.antes as Prisma.InputJsonValue, despues: c.despues as Prisma.InputJsonValue },
          }),
        ),
      );
    });

    const documentos = await prisma.documento.findMany({ where: { concursoId: concurso.id }, select: { sha256: true } });
    return {
      concursoId: concurso.id,
      primeraCaptura,
      cambios: registrados.map((c) => ({ id: c.id, tipo: c.tipo, antes: c.antes, despues: c.despues })),
      hashesConocidos: documentos.map((d) => d.sha256),
    };
  });

  /**
   * POST /robot/concursos/:nog/documentos · sube un documento (multipart, campo "archivo").
   * La API calcula el SHA-256 y descarta duplicados del mismo concurso (RN-02).
   */
  app.post('/robot/concursos/:nog/documentos', async (request, reply) => {
    const { nog } = Nog.parse(request.params);
    const concurso = await prisma.concurso.findUnique({ where: { nog }, select: { id: true } });
    if (!concurso) return reply.code(404).send({ error: `Concurso ${nog} no registrado; envíe primero el detalle` });

    const archivo = await request.file({ limits: { fileSize: config.DOCUMENTO_MAX_MB * 1024 * 1024 } });
    if (!archivo) return reply.code(400).send({ error: 'Falta el archivo (campo "archivo")' });
    const contenido = await archivo.toBuffer();
    if (contenido.length === 0) return reply.code(422).send({ error: 'Archivo vacío' });

    const campo = (nombre: string) => {
      const valor = archivo.fields[nombre];
      return valor && 'value' in valor ? String(valor.value) : null;
    };
    const nombreOriginal = campo('nombre') ?? archivo.filename;
    const publicadoEn = campo('publicadoEn');
    const sha256 = createHash('sha256').update(contenido).digest('hex');

    const existente = await prisma.documento.findUnique({ where: { concursoId_sha256: { concursoId: concurso.id, sha256 } } });
    if (existente) return { documentoId: existente.id, sha256, nuevo: false };

    const relativa = path.join('documentos', nog, `${sha256}${path.extname(nombreOriginal).toLowerCase()}`);
    const destino = path.join(config.STORAGE_DIR, relativa);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(`${destino}.tmp`, contenido);
    await rename(`${destino}.tmp`, destino);

    try {
      const documento = await prisma.documento.create({
        data: {
          concursoId: concurso.id,
          nombreOriginal,
          tipo: clasificarDocumento(nombreOriginal),
          sha256,
          rutaAlmacen: relativa,
          tamanoBytes: contenido.length,
          publicadoEn: publicadoEn ? new Date(publicadoEn) : null,
        },
      });
      return reply.code(201).send({ documentoId: documento.id, sha256, tipo: documento.tipo, nuevo: true });
    } catch (error) {
      // Otra subida simultánea del mismo archivo ganó: el archivo en disco es el mismo y se conserva
      if ((error as { code?: string }).code === 'P2002') {
        const ganador = await prisma.documento.findUniqueOrThrow({ where: { concursoId_sha256: { concursoId: concurso.id, sha256 } } });
        return { documentoId: ganador.id, sha256, nuevo: false };
      }
      await rm(destino, { force: true });
      throw error;
    }
  });
}
