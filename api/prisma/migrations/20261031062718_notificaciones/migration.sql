-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('RESUMEN', 'FICHA', 'CAMBIO', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstadoNotificacion" AS ENUM ('ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "notificacion" (
    "id" SERIAL NOT NULL,
    "perfil_id" INTEGER,
    "tipo" "TipoNotificacion" NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'correo',
    "estado" "EstadoNotificacion" NOT NULL,
    "destinatarios" TEXT[],
    "asunto" TEXT NOT NULL,
    "nogs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacion_perfil_id_enviado_en_idx" ON "notificacion"("perfil_id", "enviado_en");

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
