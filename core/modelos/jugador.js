/**
 * Fase 0 — Modelo de Jugador.
 * Ver documento técnico Fase 0, sección 3.1.
 */

/**
 * @typedef {Object} ItemInventario
 * @property {string} objetoId
 * @property {number} cantidad
 */

/**
 * @typedef {Object} Jugador
 * @property {string} id - Identificador único, estable.
 * @property {string} nombre
 * @property {string} ubicacionActual - ID de Escena. No nullable (el jugador siempre está en algún lado).
 * @property {ItemInventario[]} inventario - Puede ser vacío.
 * @property {Object<string, number>} atributos - Objeto abierto, puede ser vacío. El cascarón no impone qué claves existen.
 * @property {Object<string, (boolean|number|string)>} flags - Objeto abierto, puede ser vacío.
 */

/**
 * Crea un Jugador aplicando únicamente los defaults documentados
 * (campos "puede ser vacío"). No inventa valores para campos con
 * significado propio (id, nombre, ubicacionActual): si se omiten,
 * quedan undefined y validarEstructura los va a marcar como faltantes.
 *
 * @param {Partial<Jugador>} [datos]
 * @returns {Jugador}
 */
export function crearJugador(datos = {}) {
  return {
    id: datos.id,
    nombre: datos.nombre,
    ubicacionActual: datos.ubicacionActual,
    inventario: datos.inventario ?? [],
    atributos: datos.atributos ?? {},
    flags: datos.flags ?? {},
  };
}
