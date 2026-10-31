-- AlterTable
ALTER TABLE "perfil_empresa" ADD COLUMN     "telegram_chats" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "vinculo_telegram" (
    "codigo" TEXT NOT NULL,
    "perfil_id" INTEGER NOT NULL,
    "vence_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vinculo_telegram_pkey" PRIMARY KEY ("codigo")
);

-- AddForeignKey
ALTER TABLE "vinculo_telegram" ADD CONSTRAINT "vinculo_telegram_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "perfil_empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
