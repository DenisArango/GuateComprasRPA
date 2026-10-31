-- CreateEnum
CREATE TYPE "ValidadaPor" AS ENUM ('IA', 'HUMANO');

-- CreateTable
CREATE TABLE "ficha" (
    "id" SERIAL NOT NULL,
    "concurso_id" INTEGER NOT NULL,
    "resumen" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "monto" DECIMAL(14,2),
    "plazo_entrega" TEXT,
    "lugar_entrega" TEXT,
    "fecha_limite_ofertas" TIMESTAMP(3),
    "garantias" JSONB NOT NULL,
    "datos_completos" JSONB NOT NULL,
    "confianza" DECIMAL(3,2) NOT NULL,
    "componentes_confianza" JSONB NOT NULL,
    "validada_por" "ValidadaPor" NOT NULL,
    "tarea_action_center" TEXT,
    "modelo_ia" TEXT NOT NULL,
    "tokens_entrada" INTEGER NOT NULL,
    "tokens_salida" INTEGER NOT NULL,
    "costo_usd" DECIMAL(8,5) NOT NULL,
    "generado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ficha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisito" (
    "id" SERIAL NOT NULL,
    "ficha_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "documento_normalizado" TEXT,
    "obligatorio" BOOLEAN NOT NULL,
    "referencia" TEXT,
    "posible_restrictivo" BOOLEAN NOT NULL,
    "motivo_restrictivo" TEXT,

    CONSTRAINT "requisito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criterio_calificacion" (
    "id" SERIAL NOT NULL,
    "ficha_id" INTEGER NOT NULL,
    "criterio" TEXT NOT NULL,
    "ponderacion" DECIMAL(6,2),

    CONSTRAINT "criterio_calificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uso_ia" (
    "id" SERIAL NOT NULL,
    "concurso_id" INTEGER,
    "modelo" TEXT NOT NULL,
    "tokens_entrada" INTEGER NOT NULL,
    "tokens_salida" INTEGER NOT NULL,
    "costo_usd" DECIMAL(8,5) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uso_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ficha_concurso_id_key" ON "ficha"("concurso_id");

-- CreateIndex
CREATE INDEX "uso_ia_creado_en_idx" ON "uso_ia"("creado_en");

-- AddForeignKey
ALTER TABLE "ficha" ADD CONSTRAINT "ficha_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisito" ADD CONSTRAINT "requisito_ficha_id_fkey" FOREIGN KEY ("ficha_id") REFERENCES "ficha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterio_calificacion" ADD CONSTRAINT "criterio_calificacion_ficha_id_fkey" FOREIGN KEY ("ficha_id") REFERENCES "ficha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uso_ia" ADD CONSTRAINT "uso_ia_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concurso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
