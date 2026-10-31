/**
 * Precio por millón de tokens (USD) de los modelos de Claude que puede usar VC.Analisis
 * (precios publicados por Anthropic, octubre de 2026; ver docs/adr/0005-ia-claude.md).
 */
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  'claude-opus-5-5': { entrada: 4, salida: 20 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5 },
};

export function costoUsd(modelo: string, tokensEntrada: number, tokensSalida: number): number {
  const precio = PRECIOS[modelo];
  if (!precio) throw new Error(`Modelo sin precio registrado: ${modelo}`);
  return (tokensEntrada * precio.entrada + tokensSalida * precio.salida) / 1_000_000;
}

export const modelosConPrecio = Object.keys(PRECIOS);
