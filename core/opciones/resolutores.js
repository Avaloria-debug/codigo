/**
 * Fase 3 — Resuelve arrays de IDs (Fase 0: jugador.inventario,
 * escena.objetosPresentes, escena.npcsPresentes) contra las
 * entidades completas que representan. Ver documento técnico,
 * sección 4.6 (ampliación de contrato) y fase_3_ADENDUM.md, sección 4.
 */

/**
 * @param {object[]} objetos - dataset.objetos
 * @returns {Map<string, object>}
 */
export function construirObjetosPorId(objetos = []) {
  return new Map(objetos.map((o) => [o.id, o]));
}

/**
 * @param {object[]} npcs - dataset.npcs
 * @returns {Map<string, object>}
 */
export function construirNpcsPorId(npcs = []) {
  return new Map(npcs.map((n) => [n.id, n]));
}
