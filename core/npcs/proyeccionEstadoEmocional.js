/**
 * Fase 4 — Proyección de los dos ejes internos (temor, disposición) al
 * string único `estadoEmocional` que expone el esquema NPC (Fase 0).
 * Ver doc técnico Fase 4, sección 2.
 *
 * nivelTemor y nivelDisposicion NO son parte del esquema NPC de Fase 0
 * (doc técnico, sección 2: "metadata operativa interna de esta fase,
 * no forman parte del esquema NPC") — viven en el estado interno de
 * motorNPCs.js, no en el objeto NPC. Lo único que se escribe de
 * vuelta al NPC es el string ya proyectado (`estadoEmocional`).
 */

export const NIVEL_TEMOR_MIN = 0;
export const NIVEL_TEMOR_MAX = 2;
export const NIVEL_DISPOSICION_MIN = -2;
export const NIVEL_DISPOSICION_MAX = 1;

export function clampTemor(valor) {
  return Math.min(NIVEL_TEMOR_MAX, Math.max(NIVEL_TEMOR_MIN, valor));
}

export function clampDisposicion(valor) {
  return Math.min(NIVEL_DISPOSICION_MAX, Math.max(NIVEL_DISPOSICION_MIN, valor));
}

/**
 * Tabla de proyección (doc técnico, sección 2, "prioridad de mayor a
 * menor"). El orden de los `if` ES la tabla de prioridad — no
 * reordenar sin revisar el doc primero.
 *
 * Un NPC puede tener nivelDisposicion=1 y nivelTemor=2 al mismo
 * tiempo: el resultado es "alarmado" (prioridad 1) sin que eso borre
 * la disposición — cuando nivelTemor vuelve a 0, el resultado vuelve
 * a reflejar la disposición ("alegre") porque nunca se perdió ese
 * valor, sólo quedó tapado por una prioridad mayor.
 *
 * @param {number} nivelTemor - 0 a 2.
 * @param {number} nivelDisposicion - -2 a 1.
 * @returns {"alarmado"|"hostil"|"temeroso"|"molesto"|"alegre"|"neutral"}
 */
export function proyectarEstadoEmocional(nivelTemor, nivelDisposicion) {
  if (nivelTemor === 2) return 'alarmado';
  if (nivelDisposicion === -2) return 'hostil';
  if (nivelTemor === 1) return 'temeroso';
  if (nivelDisposicion === -1) return 'molesto';
  if (nivelDisposicion === 1) return 'alegre';
  return 'neutral';
}
