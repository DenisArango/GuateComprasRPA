-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('BASES', 'ESPECIFICACIONES', 'ANEXO', 'ADENDA', 'ACLARACION', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoCambio" AS ENUM ('DOCUMENTO', 'FECHA', 'ESTADO', 'ACLARACION');

-- AlterTable
ALTER TABLE "concurso" ADD COLUMN     "instantanea" JSONB;

-- CreateTable
CREATE TABLE "documento" (
    "id" SERIAL NOT NULL,
    "concurso_id" INTEGER NOT NULL,
    "nombre_original" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "ruta_almacen" TEXT NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "paginas" INTEGER,
    "requiere_ocr" BOOLEAN,
    "texto_extraido" TEXT,
    "publicado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambio_concurso" (
    "id" SERIAL NOT NULL,
    "concurso_id" INTEGER NOT NULL,
    "tipo" "TipoCambio" NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "resumen_ia" TEXT,
    "detectado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambio_concurso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documento_concurso_id_sha256_key" ON "documento"("concurso_id", "sha256");

-- CreateIndex
CREATE INDEX "cambio_concurso_concurso_id_detectado_en_idx" ON "cambio_concurso"("concurso_id", "detectado_en");

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambio_concurso" ADD CONSTRAINT "cambio_concurso_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
