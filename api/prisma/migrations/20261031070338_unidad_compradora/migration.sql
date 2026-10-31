-- DropIndex
DROP INDEX "ocds_proceso_comprador_trgm";

-- DropIndex
DROP INDEX "ocds_proceso_titulo_trgm";

-- DropIndex
DROP INDEX "proveedor_nombre_trgm";

-- AlterTable
ALTER TABLE "ocds_proceso" ADD COLUMN     "unidad_id" TEXT,
ADD COLUMN     "unidad_nombre" TEXT;
