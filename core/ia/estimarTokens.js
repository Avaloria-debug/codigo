/**
 * Fase 6 — Estimación de tokens por heurística de caracteres.
 * chars/3.5 (más conservador que chars/4, por el español con tildes y
 * signos de apertura). NO usa el tokenizador real de Groq — es una
 * estimación previa a la llamada; después de cada respuesta real, la
 * cola registra `usage.total_tokens` si el servidor lo devuelve.
 */

export const CARACTERES_POR_TOKEN = 3.5;
const OVERHEAD_POR_MENSAJE = 4;
const OVERHEAD_BASE = 3;

/** @param {string|null|undefined} texto */
export function estimarTokens(texto) {
  if (!texto) return 0;
  return Math.ceil(String(texto).length / CARACTERES_POR_TOKEN);
}

/** @param {{content: string}[]} mensajes */
export function estimarTokensMensajes(mensajes) {
  return mensajes.reduce((acc, m) => acc + estimarTokens(m.content) + OVERHEAD_POR_MENSAJE, OVERHEAD_BASE);
}
