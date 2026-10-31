/** Minúsculas, sin tildes y con espacios simples, para comparar textos del portal con los perfiles. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Palabras clave del perfil que aparecen en el texto. Coinciden al inicio de palabra,
 * así "guante" encuentra "guantes" pero "red" no encuentra "credito".
 */
export function palabrasEncontradas(texto: string, palabrasClave: readonly string[]): string[] {
  const t = normalizar(texto);
  return palabrasClave.filter((p) => {
    const clave = normalizar(p);
    if (!clave) return false;
    const escapada = clave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapada}`, 'u').test(t);
  });
}
