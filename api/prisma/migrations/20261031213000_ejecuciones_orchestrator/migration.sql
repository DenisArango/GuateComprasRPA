-- CU-12: las ejecuciones se sincronizan desde los trabajos de Orchestrator (una fila por trabajo)
CREATE UNIQUE INDEX "ejecucion_robot_job_key_key" ON "ejecucion_robot"("job_key");
CREATE INDEX "ejecucion_robot_inicio_idx" ON "ejecucion_robot"("inicio" DESC);
