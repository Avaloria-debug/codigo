/**
 * Fase 6 — Post-procesamiento mínimo de la respuesta de la IA.
 *
 * - Vacía o sólo espacios → null (la cola lo trata como error y cae a mock).
 * - `finish_reason === "length"` (se cortó por max_completion_tokens) →
 *   se recorta a la última oración completa. Si no hay ninguna marca de
 *   fin de oración, se conserva el texto tal cual (supuesto: mejor una
 *   frase cortada que nada; ajustable).
 *
 * No hay validación semántica (ver doc técnico, sección 3.3).
 *
 * @param {string|null|undefined} texto
 * @param {string|null} [finishReason]
 * @returns {{ texto: string, recortado: boolean } | null}
 */
export function limpiarRespuesta(texto, finishReason = null) {
  if (typeof texto !== 'string') return null;
  const limpio = texto.trim();
  if (limpio === '') return null;

  if (finishReason === 'length') {
    const m = limpio.match(/^[\s\S]*[.!?…]["”»')]*/);
    if (m && m[0].trim() !== '' && m[0].length < limpio.length) {
      return { texto: m[0].trim(), recortado: true };
    }
  }
  return { texto: limpio, recortado: false };
}
