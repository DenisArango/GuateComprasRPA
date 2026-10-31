-- CreateEnum
CREATE TYPE "EstadoSistema" AS ENUM ('PRESELECCIONADO', 'CAPTURADO', 'TEXTO_EXTRAIDO', 'ANALIZADO', 'REVISION_MANUAL', 'NOTIFICADO', 'CERRADO', 'FINALIZADO', 'ERROR_CAPTURA');

-- CreateEnum
CREATE TYPE "EtapaCoincidencia" AS ENUM ('PRELIMINAR', 'COMPLETA');

-- CreateEnum
CREATE TYPE "EstadoEjecucion" AS ENUM ('EN_CURSO', 'EXITOSA', 'PARCIAL', 'FALLIDA');

-- CreateTable
CREATE TABLE "entidad" (
    "id" SERIAL NOT NULL,
    "codigo_gc" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT,
    "departamento" TEXT,

    CONSTRAINT "entidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concurso" (
    "id" SERIAL NOT NULL,
    "nog" VARCHAR(20) NOT NULL,
    "entidad_id" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "unidad_compradora" TEXT,
    "modalidad" VARCHAR(120) NOT NULL,
    "categorias" TEXT[],
    "monto_estimado" DECIMAL(14,2),
    "fecha_publicacion" DATE,
    "fecha_cierre" DATE,
    "estado_gc" VARCHAR(60),
    "estado_sistema" "EstadoSistema",
    "url" TEXT NOT NULL,
    "origen_boletin" JSONB,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisado_en" TIMESTAMP(3),

    CONSTRAINT "concurso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_empresa" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "categorias" TEXT[],
    "palabras_clave" TEXT[],
    "modalidades" TEXT[],
    "departamentos" TEXT[],
    "monto_min" DECIMAL(14,2),
    "monto_max" DECIMAL(14,2),
    "umbral_compatibilidad" INTEGER NOT NULL DEFAULT 60,
    "hora_resumen" TEXT NOT NULL DEFAULT '07:00',
    "canales" TEXT[] DEFAULT ARRAY['correo']::TEXT[],

    CONSTRAINT "perfil_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coincidencia" (
    "id" SERIAL NOT NULL,
    "concurso_id" INTEGER NOT NULL,
    "perfil_id" INTEGER NOT NULL,
    "etapa" "EtapaCoincidencia" NOT NULL,
    "puntaje" SMALLINT NOT NULL,
    "detalle" JSONB NOT NULL,
    "faltantes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notificado" BOOLEAN NOT NULL DEFAULT false,
    "calificacion_usuario" TEXT,
    "calculado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coincidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ejecucion_robot" (
    "id" SERIAL NOT NULL,
    "proceso" TEXT NOT NULL,
    "job_key" TEXT,
    "estado" "EstadoEjecucion" NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "elementos_exitosos" INTEGER NOT NULL DEFAULT 0,
    "excepciones_negocio" INTEGER NOT NULL DEFAULT 0,
    "excepciones_sistema" INTEGER NOT NULL DEFAULT 0,
    "concursos_nuevos" INTEGER NOT NULL DEFAULT 0,
    "documentos_descargados" INTEGER NOT NULL DEFAULT 0,
    "detalle" JSONB,

    CONSTRAINT "ejecucion_robot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entidad_nombre_key" ON "entidad"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "concurso_nog_key" ON "concurso"("nog");

-- CreateIndex
CREATE INDEX "concurso_estado_sistema_fecha_cierre_idx" ON "concurso"("estado_sistema", "fecha_cierre");

-- CreateIndex
CREATE INDEX "coincidencia_perfil_id_notificado_puntaje_idx" ON "coincidencia"("perfil_id", "notificado", "puntaje" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "coincidencia_concurso_id_perfil_id_etapa_key" ON "coincidencia"("concurso_id", "perfil_id", "etapa");

-- AddForeignKey
ALTER TABLE "concurso" ADD CONSTRAINT "concurso_entidad_id_fkey" FOREIGN KEY ("entidad_id") REFERENCES "entidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coincidencia" ADD CONSTRAINT "coincidencia_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coincidencia" ADD CONSTRAINT "coincidencia_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
