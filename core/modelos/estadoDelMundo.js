/**
 * Fase 0 — Modelo de EstadoDelMundo.
 * Único por partida (objeto singular, no colección). Ver documento
 * técnico Fase 0, sección 3.7.
 */

/**
 * @typedef {Object} EstadoDelMundo
 * @property {number} horaActual - 0 a 23.
 * @property {number} diaActual - Días transcurridos desde el inicio de la partida.
 * @property {string} climaActual - Placeholder abierto (sugerido: despejado/lluvia/tormenta/niebla/nieve).
 * @property {string} faseLunar - Placeholder abierto, mismo criterio que clima.
 * @property {number} ticksTranscurridos - Contador global que usa el scheduler de Sucesos (Fase 1).
 */

/**
 * @param {Partial<EstadoDelMundo>} [datos]
 * @returns {EstadoDelMundo}
 */
export function crearEstadoDelMundo(datos = {}) {
  return {
    horaActual: datos.horaActual ?? 0,
    diaActual: datos.diaActual ?? 0,
    climaActual: datos.climaActual ?? 'despejado',
    faseLunar: datos.faseLunar ?? 'nueva',
    ticksTranscurridos: datos.ticksTranscurridos ?? 0,
  };
}
