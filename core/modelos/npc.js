/**
 * Fase 0 — Modelo de NPC (incluye Relación y Conocimiento embebidos).
 * Ver documento técnico Fase 0, secciones 3.2 y 3.3.
 */

/**
 * @typedef {Object} EntradaHistorialRelacion
 * @property {string} eventoId
 * @property {number} delta
 * @property {string} momento
 */

/**
 * @typedef {Object} Relacion
 * @property {number} valor - Escala numérica. Rango y categorías los define Fase 4.
 * @property {EntradaHistorialRelacion[]} historialRelevante - Puede ser vacío.
 */

/**
 * @typedef {Object} Conocimiento
 * @property {string} id
 * @property {string} contenido
 * @property {"publico"|"requiereRelacion"|"requiereEvento"} nivelAcceso
 * @property {number|null} umbralRelacion - Solo tiene sentido si nivelAcceso="requiereRelacion".
 * @property {string|null} eventoDisparadorId - Obligatorio (no null) si nivelAcceso="requiereEvento".
 */

/**
 * @typedef {Object} NPC
 * @property {string} id
 * @property {string} nombre
 * @property {string} arquetipo - Categoría libre.
 * @property {string} personalidadBase - Texto corto, recomendado <300 caracteres (no se fuerza como error).
 * @property {string} estadoEmocional - Placeholder libre hasta que Fase 4 cierre la lista. Default "neutral".
 * @property {Relacion} relacion
 * @property {string|null} ubicacionActual - ID de Escena, o null si el NPC no está en el mundo activo.
 * @property {Conocimiento[]} conocimientos - Puede ser vacío.
 * @property {boolean} activo
 */

/**
 * @param {Partial<Relacion>} [datos]
 * @returns {Relacion}
 */
export function crearRelacion(datos = {}) {
  return {
    valor: datos.valor ?? 0,
    historialRelevante: datos.historialRelevante ?? [],
  };
}

/**
 * Crea un NPC aplicando los defaults documentados. No inventa valores
 * para campos con significado propio (id, nombre, arquetipo,
 * personalidadBase): si se omiten, quedan undefined para que
 * validarEstructura los marque como faltantes.
 *
 * @param {Partial<NPC>} [datos]
 * @returns {NPC}
 */
export function crearNPC(datos = {}) {
  return {
    id: datos.id,
    nombre: datos.nombre,
    arquetipo: datos.arquetipo,
    personalidadBase: datos.personalidadBase,
    estadoEmocional: datos.estadoEmocional ?? 'neutral',
    relacion: datos.relacion ?? crearRelacion(),
    ubicacionActual: datos.ubicacionActual ?? null,
    conocimientos: datos.conocimientos ?? [],
    activo: datos.activo ?? true,
  };
}
