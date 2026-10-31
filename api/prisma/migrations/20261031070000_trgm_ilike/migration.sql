-- Los índices de trigramas sirven también para ILIKE si van sobre la columna (no sobre lower())
DROP INDEX IF EXISTS "ocds_proceso_titulo_trgm";
DROP INDEX IF EXISTS "proveedor_nombre_trgm";
CREATE INDEX "ocds_proceso_titulo_trgm" ON "ocds_proceso" USING gin ("titulo" gin_trgm_ops);
CREATE INDEX "ocds_proceso_comprador_trgm" ON "ocds_proceso" USING gin ("comprador_nombre" gin_trgm_ops);
CREATE INDEX "proveedor_nombre_trgm" ON "proveedor" USING gin ("nombre" gin_trgm_ops);
