import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { hashContrasena } from '../routes/app/autenticacion.js';
import { recalcularCompatibilidad } from '../servicios/compatibilidad.js';

/** Datos de desarrollo: perfil de prueba y usuario administrador. Idempotente. */

const PERFIL_PRUEBA = {
  nombre: 'Empresa de prueba · insumos médicos y cómputo',
  nit: '1234567-8',
  categorias: ['Salud e insumos hospitalarios', 'Computación y telecomunicaciones'],
  palabrasClave: [
    'guante', 'jeringa', 'gasa', 'cateter', 'sutura', 'reactivo', 'mascarilla', 'insumos medicos',
    'computadora', 'laptop', 'impresora', 'servidor', 'toner', 'licencia de software',
  ],
  modalidades: ['Cotización', 'Licitación', 'Compra Directa'],
  departamentos: ['Guatemala', 'Sacatepéquez'],
  montoMin: 25000,
  montoMax: 900000,
};

/** Documentos de la empresa de prueba: uno vencido para que haya faltantes reales. */
const DOCUMENTOS = [
  { documentoNormalizado: 'RGAE', venceEn: new Date('2027-03-31T00:00:00Z') },
  { documentoNormalizado: 'RTU', venceEn: null },
  { documentoNormalizado: 'PATENTE_EMPRESA', venceEn: null },
  { documentoNormalizado: 'DECLARACION_JURADA', venceEn: null },
  { documentoNormalizado: 'SOLVENCIA_FISCAL', venceEn: new Date('2026-09-30T00:00:00Z') },
];

const existente = await prisma.perfilEmpresa.findFirst({ where: { nombre: PERFIL_PRUEBA.nombre } });
const perfil = existente
  ? await prisma.perfilEmpresa.update({ where: { id: existente.id }, data: PERFIL_PRUEBA })
  : await prisma.perfilEmpresa.create({ data: PERFIL_PRUEBA });
await prisma.documentoEmpresa.deleteMany({ where: { perfilId: perfil.id } });
await prisma.documentoEmpresa.createMany({ data: DOCUMENTOS.map((d) => ({ ...d, perfilId: perfil.id })) });
console.log(`Perfil de prueba listo (id ${perfil.id})`);

// El administrador ve todos los perfiles sin estar vinculado: los correos de la empresa no le llegan a él
const correo = (process.env.SEED_ADMIN_CORREO ?? 'admin@vigia.local').toLowerCase();
if (!(await prisma.usuario.findUnique({ where: { correo } }))) {
  const contrasena = process.env.SEED_ADMIN_CONTRASENA ?? randomBytes(9).toString('base64url');
  await prisma.usuario.create({ data: { correo, nombre: 'Administrador', rol: 'ADMIN', hashContrasena: await hashContrasena(contrasena) } });
  console.log(`Usuario creado: ${correo}${process.env.SEED_ADMIN_CONTRASENA ? '' : ` · contraseña: ${contrasena} (guárdala, no se vuelve a mostrar)`}`);
} else {
  await prisma.usuario.update({ where: { correo }, data: { perfiles: { set: [] } } });
  console.log(`Usuario existente: ${correo}`);
}

// Contacto de la empresa de prueba: recibe el resumen diario y los avisos de VC.Notificador
const proveedor = process.env.SEED_PROVEEDOR_CORREO?.toLowerCase();
if (proveedor) {
  await prisma.usuario.upsert({
    where: { correo: proveedor },
    create: {
      correo: proveedor, nombre: 'Contacto de la empresa de prueba', rol: 'PROVEEDOR',
      hashContrasena: await hashContrasena(randomBytes(18).toString('base64url')), perfiles: { connect: { id: perfil.id } },
    },
    update: { perfiles: { connect: { id: perfil.id } } },
  });
  console.log(`Contacto de la empresa: ${proveedor}`);
}

console.log(`Coincidencias completas recalculadas: ${await recalcularCompatibilidad({})}`);
await prisma.$disconnect();
