/**
 * Fase 0 — Modelo de Suceso (emergente).
 * Separado de Evento a propósito: un Suceso progresa solo con el
 * tiempo vía el scheduler que construye Fase 1, no reacciona a una
 * condición puntual. Ver documento técnico Fase 0, sección 3.6.
 */

/**
 * @typedef {Object} Suceso
 * @property {string} id
 * @property {string} tipo - Categoría libre (ej. "escasez_alimentos").
 * @property {"escena"|"global"} alcance
 * @property {string|null} escenaId - Obligatorio si alcance="escena"; debe ser null si alcance="global".
 * @property {number} progreso - 0 a 100.
 * @property {number} velocidadProgreso - Incremento por tick.
 * @property {string} condicionResolucion - Qué pasa cuando progreso llega a 100 (o antes).
 * @property {string|null} eventoGeneradoAlResolver - TIPO de Evento a instanciar (no un ID), o null.
 * @property {boolean} activo
 */

/**
 * Crea un Suceso. escenaId sólo se defaultea a null; si el llamador
 * pone alcance="escena" sin pasar escenaId, el objeto queda inválido
 * a propósito y lo tiene que atrapar validarEstructura, no este factory.
 *
 * @param {Partial<Suceso>} [datos]
 * @returns {Suceso}
 */
export function crearSuceso(datos = {}) {
  return {
    id: datos.id,
    tipo: datos.tipo,
    alcance: datos.alcance,
    escenaId: datos.escenaId ?? null,
    progreso: datos.progreso ?? 0,
    velocidadProgreso: datos.velocidadProgreso,
    condicionResolucion: datos.condicionResolucion,
    eventoGeneradoAlResolver: datos.eventoGeneradoAlResolver ?? null,
    activo: datos.activo ?? true,
  };
}
