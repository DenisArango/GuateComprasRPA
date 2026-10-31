-- CreateTable
CREATE TABLE "expediente" (
    "id" SERIAL NOT NULL,
    "perfil_id" INTEGER NOT NULL,
    "concurso_id" INTEGER NOT NULL,
    "ruta" TEXT NOT NULL,
    "faltantes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duracion_seg" INTEGER NOT NULL,
    "generado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expediente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expediente_perfil_id_concurso_id_idx" ON "expediente"("perfil_id", "concurso_id");

-- AddForeignKey
ALTER TABLE "expediente" ADD CONSTRAINT "expediente_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expediente" ADD CONSTRAINT "expediente_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
