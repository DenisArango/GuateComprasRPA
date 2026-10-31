-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('PROVEEDOR', 'ANALISTA', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstadoSeguimiento" AS ENUM ('SIGUIENDO', 'PARTICIPARE', 'DESCARTADO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "correo" TEXT NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'PROVEEDOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMP(3),
    "telegram_chat_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_empresa" (
    "id" SERIAL NOT NULL,
    "perfil_id" INTEGER NOT NULL,
    "documento_normalizado" TEXT NOT NULL,
    "vence_en" DATE,

    CONSTRAINT "documento_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seguimiento" (
    "id" SERIAL NOT NULL,
    "perfil_id" INTEGER NOT NULL,
    "concurso_id" INTEGER NOT NULL,
    "estado" "EstadoSeguimiento" NOT NULL,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seguimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PerfilEmpresaToUsuario" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_PerfilEmpresaToUsuario_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "documento_empresa_perfil_id_documento_normalizado_key" ON "documento_empresa"("perfil_id", "documento_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "seguimiento_perfil_id_concurso_id_key" ON "seguimiento"("perfil_id", "concurso_id");

-- CreateIndex
CREATE INDEX "_PerfilEmpresaToUsuario_B_index" ON "_PerfilEmpresaToUsuario"("B");

-- AddForeignKey
ALTER TABLE "documento_empresa" ADD CONSTRAINT "documento_empresa_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento" ADD CONSTRAINT "seguimiento_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimiento" ADD CONSTRAINT "seguimiento_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concurso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PerfilEmpresaToUsuario" ADD CONSTRAINT "_PerfilEmpresaToUsuario_A_fkey" FOREIGN KEY ("A") REFERENCES "perfil_empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PerfilEmpresaToUsuario" ADD CONSTRAINT "_PerfilEmpresaToUsuario_B_fkey" FOREIGN KEY ("B") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
