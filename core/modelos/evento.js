/**
 * Fase 0 — Modelo de Evento.
 * Ver documento técnico Fase 0, sección 3.5.
 */

/**
 * @typedef {Object} Evento
 * @property {string} id
 * @property {string} tipo - Categoría libre (ej. "incendio", "robo_testigo").
 * @property {string} escenaId - A qué escena afecta.
 * @property {number|null} duracion - En ticks. null = no expira solo por tiempo.
 * @property {string|null} condicionExpiracion - Descripción de la condición que lo resuelve.
 *   Regla dura: duracion y condicionExpiracion no pueden ser ambos null a la vez.
 * @property {boolean} activo
 * @property {Object} metadata - Objeto abierto, puede ser vacío.
 */

/**
 * Crea un Evento. duracion y condicionExpiracion sólo se defaultean a
 * null de forma independiente (no se inventa un valor que "arregle"
 * la regla de los dos-no-null-a-la-vez); si el llamador omite ambos,
 * el objeto resultante es inválido a propósito y validarEstructura
 * lo tiene que rechazar — eso es correcto, no un bug del factory.
 *
 * @param {Partial<Evento>} [datos]
 * @returns {Evento}
 */
export function crearEvento(datos = {}) {
  return {
    id: datos.id,
    tipo: datos.tipo,
    escenaId: datos.escenaId,
    duracion: datos.duracion ?? null,
    condicionExpiracion: datos.condicionExpiracion ?? null,
    activo: datos.activo ?? true,
    metadata: datos.metadata ?? {},
  };
}
