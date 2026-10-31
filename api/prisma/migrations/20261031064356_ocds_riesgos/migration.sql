-- CreateEnum
CREATE TYPE "EstadoCarga" AS ENUM ('EN_CURSO', 'EXITOSA', 'FALLIDA');

-- CreateTable
CREATE TABLE "ocds_proceso" (
    "id" SERIAL NOT NULL,
    "ocid" TEXT NOT NULL,
    "nog" VARCHAR(20),
    "comprador_id" TEXT NOT NULL,
    "comprador_nombre" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "modalidad" TEXT NOT NULL,
    "categoria" TEXT,
    "clasificaciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fecha_publicacion" TIMESTAMP(3),
    "inicio_ofertas" TIMESTAMP(3),
    "fin_ofertas" TIMESTAMP(3),
    "numero_ofertas" INTEGER,
    "estado" TEXT,
    "puntaje_riesgo" SMALLINT NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMP(3),

    CONSTRAINT "ocds_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocds_adjudicacion" (
    "id" SERIAL NOT NULL,
    "proceso_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "monto" DECIMAL(16,2),
    "fecha" TIMESTAMP(3),
    "estado" TEXT,

    CONSTRAINT "ocds_adjudicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" SERIAL NOT NULL,
    "identificador" TEXT NOT NULL,
    "nit" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicador_riesgo" (
    "id" SERIAL NOT NULL,
    "proceso_id" INTEGER NOT NULL,
    "codigo" VARCHAR(8) NOT NULL,
    "valor" DECIMAL(14,4) NOT NULL,
    "evidencia" TEXT NOT NULL,
    "calculado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicador_riesgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocds_carga" (
    "id" SERIAL NOT NULL,
    "anios" INTEGER[],
    "estado" "EstadoCarga" NOT NULL DEFAULT 'EN_CURSO',
    "etapa" TEXT NOT NULL DEFAULT 'iniciando',
    "registros" INTEGER NOT NULL DEFAULT 0,
    "indicadores" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),

    CONSTRAINT "ocds_carga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ocds_proceso_ocid_key" ON "ocds_proceso"("ocid");

-- CreateIndex
CREATE INDEX "ocds_proceso_comprador_nombre_fecha_publicacion_idx" ON "ocds_proceso"("comprador_nombre", "fecha_publicacion");

-- CreateIndex
CREATE INDEX "ocds_proceso_nog_idx" ON "ocds_proceso"("nog");

-- CreateIndex
CREATE INDEX "ocds_proceso_puntaje_riesgo_idx" ON "ocds_proceso"("puntaje_riesgo" DESC);

-- CreateIndex
CREATE INDEX "ocds_adjudicacion_proveedor_id_fecha_idx" ON "ocds_adjudicacion"("proveedor_id", "fecha");

-- CreateIndex
CREATE INDEX "ocds_adjudicacion_proceso_id_idx" ON "ocds_adjudicacion"("proceso_id");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_identificador_key" ON "proveedor"("identificador");

-- CreateIndex
CREATE INDEX "proveedor_nombre_idx" ON "proveedor"("nombre");

-- CreateIndex
CREATE INDEX "indicador_riesgo_codigo_idx" ON "indicador_riesgo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "indicador_riesgo_proceso_id_codigo_key" ON "indicador_riesgo"("proceso_id", "codigo");

-- AddForeignKey
ALTER TABLE "ocds_adjudicacion" ADD CONSTRAINT "ocds_adjudicacion_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ocds_proceso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocds_adjudicacion" ADD CONSTRAINT "ocds_adjudicacion_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicador_riesgo" ADD CONSTRAINT "indicador_riesgo_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ocds_proceso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Búsqueda por texto en el histórico (RF-WEB-06): trigramas sobre título, comprador y proveedor
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "ocds_proceso_titulo_trgm" ON "ocds_proceso" USING gin (lower("titulo") gin_trgm_ops);
CREATE INDEX "proveedor_nombre_trgm" ON "proveedor" USING gin (lower("nombre") gin_trgm_ops);
