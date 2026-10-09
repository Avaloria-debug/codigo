/**
 * Fase 0 — Modelo de Escena.
 * Ver documento técnico Fase 0, sección 3.4.
 */

/**
 * @typedef {Object} Salida
 * @property {string} etiqueta
 * @property {string} escenaDestinoId
 */

/**
 * @typedef {Object} Escena
 * @property {string} id
 * @property {string} nombre
 * @property {string} descripcionBase - Descripción neutra, sin eventos activos (eso lo narra Fase 5).
 * @property {Salida[]} salidas - Puede ser vacío (escena sin salidas, ej. celda sellada).
 * @property {string[]} objetosPresentes - IDs de objeto. Puede ser vacío.
 * @property {string[]} npcsPresentes - IDs de NPC. Debe ser consistente con el ubicacionActual
 *   de cada NPC referenciado — eso lo chequea validarReferencias, no la estructura.
 * @property {string[]} eventosActivos - IDs de Evento, los llena y mantiene Fase 1.
 * @property {string|null} estadoCalculado - Placeholder. null hasta que Fase 2 lo calcule.
 * @property {string[]} coberturaDisponible - Etiquetas libres para ocultarse/emboscar (usa Fase 3).
 */

/**
 * Crea una Escena aplicando los defaults documentados. No inventa
 * valores para campos con significado propio (id, nombre,
 * descripcionBase): si se omiten, quedan undefined para que
 * validarEstructura los marque como faltantes.
 *
 * @param {Partial<Escena>} [datos]
 * @returns {Escena}
 */
export function crearEscena(datos = {}) {
  return {
    id: datos.id,
    nombre: datos.nombre,
    descripcionBase: datos.descripcionBase,
    salidas: datos.salidas ?? [],
    objetosPresentes: datos.objetosPresentes ?? [],
    npcsPresentes: datos.npcsPresentes ?? [],
    eventosActivos: datos.eventosActivos ?? [],
    estadoCalculado: datos.estadoCalculado ?? null,
    coberturaDisponible: datos.coberturaDisponible ?? [],
  };
}
